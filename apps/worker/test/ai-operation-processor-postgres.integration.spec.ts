import { randomUUID } from 'node:crypto';
import {
  DatabaseService,
  PostgresAiCompanionRepository,
  type AiProviderAdapter,
} from '@atlas/backend';
import { AiOperationProcessor } from '../src/ai-operation.processor';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI operation processor PostgreSQL integration', () => {
  let database: DatabaseService;
  let repository: PostgresAiCompanionRepository;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
    repository = new PostgresAiCompanionRepository(database, 'fake');
  });

  beforeEach(async () => {
    await database.query(
      `truncate table token_transactions,ai_operations,ai_messages,
       ai_conversations,token_wallets,idempotency_records,outbox_messages,
       ai_preferences,user_profiles,users cascade`,
    );
  });

  afterAll(async () => database.onApplicationShutdown());

  it('confirms a success once when the same job is delivered twice', async () => {
    const fixture = await queuedOperation();
    const adapter = fakeAdapter({
      kind: 'success',
      text: 'Synthetic successful response',
      usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
      providerReference: 'synthetic-success-1',
    });
    const processor = createProcessor(adapter);

    await processor.process(job(fixture.outboxId));
    await processor.process(job(fixture.outboxId));

    expect(adapter.execute).toHaveBeenCalledTimes(1);
    await expectState(fixture, {
      status: 'succeeded',
      balance: '99',
      confirmations: '1',
      refunds: '0',
      assistantMessages: '1',
    });
  });

  it('refunds a technical error in full once and does not call the provider on replay', async () => {
    const fixture = await queuedOperation();
    const adapter = fakeAdapter({
      kind: 'technicalError',
      errorClass: 'networkError',
    });
    const processor = createProcessor(adapter);

    await processor.process(job(fixture.outboxId));
    await processor.process(job(fixture.outboxId));

    expect(adapter.execute).toHaveBeenCalledTimes(1);
    await expectState(fixture, {
      status: 'technicalError',
      balance: '100',
      confirmations: '0',
      refunds: '1',
      assistantMessages: '0',
    });
    const refund = await database.query<{
      amount_tokens: number;
      reservation_id: string;
    }>(
      `select amount_tokens,reservation_id
         from token_transactions
        where operation_id=$1 and entry_type='aiRefund'`,
      [fixture.operationId],
    );
    expect(refund.rows).toEqual([
      {
        amount_tokens: 1,
        reservation_id: fixture.reservationId,
      },
    ]);
  });

  it('keeps the reservation for outcomeUnknown and does not retry the provider', async () => {
    const fixture = await queuedOperation();
    const adapter = fakeAdapter({ kind: 'outcomeUnknown' });
    const processor = createProcessor(adapter);

    await processor.process(job(fixture.outboxId));
    await processor.process(job(fixture.outboxId));

    expect(adapter.execute).toHaveBeenCalledTimes(1);
    await expectState(fixture, {
      status: 'outcomeUnknown',
      balance: '99',
      confirmations: '0',
      refunds: '0',
      assistantMessages: '0',
    });
  });

  function createProcessor(adapter: ReturnType<typeof fakeAdapter>) {
    return new AiOperationProcessor(
      database,
      adapter,
      {
        build: jest.fn().mockResolvedValue('synthetic bounded context'),
      } as never,
      { process: jest.fn() } as never,
    );
  }

  function fakeAdapter(
    result: Awaited<ReturnType<AiProviderAdapter['execute']>>,
  ) {
    return {
      providerName: 'fake' as const,
      execute: jest.fn().mockResolvedValue(result),
    };
  }

  function job(outboxId: string) {
    return {
      name: 'ai-operation',
      data: { outboxId },
    } as never;
  }

  async function queuedOperation() {
    const userId = randomUUID();
    const walletId = randomUUID();
    const conversationId = randomUUID();
    await database.query(
      `insert into users
        (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
       values ($1,$2,'active','completed',$3,'hash')`,
      [userId, `${userId}@example.test`, randomUUID()],
    );
    await database.query(
      `insert into ai_preferences (user_id,persona_id,strictness,response_length)
       values ($1,'gentleFriend','medium','short')`,
      [userId],
    );
    await database.query(
      'insert into token_wallets (id,user_id) values ($1,$2)',
      [walletId, userId],
    );
    await database.query(
      `insert into token_transactions
        (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id)
       values ($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)`,
      [randomUUID(), walletId, userId, randomUUID()],
    );
    await database.query(
      'insert into ai_conversations (id,user_id) values ($1,$2)',
      [conversationId, userId],
    );
    const operation = await database.transaction((client) =>
      repository.startQuickReply(client, {
        userId,
        idempotencyKey: randomUUID(),
        conversationId,
        content: 'Synthetic processor integration request',
        expectedPriceTokens: 1,
        priceVersion: 1,
      }),
    );
    const records = await database.query<{
      outbox_id: string;
      reservation_id: string;
    }>(
      `select
        (select id from outbox_messages
          where aggregate_id=$1 and event_type='ai-companion.quick_reply_requested.v1') as outbox_id,
        (select id from token_transactions
          where operation_id=$1 and entry_type='aiReservation') as reservation_id`,
      [operation.id],
    );
    return {
      operationId: operation.id,
      walletId,
      outboxId: records.rows[0]!.outbox_id,
      reservationId: records.rows[0]!.reservation_id,
    };
  }

  async function expectState(
    fixture: Awaited<ReturnType<typeof queuedOperation>>,
    expected: {
      status: string;
      balance: string;
      confirmations: string;
      refunds: string;
      assistantMessages: string;
    },
  ) {
    const result = await database.query<{
      status: string;
      balance: string;
      confirmations: string;
      refunds: string;
      assistant_messages: string;
    }>(
      `select
        (select status from ai_operations where id=$1) as status,
        (select sum(amount_tokens)::text from token_transactions where wallet_id=$2) as balance,
        (select count(*)::text from token_transactions where operation_id=$1 and entry_type='aiConfirmation') as confirmations,
        (select count(*)::text from token_transactions where operation_id=$1 and entry_type='aiRefund') as refunds,
        (select count(*)::text from ai_messages
          where conversation_id=(select conversation_id from ai_operations where id=$1)
            and role='assistant') as assistant_messages`,
      [fixture.operationId, fixture.walletId],
    );
    expect(result.rows[0]).toEqual({
      status: expected.status,
      balance: expected.balance,
      confirmations: expected.confirmations,
      refunds: expected.refunds,
      assistant_messages: expected.assistantMessages,
    });
  }
});
