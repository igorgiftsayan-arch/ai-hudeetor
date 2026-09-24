import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DatabaseService } from '@atlas/backend';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { ListFoodAnalysesQueryDto } from '../../../packages/backend/src/food/transport/food.dto';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Owner food analysis discovery on actual PostgreSQL',
  () => {
    let admin: DatabaseService;
    let db: DatabaseService;
    let schema: string;
    let owner: string;
    let other: string;
    let service: FoodService;
    beforeAll(async () => {
      admin = new DatabaseService(databaseUrl!);
      schema = `food_list_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`create schema "${schema}"`);
      const url = new URL(databaseUrl!);
      url.searchParams.set('options', `-c search_path=${schema},public`);
      db = new DatabaseService(url.toString());
      const path = resolve(__dirname, '../../../database/migrations');
      for (const name of (await readdir(path))
        .filter((n) => n.endsWith('.sql'))
        .sort())
        await db.query(await readFile(resolve(path, name), 'utf8'));
      service = new FoodService(
        db,
        { execute: async (token: string) => ({ userId: token }) } as never,
        {
          enabled: true,
          endpoint: 'http://127.0.0.1:1',
          region: 'test',
          bucket: 'test',
          accessKeyId: 'test',
          secretAccessKey: 'test',
          forcePathStyle: true,
          runtimeAdapter: 'fake',
          consentVersion: 'test',
        },
      );
    });
    beforeEach(async () => {
      owner = randomUUID();
      other = randomUUID();
      for (const id of [owner, other])
        await db.query(
          "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
          [id, `${id}@test.example`, randomUUID()],
        );
    });
    afterAll(async () => {
      await db?.onApplicationShutdown();
      if (schema) await admin.query(`drop schema "${schema}" cascade`);
      await admin?.onApplicationShutdown();
    });
    async function seed(user = owner, time = '2026-09-24 10:00:00.123456+00') {
      const id = randomUUID(),
        image = randomUUID();
      await db.query(
        "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available')",
        [image, user, `private/${image}`, '0'.repeat(64)],
      );
      await db.query(
        "insert into food_analyses(id,user_id,uploaded_image_id,status,runtime_adapter,created_at,recognized_result,suitability_result) values($1,$2,$3,'analyzed','genapi',$4,$5,'{}')",
        [
          id,
          user,
          image,
          time,
          JSON.stringify({ dishName: 'Soup', items: [], kind: 'food' }),
        ],
      );
      return id;
    }
    it('isolates owners, including a cursor created by another owner', async () => {
      const ours = await seed();
      await seed(other);
      await seed(other);
      const foreign = await service.listAnalyses(other, { limit: 1 });
      expect(
        (await service.listAnalyses(owner)).items.map((x) => x.id),
      ).toEqual([ours]);
      const page = await service.listAnalyses(owner, {
        cursor: foreign.nextCursor!,
      });
      expect(page.items.every((x) => x.id === ours)).toBe(true);
      expect(JSON.stringify(page)).not.toMatch(
        /private\/|request_payload|profile|recognizedResult/,
      );
    });
    it('preserves microseconds and tied UUID ordering without duplicates after a new insertion', async () => {
      const ids = [
        await seed(),
        await seed(),
        await seed(owner, '2026-09-24 10:00:00.123455+00'),
      ];
      const expected = (
        await db.query<{ id: string }>(
          'select id from food_analyses where user_id=$1 order by created_at desc,id desc',
          [owner],
        )
      ).rows.map((x) => x.id);
      const first = await service.listAnalyses(owner, { limit: 1 });
      await seed(owner, '2026-09-25 10:00:00+00');
      const got = first.items.map((x) => x.id);
      let cursor = first.nextCursor;
      while (cursor) {
        const page = await service.listAnalyses(owner, { limit: 1, cursor });
        got.push(...page.items.map((x) => x.id));
        cursor = page.nextCursor;
      }
      expect(got).toEqual(expected);
      expect(new Set(got).size).toBe(ids.length);
    });
    it('filters confirmed diary before pagination and binds cursor to filter', async () => {
      const confirmed = await seed();
      const unconfirmed = [await seed(), await seed()];
      await db.query(
        "insert into food_consumptions(id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result) values($1,$2,$3,now(),current_date,'UTC','{}')",
        [randomUUID(), owner, confirmed],
      );
      const first = await service.listAnalyses(owner, {
        limit: 1,
        consumptionStatus: 'notConfirmed',
      });
      const second = await service.listAnalyses(owner, {
        limit: 1,
        consumptionStatus: 'notConfirmed',
        cursor: first.nextCursor!,
      });
      expect([...first.items, ...second.items].map((x) => x.id).sort()).toEqual(
        unconfirmed.sort(),
      );
      await expect(
        service.listAnalyses(owner, { cursor: first.nextCursor! }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect((await service.listAnalyses(owner)).items).toHaveLength(3);
    });
    it('returns safe tombstone while preserving financial status and confirmed diary', async () => {
      const id = await seed();
      await db.query(
        'insert into food_consumptions(id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result) values($1,$2,$3,now(),current_date,\'UTC\',\'{"dishName":"Kept diary"}\')',
        [randomUUID(), owner, id],
      );
      await service.deleteAnalysis(owner, randomUUID(), id);
      const item = (await service.listAnalyses(owner)).items[0];
      expect(item).toMatchObject({
        id,
        status: 'deleted',
        dishName: null,
        consumptionStatus: 'consumed',
        deletionStatus: { analysisStatus: 'deleted', photoStatus: 'available' },
      });
      expect(Object.keys(item).sort()).toEqual(
        [
          'id',
          'uploadedImageId',
          'status',
          'runtimeAdapter',
          'createdAt',
          'consumptionStatus',
          'dishName',
          'deletionStatus',
        ].sort(),
      );
      expect(
        (await db.query('select status from food_analyses where id=$1', [id]))
          .rows[0].status,
      ).toBe('analyzed');
      expect(
        (await service.listConsumptions(owner)).items[0].confirmedResult,
      ).toEqual({ dishName: 'Kept diary' });
    });
    it('keeps errors, cancellations and pending photo deletion discoverable', async () => {
      const failed = await seed();
      const cancelled = await seed();
      await db.query(
        "update food_analyses set status='technicalError', recognized_result=null,suitability_result=null where id=$1",
        [failed],
      );
      await db.query(
        "update food_analyses set status='cancelled',cancellation_reason='knownUnsentUserRequest',recognized_result=null,suitability_result=null where id=$1",
        [cancelled],
      );
      await db.query(
        'update uploaded_images set deleted_at=now() where id=(select uploaded_image_id from food_analyses where id=$1)',
        [cancelled],
      );
      const page = await service.listAnalyses(owner, {
        consumptionStatus: 'notConfirmed',
      });
      expect(page.items.find((item) => item.id === failed)).toMatchObject({
        status: 'technicalError',
        dishName: null,
      });
      expect(page.items.find((item) => item.id === cancelled)).toMatchObject({
        status: 'cancelled',
        deletionStatus: {
          photoStatus: 'pending',
          cancellationStatus: 'cancelledRefunded',
        },
      });
    });
    it('rejects malformed cursor and unbounded page sizes before querying', async () => {
      const badDate = Buffer.from(
        JSON.stringify({
          version: 1,
          filter: 'all',
          order: 'createdAtIdDesc',
          time: '2026-02-31 10:00:00+00',
          id: randomUUID(),
        }),
      ).toString('base64url');
      for (const query of [
        { cursor: badDate },
        { limit: 0 },
        { limit: 51 },
        { cursor: 'bogus' },
        { cursor: 'x'.repeat(513) },
      ])
        await expect(service.listAnalyses(owner, query)).rejects.toMatchObject({
          code: 'VALIDATION_ERROR',
        });
      for (const query of [
        { limit: '0' },
        { limit: '51' },
        { limit: '1.5' },
        { consumptionStatus: 'consumed' },
        { cursor: 'x'.repeat(513) },
      ])
        expect(
          (await validate(plainToInstance(ListFoodAnalysesQueryDto, query)))
            .length,
        ).toBeGreaterThan(0);
      expect(
        await validate(
          plainToInstance(ListFoodAnalysesQueryDto, {
            limit: '20',
            consumptionStatus: 'notConfirmed',
          }),
        ),
      ).toEqual([]);
    });
  },
);
