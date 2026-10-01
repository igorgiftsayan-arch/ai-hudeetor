import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  DatabaseService,
  GenApiAiProviderAdapter,
  GetCompanionProfileContextUseCase,
  GetCompanionWeightContextUseCase,
  MemoryContextBuilder,
  PostgresAiMemoryRepository,
  PostgresAiCompanionRepository,
} from '@atlas/backend';
import { AiOperationProcessor } from '../src/ai-operation.processor';
import { WorkerModule } from '../src/worker.module';

// Read real module provider metadata without private env files, Nest lifecycle,
// Redis connections or external AI. Only configuration loading is substituted.
jest.mock('@nestjs/config', () => ({
  ConfigModule: { forRoot: () => ({ module: class ConfigModule {} }) },
}));
jest.mock('../src/config/load-config', () => ({
  loadWorkerConfig: () => ({
    DATABASE_URL: 'postgresql://unused/unused',
    REDIS_URL: 'redis://127.0.0.1:1',
    WORKER_QUEUE_NAME: 'context-test',
    AI_PROVIDER: 'fake',
  }),
}));
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'Production confirmed food context on isolated PostgreSQL',
  () => {
    let admin: DatabaseService, db: DatabaseService, schema: string;
    beforeAll(async () => {
      admin = new DatabaseService(databaseUrl!);
      schema = `food_context_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`create schema "${schema}"`);
      const url = new URL(databaseUrl!);
      url.searchParams.set('options', `-c search_path=${schema},public`);
      db = new DatabaseService(url.toString());
      const path = resolve(__dirname, '../../../database/migrations');
      for (const name of (await readdir(path))
        .filter((n) => n.endsWith('.sql'))
        .sort())
        await db.query(await readFile(resolve(path, name), 'utf8'));
    });
    afterAll(async () => {
      await db?.onApplicationShutdown();
      if (schema) await admin.query(`drop schema "${schema}" cascade`);
      await admin?.onApplicationShutdown();
    });
    afterEach(() => jest.restoreAllMocks());
    async function user() {
      const id = randomUUID();
      await db.query(
        "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
        [id, `${id}@example.test`, randomUUID()],
      );
      return id;
    }
    async function food(
      userId: string,
      label: string,
      confirmed: boolean,
      deleted = false,
    ) {
      const image = randomUUID(),
        analysis = randomUUID(),
        consumption = randomUUID();
      await db.query(
        "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available')",
        [image, userId, `private/${image}`, '0'.repeat(64)],
      );
      await db.query(
        "insert into food_analyses(id,user_id,uploaded_image_id,status,runtime_adapter,recognized_result,suitability_result,user_correction) values($1,$2,$3,'analyzed','fake',$4,'{}',$5)",
        [
          analysis,
          userId,
          image,
          JSON.stringify({
            kind: 'food',
            items: [{ name: `original-${label}` }],
          }),
          JSON.stringify({ items: [{ name: label }] }),
        ],
      );
      if (confirmed)
        await db.query(
          "insert into food_consumptions(id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result,deleted_at) values($1,$2,$3,'2026-09-24T10:30:00Z','2026-09-24','Asia/Irkutsk',$4,$5)",
          [
            consumption,
            userId,
            analysis,
            JSON.stringify({ items: [{ name: label }] }),
            deleted ? '2026-09-24T11:00:00Z' : null,
          ],
        );
      return consumption;
    }
    it('persists corrected own confirmed food/time and weight; excludes unconfirmed, deleted and foreign content', async () => {
      const network = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('External transport forbidden'));
      const owner = await user(),
        foreign = await user(),
        wallet = randomUUID();
      await db.query('insert into token_wallets(id,user_id) values($1,$2)', [
        wallet,
        owner,
      ]);
      await db.query(
        "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)",
        [randomUUID(), wallet, owner, randomUUID()],
      );
      await db.query(
        "insert into user_profiles(user_id,timezone,target_weight_kg) values($1,'Asia/Irkutsk',75.00)",
        [owner],
      );
      await db.query(
        "insert into ai_preferences(user_id,persona_id,strictness,response_length) values($1,'gentleFriend','medium','medium')",
        [owner],
      );
      await db.query(
        "insert into user_consents(id,user_id,consent_type,document_version,source) values($1,$2,'aiProviderProcessing','context-v1','web')",
        [randomUUID(), owner],
      );
      for (const [date, weight] of [
        ['2026-09-23', 80.5],
        ['2026-09-24', 80.4],
      ])
        await db.query(
          'insert into weight_entries(id,user_id,weight_kg,recorded_at,local_date,is_current,updated_at) values($1,$2,$3,$4,$5,true,now())',
          [randomUUID(), owner, weight, `${date}T09:00:00Z`, date],
        );
      const current = await food(owner, 'corrected-own-lentils', true);
      await food(owner, 'unconfirmed-secret', false);
      await food(owner, 'deleted-secret', true, true);
      await food(foreign, 'foreign-secret', true);
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        WorkerModule,
      ) as Array<{
        provide?: unknown;
        useFactory?: (...args: unknown[]) => MemoryContextBuilder;
      }>;
      const factory = providers.find(
        (p) => p.provide === MemoryContextBuilder,
      )?.useFactory;
      if (!factory) throw new Error('Production context provider missing');
      const builder = factory(
        new GetCompanionProfileContextUseCase(db),
        new GetCompanionWeightContextUseCase(db),
        new PostgresAiMemoryRepository(db),
        db,
      );
      const conversation = randomUUID();
      await db.query('insert into ai_conversations(id,user_id) values($1,$2)', [
        conversation,
        owner,
      ]);
      const repository = new PostgresAiCompanionRepository(db);
      const operation = await db.transaction((client) =>
        repository.startQuickReply(client, {
          userId: owner,
          conversationId: conversation,
          idempotencyKey: randomUUID(),
          content: 'Какие наблюдения есть по моим записям?',
          expectedPriceTokens: 1,
          priceVersion: 1,
          runtimeAdapter: 'genapi',
        }),
      );
      const event = (
        await db.query<{ id: string }>(
          "select id from outbox_messages where aggregate_id=$1 and event_type='ai-companion.quick_reply_requested.v1'",
          [operation.id],
        )
      ).rows[0]!;
      const adapter = new GenApiAiProviderAdapter({
        apiKey: 'synthetic',
        baseUrl: 'https://unused.example',
        nativeBaseUrl: 'https://unused.example',
        model: 'synthetic',
        timeoutMs: 1,
      });
      const execute = jest
        .spyOn(adapter, 'execute')
        .mockImplementation(async (request) => {
          const receipt = (
            await db.query<{
              request_payload: typeof request;
              submission_state: string;
            }>(
              'select request_payload,submission_state from ai_operation_request_receipts where operation_id=$1',
              [operation.id],
            )
          ).rows[0]!;
          expect(receipt.submission_state).toBe('submitting');
          expect(receipt.request_payload).toEqual(request);
          return { kind: 'outcomeUnknown' };
        });
      const processor = new AiOperationProcessor(
        db,
        adapter,
        builder,
        { process: jest.fn() } as never,
        'context-v1',
      );
      await processor.process({ data: { outboxId: event.id } } as never);
      expect(execute).toHaveBeenCalledTimes(1);
      const prepared = (
        await db.query<{
          request_payload: {
            memoryContext: string;
            nativePayload: {
              messages: Array<{ role: string; content: string }>;
            };
          };
        }>(
          'select request_payload from ai_operation_request_receipts where operation_id=$1',
          [operation.id],
        )
      ).rows[0]!.request_payload;
      for (const expected of [
        'corrected-own-lentils',
        '2026-09-24T10:30:00.000Z',
        '75.00',
        '80.50',
        '80.40',
        '-0.10',
      ])
        expect(prepared.memoryContext).toContain(expected);
      for (const excluded of [
        'original-',
        'unconfirmed-secret',
        'deleted-secret',
        'foreign-secret',
      ])
        expect(prepared.memoryContext).not.toContain(excluded);
      const system = prepared.nativePayload.messages.find(
        (m) => m.role === 'system',
      )!.content;
      expect(system).toContain(prepared.memoryContext);
      expect(system).toContain('не доказывают причинность');
      await db.query(
        'update food_consumptions set deleted_at=now() where id=$1',
        [current],
      );
      expect(await builder.build(owner, 'Какие наблюдения?')).not.toContain(
        'corrected-own-lentils',
      );
      expect(network).not.toHaveBeenCalled();
    });
  },
);
