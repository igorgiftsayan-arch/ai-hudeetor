import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '@atlas/backend';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  'Food application lifecycle on actual PostgreSQL migrations',
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
      schema = `food_lifecycle_${randomUUID().replaceAll('-', '')}`;
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
    it('reserves once, confirms once, persists explicit consumption, corrections and deletion with owner isolation', async () => {
      const { created, price } = await analyze('success');
      expect((await service.getAnalysis('owner', created.id)).status).toBe(
        'analyzed',
      );
      expect(await service.listConsumptions('owner')).toEqual({ items: [] });
      const corrected = {
        dishName: 'Corrected meal',
        items: [{ name: 'Rice' }],
      };
      await service.correct('owner', created.id, corrected);
      const key = randomUUID();
      const consumed = await service.confirmConsumption(
        'owner',
        key,
        created.id,
        '2026-09-23T18:00:00Z',
        'Asia/Irkutsk',
      );
      expect(consumed.localDate).toBe('2026-09-24');
      expect(consumed.confirmedResult).toEqual(corrected);
      expect(
        await service.confirmConsumption(
          'owner',
          key,
          created.id,
          '2026-09-23T18:00:00Z',
          'Asia/Irkutsk',
        ),
      ).toEqual(consumed);
      const other = new FoodService(
        database,
        { execute: async () => ({ userId: randomUUID() }) } as never,
        config,
      );
      expect(await other.listConsumptions('other')).toEqual({ items: [] });
      await expect(
        other.getAnalysis('other', created.id),
      ).rejects.toMatchObject({ code: 'FOOD_ANALYSIS_NOT_FOUND' });
      const edit = {
        consumedAt: '2026-09-24T06:00:00Z',
        timezone: 'Asia/Irkutsk',
        confirmedResult: { items: [{ name: 'Rice and beans' }] },
      };
      const edited = await service.updateConsumption(
        'owner',
        randomUUID(),
        consumed.id,
        edit,
      );
      const fresh = new FoodService(
        database,
        { execute: async () => ({ userId }) } as never,
        config,
      );
      expect((await fresh.listConsumptions('owner')).items).toEqual([edited]);
      const deleteKey = randomUUID();
      await fresh.deleteConsumption('owner', deleteKey, consumed.id);
      await fresh.deleteConsumption('owner', deleteKey, consumed.id);
      expect(await service.listConsumptions('owner')).toEqual({ items: [] });
      const ledger = await database.query<{
        entry_type: string;
        amount_tokens: number;
      }>(
        'select entry_type,amount_tokens from token_transactions where food_analysis_id=$1 order by amount_tokens',
        [created.id],
      );
      expect(ledger.rows).toEqual([
        { entry_type: 'aiReservation', amount_tokens: -price.tokenPrice },
        { entry_type: 'aiConfirmation', amount_tokens: 0 },
      ]);
    });
    it('refunds a technical failure once without creating a diary entry', async () => {
      const { created, price } = await analyze('technicalError');
      expect((await service.getAnalysis('owner', created.id)).status).toBe(
        'technicalError',
      );
      const ledger = await database.query<{
        entry_type: string;
        amount_tokens: number;
      }>(
        'select entry_type,amount_tokens from token_transactions where food_analysis_id=$1 order by amount_tokens',
        [created.id],
      );
      expect(ledger.rows).toEqual([
        { entry_type: 'aiReservation', amount_tokens: -price.tokenPrice },
        { entry_type: 'aiRefund', amount_tokens: price.tokenPrice },
      ]);
      expect(await service.listConsumptions('owner')).toEqual({ items: [] });
    });
  },
);
