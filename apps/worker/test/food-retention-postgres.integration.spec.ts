import { randomUUID, createHash } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService, FoodImageRetentionService } from '@atlas/backend';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const withDatabase = databaseUrl ? describe : describe.skip;
withDatabase('Terminal food photo retention on actual PostgreSQL', () => {
  let admin: DatabaseService,
    db: DatabaseService,
    schema: string,
    userId: string,
    walletId: string;
  let migration: string;
  const now = new Date(Date.now() + 86400000);
  const ago = (days: number) => new Date(now.getTime() - days * 86400000);
  beforeEach(async () => {
    admin = new DatabaseService(databaseUrl!);
    schema = `retention_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`create schema "${schema}"`);
    const url = new URL(databaseUrl!);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    db = new DatabaseService(url.toString());
    const dir = resolve(__dirname, '../../../database/migrations');
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(resolve(dir, name), 'utf8');
      if (name === '0015_food_photo_retention.sql') migration = sql;
      else await db.query(sql);
    }
    userId = randomUUID();
    walletId = randomUUID();
    await db.query(
      "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
      [userId, `${userId}@example.test`, randomUUID()],
    );
    await db.query('insert into token_wallets(id,user_id) values($1,$2)', [
      walletId,
      userId,
    ]);
    await db.query(
      "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)",
      [randomUUID(), walletId, userId, randomUUID()],
    );
  });
  afterEach(async () => {
    await db?.onApplicationShutdown();
    if (schema) await admin.query(`drop schema "${schema}" cascade`);
    await admin?.onApplicationShutdown();
  });
  async function fixture(status = 'analyzed', terminal: Date | null = ago(30)) {
    const imageId = randomUUID(),
      analysisId = randomUUID(),
      original = `food/${userId}/${imageId}/hash`,
      staging = `food-staging/${userId}/${imageId}`;
    await db.query(
      "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status,created_at,uploaded_at) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available',$5,$5)",
      [imageId, userId, original, '0'.repeat(64), ago(40)],
    );
    await db.query(
      "insert into food_analyses(id,user_id,uploaded_image_id,status,runtime_adapter,recognized_result,suitability_result,analyzed_at) values($1,$2,$3,$4,'fake','{}','{}',$5)",
      [
        analysisId,
        userId,
        imageId,
        status,
        status === 'analyzed' ? terminal : null,
      ],
    );
    return { imageId, analysisId, original, staging };
  }
  function storage() {
    return { deleteObject: jest.fn().mockResolvedValue(undefined) };
  }
  function food() {
    return new FoodService(db, { execute: async () => ({ userId }) } as never, {
      enabled: true,
      endpoint: 'http://127.0.0.1:1',
      region: 'test',
      bucket: 'test',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      forcePathStyle: true,
      runtimeAdapter: 'fake',
      consentVersion: 'test',
    });
  }

  it('captures terminal transitions immutably and skips unproven historical times', async () => {
    const historic = await fixture('technicalError', null),
      pending = await fixture('processing', null);
    await db.query(migration);
    expect(
      (
        await db.query('select terminal_at from food_analyses where id=$1', [
          historic.analysisId,
        ])
      ).rows[0],
    ).toEqual({ terminal_at: null });
    await db.query(
      "update food_analyses set status='technicalError' where id=$1",
      [pending.analysisId],
    );
    const terminal = (
      await db.query<{ terminal_at: Date }>(
        'select terminal_at from food_analyses where id=$1',
        [pending.analysisId],
      )
    ).rows[0]!.terminal_at;
    expect(terminal).toBeInstanceOf(Date);
    await expect(
      db.query(
        "update food_analyses set terminal_at=terminal_at+interval '1 day' where id=$1",
        [pending.analysisId],
      ),
    ).rejects.toThrow('immutable');
    await db.query(
      "update food_analyses set updated_at=now()+interval '10 days' where id=$1",
      [pending.analysisId],
    );
    expect(
      (
        await db.query<{ terminal_at: Date }>(
          'select terminal_at from food_analyses where id=$1',
          [pending.analysisId],
        )
      ).rows[0]!.terminal_at,
    ).toEqual(terminal);
    const result = await new FoodImageRetentionService(
      db,
      storage(),
    ).enqueueDue(now);
    expect(result).toEqual({ enqueued: 0, skippedUnknownTerminalTime: 1 });
  });

  it('uses the 30-day terminal boundary, skips recent, pending, unknown and never-analyzed images', async () => {
    const due = await fixture();
    await fixture('analyzed', ago(29));
    await fixture('processing');
    await fixture('outcomeUnknown');
    const never = await fixture('queued');
    await db.query('delete from food_analyses where id=$1', [never.analysisId]);
    await db.query(migration);
    await db.query('update food_analyses set updated_at=$2 where id=$1', [
      due.analysisId,
      now,
    ]);
    const port = storage(),
      retention = new FoodImageRetentionService(db, port);
    expect(
      (await retention.enqueueDue(new Date(now.getTime() - 1))).enqueued,
    ).toBe(0);
    expect((await retention.enqueueDue(now)).enqueued).toBe(1);
    expect((await retention.enqueueDue(now)).enqueued).toBe(0);
    await retention.processOne(now);
    expect(port.deleteObject.mock.calls.map((c) => c[0])).toEqual([
      due.original,
      due.staging,
    ]);
    expect(
      (
        await db.query('select status from uploaded_images where id=$1', [
          due.imageId,
        ])
      ).rows[0],
    ).toEqual({ status: 'deleted' });
  });

  it('backfills technical failure from the refund ledger and retains ledger plus confirmed food history', async () => {
    const due = await fixture('technicalError'),
      confirmed = await fixture();
    const reservation = randomUUID();
    await db.query(
      "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,food_analysis_id) values($1,$2,$3,'aiReservation',-5,'foodAnalysis',$4,$4)",
      [reservation, walletId, userId, due.analysisId],
    );
    await db.query(
      "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,food_analysis_id,reservation_id,created_at) values($1,$2,$3,'aiRefund',5,'foodAnalysis',$4,$4,$5,$6)",
      [randomUUID(), walletId, userId, due.analysisId, reservation, ago(31)],
    );
    await db.query(
      "insert into food_consumptions(id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result) values($1,$2,$3,$4,'2026-08-01','UTC','{}')",
      [randomUUID(), userId, confirmed.analysisId, ago(30)],
    );
    await db.query(migration);
    expect(
      (
        await db.query<{ terminal_at: Date }>(
          'select terminal_at from food_analyses where id=$1',
          [due.analysisId],
        )
      ).rows[0]!.terminal_at,
    ).toEqual(ago(31));
    const retention = new FoodImageRetentionService(db, storage());
    await retention.enqueueDue(now);
    await retention.processOne(now);
    await retention.processOne(now);
    expect(
      (await db.query('select count(*)::int count from token_transactions'))
        .rows[0],
    ).toEqual({ count: 3 });
    expect(
      (
        await db.query(
          'select count(*)::int count from food_consumptions where deleted_at is null',
        )
      ).rows[0],
    ).toEqual({ count: 1 });
    expect(
      (await db.query('select count(*)::int count from food_analyses')).rows[0],
    ).toEqual({ count: 2 });
  });

  it('retries partial storage deletion after restart and prevents using an image claimed for cleanup', async () => {
    const due = await fixture();
    await db.query(migration);
    const port = storage();
    port.deleteObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('synthetic S3 failure'));
    const retention = new FoodImageRetentionService(db, port);
    await retention.enqueueDue(now);
    await retention.processOne(now);
    expect(
      (await db.query('select status,attempts from food_image_cleanup_jobs'))
        .rows[0],
    ).toEqual({ status: 'queued', attempts: 1 });
    await expect(
      food().completeUpload('owner', due.imageId),
    ).rejects.toMatchObject({ code: 'FOOD_IMAGE_NOT_FOUND' });
    const price = await food().price('owner');
    await expect(
      food().createAnalysis('owner', randomUUID(), {
        uploadedImageId: due.imageId,
        expectedTokenPrice: price.tokenPrice,
        expectedPriceVersion: price.priceVersion,
      }),
    ).rejects.toMatchObject({ code: 'FOOD_IMAGE_NOT_READY' });
    const restarted = new FoodImageRetentionService(db, port);
    expect(await restarted.processOne(now)).toBe(false);
    expect(await restarted.processOne(new Date(now.getTime() + 60000))).toBe(
      true,
    );
    expect(port.deleteObject.mock.calls.map((c) => c[0])).toEqual([
      due.original,
      due.staging,
      due.original,
      due.staging,
    ]);
    expect(
      (await db.query('select status,attempts from food_image_cleanup_jobs'))
        .rows[0],
    ).toEqual({ status: 'completed', attempts: 2 });
    expect(await restarted.processOne(new Date(now.getTime() + 120000))).toBe(
      false,
    );
  });

  it('does not recreate an object when an old upload completion resumes after retention claimed the image', async () => {
    const due=await fixture();
    await db.query(migration);
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64');
    const sha=createHash('sha256').update(bytes).digest('hex');
    await db.query("update uploaded_images set status='pendingUpload',object_key=$2,content_type='image/png',size_bytes=$3,sha256=$4 where id=$1",[due.imageId,due.staging,bytes.length,sha]);
    let entered!:()=>void,release!:()=>void;
    const downloading=new Promise<void>(resolve=>{entered=resolve;});
    const unblock=new Promise<void>(resolve=>{release=resolve;});
    const send=jest.spyOn(S3Client.prototype,'send').mockImplementation((async(command:unknown)=>{
      if(command instanceof HeadObjectCommand)return {ContentLength:bytes.length,ContentType:'image/png',Metadata:{sha256:sha}};
      if(command instanceof GetObjectCommand){entered();await unblock;return {Body:{transformToByteArray:async()=>bytes}};}
      throw new Error('Unexpected storage mutation by stale upload');
    }) as never);
    try {
      const completion=food().completeUpload('owner',due.imageId).then(()=>null,error=>error);
      await downloading;
      // Another upload completion had already produced the terminal analysis;
      // this delayed request still holds an old staging snapshot.
      await db.query("update uploaded_images set status='available',object_key=$2 where id=$1",[due.imageId,due.original]);
      const retention=new FoodImageRetentionService(db,storage());
      await retention.enqueueDue(now);await retention.processOne(now);
      release();
      expect(await completion).toMatchObject({code:'FOOD_IMAGE_NOT_FOUND'});
      expect(send.mock.calls.some(call=>call[0] instanceof PutObjectCommand)).toBe(false);
      expect((await db.query('select status from uploaded_images where id=$1',[due.imageId])).rows[0]).toEqual({status:'deleted'});
    } finally {release();send.mockRestore();}
  });

  it('rechecks analysis state after enqueue and defers cleanup if the outcome becomes ambiguous', async () => {
    const due=await fixture();await db.query(migration);
    const port=storage(),retention=new FoodImageRetentionService(db,port);
    await retention.enqueueDue(now);
    await db.query("update food_analyses set status='outcomeUnknown' where id=$1",[due.analysisId]);
    expect(await retention.processOne(now)).toBe(false);
    expect(port.deleteObject).not.toHaveBeenCalled();
    expect((await db.query('select deleted_at from uploaded_images where id=$1',[due.imageId])).rows[0]).toEqual({deleted_at:null});
    expect((await db.query('select status,attempts from food_image_cleanup_jobs')).rows[0]).toEqual({status:'queued',attempts:0});
  });

  it('reclaims expired cleanup leases idempotently but skips a live lease and recent uploads', async () => {
    const due = await fixture(),
      recentUpload = await fixture();
    await db.query('update uploaded_images set uploaded_at=$2 where id=$1', [
      recentUpload.imageId,
      new Date(now.getTime() - 300000),
    ]);
    await db.query(migration);
    const port = storage(),
      retention = new FoodImageRetentionService(db, port);
    expect((await retention.enqueueDue(now)).enqueued).toBe(1);
    await db.query(
      "update food_image_cleanup_jobs set status='processing',lease_id=gen_random_uuid(),lease_expires_at=$1",
      [new Date(now.getTime() + 60000)],
    );
    expect(await retention.processOne(now)).toBe(false);
    expect(await retention.processOne(new Date(now.getTime() + 60000))).toBe(
      true,
    );
    expect(port.deleteObject).toHaveBeenCalledTimes(2);
    await expect(
      db.query(
        "update food_image_cleanup_jobs set original_object_key='changed'",
      ),
    ).rejects.toThrow('immutable');
    expect(
      (
        await db.query('select deleted_at from uploaded_images where id=$1', [
          recentUpload.imageId,
        ])
      ).rows[0],
    ).toEqual({ deleted_at: null });
    expect(
      (
        await db.query('select status from uploaded_images where id=$1', [
          due.imageId,
        ])
      ).rows[0],
    ).toEqual({ status: 'deleted' });
  });
});
