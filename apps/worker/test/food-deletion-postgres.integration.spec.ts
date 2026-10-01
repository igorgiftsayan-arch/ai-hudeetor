import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '@atlas/backend';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { FoodImageRetentionService } from '../../../packages/backend/src/food/application/food-image-retention.service';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  'Terminal food deletion on actual PostgreSQL migrations',
  () => {
    let admin: DatabaseService;
    let database: DatabaseService;
    let schema: string;
    let userId: string;
    let imageId: string;
    let service: FoodService;
    const config = {
      enabled: true,
      endpoint: 'http://127.0.0.1:1',
      region: 'test',
      bucket: 'test',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      forcePathStyle: true,
      runtimeAdapter: 'fake' as const,
      consentVersion: 'test',
    };
    beforeEach(async () => {
      admin = new DatabaseService(databaseUrl!);
      schema = `food_deletion_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`create schema "${schema}"`);
      const url = new URL(databaseUrl!);
      url.searchParams.set('options', `-c search_path=${schema},public`);
      database = new DatabaseService(url.toString());
      const migrations = resolve(__dirname, '../../../database/migrations');
      for (const name of (await readdir(migrations))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await database.query(await readFile(resolve(migrations, name), 'utf8'));
      }
      userId = randomUUID();
      imageId = randomUUID();
      const walletId = randomUUID();
      await database.query(
        "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
        [userId, `${userId}@example.test`, randomUUID()],
      );
      await database.query(
        'insert into token_wallets(id,user_id) values($1,$2)',
        [walletId, userId],
      );
      await database.query(
        "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)",
        [randomUUID(), walletId, userId, randomUUID()],
      );
      await database.query(
        "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available')",
        [imageId, userId, `test/${imageId}`, '0'.repeat(64)],
      );
      service = new FoodService(
        database,
        { execute: async () => ({ userId }) } as never,
        config,
      );
    });
    afterEach(async () => {
      await database?.onApplicationShutdown();
      if (schema) await admin.query(`drop schema "${schema}" cascade`);
      await admin?.onApplicationShutdown();
    });
    async function analyze(mode: 'success' | 'technicalError') {
      const price = await service.price('owner');
      const input = {
        uploadedImageId: imageId,
        expectedTokenPrice: price.tokenPrice,
        expectedPriceVersion: price.priceVersion,
      };
      const key = randomUUID();
      const created = await service.createAnalysis('owner', key, input);
      expect(await service.createAnalysis('owner', key, input)).toEqual(
        created,
      );
      expect(await service.listConsumptions('owner')).toEqual({ items: [] });
      const outbox = await database.query<{ id: string }>(
        "select id from outbox_messages where aggregate_id=$1 and event_type='food.analysis_requested.v1'",
        [created.id],
      );
      expect(outbox.rowCount).toBe(1);
      const processor = new FoodAnalysisProcessor(database, {
        provider: 'fake',
        fakeMode: mode,
        nativeBaseUrl: 'http://127.0.0.1:1',
        modelVersion: 'test',
        timeoutMs: 100,
      });
      const job = { data: { outboxId: outbox.rows[0]!.id } } as Parameters<
        FoodAnalysisProcessor['process']
      >[0];
      await processor.process(job);
      await processor.process(job);
      return { created, price };
    }
    it('erases result and receipt irreversibly, blocks old content replays, preserves photo, ledger and consumption', async () => {
      const {created} = await analyze('success');
      const confirmKey = randomUUID();
      const consumedAt = '2026-09-23T18:00:00Z';
      const consumed = await service.confirmConsumption('owner',confirmKey,created.id,consumedAt,'UTC');
      const editKey = randomUUID();
      const edit = {consumedAt,timezone:'UTC',confirmedResult:{items:[{name:'Synthetic meal'}]}};
      const edited = await service.updateConsumption('owner',editKey,consumed.id,edit);
      const before = (await database.query('select * from token_transactions order by id')).rows;
      const receipt = (await database.query('select * from food_analysis_request_receipts where food_analysis_id=$1',[created.id])).rows[0]!;
      const key = randomUUID();
      expect(await service.deleteAnalysis('owner',key,created.id)).toEqual({analysisId:created.id,analysisStatus:'deleted',photoStatus:'available',cancellationStatus:'notCancelled'});
      expect(await service.deleteAnalysis('owner',key,created.id)).toEqual(await service.deletionStatus('owner',created.id));
      await expect(service.getAnalysis('owner',created.id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_NOT_FOUND'});
      await expect(service.confirmConsumption('owner',confirmKey,created.id,consumedAt,'UTC')).rejects.toMatchObject({code:'FOOD_CONTENT_DELETED',status:410});
      await expect(service.updateConsumption('owner',editKey,consumed.id,edit)).rejects.toMatchObject({code:'FOOD_CONTENT_DELETED'});
      expect((await service.listConsumptions('owner')).items).toEqual([edited]);
      expect((await database.query('select * from token_transactions order by id')).rows).toEqual(before);
      const after = (await database.query('select * from food_analysis_request_receipts where food_analysis_id=$1',[created.id])).rows[0]!;
      expect(after).toEqual({...receipt,request_payload:null,content_deleted_at:expect.any(Date)});
      expect((await database.query('select recognized_result,suitability_result,user_correction,status from food_analyses where id=$1',[created.id])).rows[0]).toEqual({recognized_result:null,suitability_result:null,user_correction:null,status:'analyzed'});
      await expect(database.query('update food_analysis_request_receipts set request_payload=$2,content_deleted_at=null where food_analysis_id=$1',[created.id,receipt.request_payload])).rejects.toThrow('may only be erased');
      await expect(database.query("update food_analysis_request_receipts set request_hash=repeat('f',64) where food_analysis_id=$1",[created.id])).rejects.toThrow('identity is immutable');
    });

    it.each(['success','technicalError'] as const)('photo request for %s tombstones immediately, retries storage after restart and leaves analysis intact', async(mode) => {
      const {created} = await analyze(mode);
      const now = new Date();
      await database.query("update uploaded_images set uploaded_at=now()-interval '11 minutes',created_at=now()-interval '11 minutes' where id=$1",[imageId]);
      const key=randomUUID();
      expect(await service.deletePhoto('owner',key,created.id)).toEqual({analysisId:created.id,photoStatus:'pending',analysisStatus:'available',cancellationStatus:'notCancelled'});
      expect((await service.getAnalysis('owner',created.id)).status).toBe(mode==='success'?'analyzed':'technicalError');
      await expect(service.completeUpload('owner',imageId)).rejects.toMatchObject({code:'FOOD_IMAGE_NOT_FOUND'});
      const initial=(await database.query('select * from food_image_cleanup_jobs where image_id=$1',[imageId])).rows[0]!;
      expect(initial.reason).toBe('userRequest');
      expect(initial.deadline_at.valueOf()-initial.requested_at.valueOf()).toBe(86400000);
      const remove=jest.fn().mockRejectedValueOnce(new Error('synthetic storage failure')).mockResolvedValue(undefined);
      await new FoodImageRetentionService(database,{deleteObject:remove}).processOne(new Date(now.valueOf()+1000));
      expect((await service.deletionStatus('owner',created.id)).photoStatus).toBe('pending');
      await service.deletePhoto('owner',key,created.id);
      expect((await database.query('select deadline_at from food_image_cleanup_jobs where image_id=$1',[imageId])).rows[0]!.deadline_at).toEqual(initial.deadline_at);
      await new FoodImageRetentionService(database,{deleteObject:remove}).processOne(new Date(now.valueOf()+61000));
      expect(await service.deletePhoto('owner',key,created.id)).toEqual({analysisId:created.id,photoStatus:'deleted',analysisStatus:'available',cancellationStatus:'notCancelled'});
      expect(remove.mock.calls.map(call=>call[0])).toEqual([`test/${imageId}`,`test/${imageId}`,`food-staging/${userId}/${imageId}`]);
      expect((await database.query('select count(*)::int count from food_image_cleanup_jobs')).rows[0]!.count).toBe(1);
    });

    it('rejects possibly submitted and other-owner deletion without durable effects',async()=>{
      const price=await service.price('owner');
      const {id}=await service.createAnalysis('owner',randomUUID(),{uploadedImageId:imageId,expectedTokenPrice:price.tokenPrice,expectedPriceVersion:price.priceVersion});
      await database.query("update food_analyses set status='outcomeUnknown' where id=$1",[id]);
      await expect(service.deletePhoto('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED',status:409});
      await expect(service.deleteAnalysis('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED',status:409});
      const other=new FoodService(database,{execute:async()=>({userId:randomUUID()})} as never,config);
      await expect(other.deletionStatus('other',id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_NOT_FOUND'});
      // Use another existing owner so the idempotency FK cannot mask ownership behavior.
      const otherId=randomUUID();
      await database.query("insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",[otherId,`${otherId}@example.test`,randomUUID()]);
      const otherOwner=new FoodService(database,{execute:async()=>({userId:otherId})} as never,config);
      await expect(otherOwner.deletePhoto('other',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_NOT_FOUND'});
      await expect(otherOwner.deleteAnalysis('other',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_NOT_FOUND'});
      expect((await database.query('select count(*)::int count from food_image_cleanup_jobs')).rows[0]!.count).toBe(0);
      expect((await database.query('select deleted_at from uploaded_images where id=$1',[imageId])).rows[0]!.deleted_at).toBeNull();
    });

    it('serializes concurrent confirmation and deletion without retaining replay content',async()=>{
      const {created}=await analyze('success');
      const outcomes=await Promise.allSettled([
        service.confirmConsumption('owner',randomUUID(),created.id,'2026-09-23T18:00:00Z','UTC'),
        service.deleteAnalysis('owner',randomUUID(),created.id),
      ]);
      expect(outcomes[1]!.status).toBe('fulfilled');
      if(outcomes[0]!.status==='rejected') expect(outcomes[0]!.reason).toMatchObject({code:'FOOD_ANALYSIS_NOT_CONFIRMABLE'});
      const cache=await database.query("select response_body from idempotency_records where operation_scope='foodConsumptionConfirm' and user_id=$1",[userId]);
      expect(cache.rows.every(row=>row.response_body.contentDeleted===true)).toBe(true);
      expect((await service.deletionStatus('owner',created.id)).analysisStatus).toBe('deleted');
    });

    it('preserves a live cleanup lease and the original deadline on repeated deletion',async()=>{
      const {created}=await analyze('technicalError');
      await database.query("update uploaded_images set uploaded_at=now()-interval '11 minutes',created_at=now()-interval '11 minutes' where id=$1",[imageId]);
      await service.deletePhoto('owner',randomUUID(),created.id);
      let release!:()=>void;
      const blocked=new Promise<void>(resolve=>{release=resolve;});
      let reached!:()=>void;
      const started=new Promise<void>(resolve=>{reached=resolve;});
      const remove=jest.fn(async()=>{reached();await blocked;});
      const running=new FoodImageRetentionService(database,{deleteObject:remove}).processOne(new Date(Date.now()+1000));
      await started;
      const before=(await database.query('select lease_id,lease_expires_at,status,deadline_at from food_image_cleanup_jobs')).rows[0];
      try {
        const key=randomUUID();
        await service.deletePhoto('owner',key,created.id);
        expect((await database.query('select lease_id,lease_expires_at,status,deadline_at from food_image_cleanup_jobs')).rows[0]).toEqual(before);
        await expect(service.deletePhoto('owner',key,randomUUID())).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REUSED'});
      } finally { release();await running; }
      expect((await service.deletionStatus('owner',created.id)).photoStatus).toBe('deleted');
    });

    it('waits for signed upload expiry and allows photo deletion after result deletion',async()=>{
      const {created}=await analyze('success');
      await database.query('update uploaded_images set uploaded_at=now() where id=$1',[imageId]);
      await service.deleteAnalysis('owner',randomUUID(),created.id);
      await service.deletePhoto('owner',randomUUID(),created.id);
      const remove=jest.fn().mockResolvedValue(undefined);
      const cleanup=new FoodImageRetentionService(database,{deleteObject:remove});
      expect(await cleanup.processOne()).toBe(false);
      expect(remove).not.toHaveBeenCalled();
      expect(await cleanup.processOne(new Date(Date.now()+601000))).toBe(true);
      expect(await service.deletionStatus('owner',created.id)).toEqual({analysisId:created.id,analysisStatus:'deleted',photoStatus:'deleted',cancellationStatus:'notCancelled'});
    });
  },
);
