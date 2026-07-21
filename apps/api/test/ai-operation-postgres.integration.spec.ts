import { randomUUID } from 'node:crypto';
import { DatabaseService, PostgresAiCompanionRepository } from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI operation PostgreSQL transaction', () => {
  let database: DatabaseService;
  let repository: PostgresAiCompanionRepository;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
    repository = new PostgresAiCompanionRepository(database);
  });

  afterAll(async () => database.onApplicationShutdown());

  beforeEach(async () => {
    await database.query(
      'truncate table token_transactions, ai_operations, ai_messages, ai_conversations, token_wallets, idempotency_records, outbox_messages, users cascade',
    );
  });

  it('atomically creates a reservation, queued operation and durable outbox record', async () => {
    const fixture = await completedUserFixture();
    const key = randomUUID();

    const operation = await database.transaction((client) =>
      repository.startQuickReply(client, {
        userId: fixture.userId,
        idempotencyKey: key,
        conversationId: fixture.conversationId,
        content: 'Помоги мне сделать следующий шаг',
        expectedPriceTokens: 1,
        priceVersion: 1,
      }),
    );

    expect(operation).toMatchObject({
      status: 'queued',
      reservedTokens: 1,
      runtimeAdapter: 'fake',
    });
    await expectCounts(fixture.walletId, operation.id, 1, 1, 1);

    const replay = await database.transaction((client) =>
      repository.startQuickReply(client, {
        userId: fixture.userId,
        idempotencyKey: key,
        conversationId: fixture.conversationId,
        content: 'Помоги мне сделать следующий шаг',
        expectedPriceTokens: 1,
        priceVersion: 1,
      }),
    );

    expect(replay).toEqual(operation);
    await expectCounts(fixture.walletId, operation.id, 1, 1, 1);
  });

  it('rolls back every new record when the client price is stale', async () => {
    const fixture = await completedUserFixture();

    await expect(
      database.transaction((client) =>
        repository.startQuickReply(client, {
          userId: fixture.userId,
          idempotencyKey: randomUUID(),
          conversationId: fixture.conversationId,
          content: 'Помоги мне сделать следующий шаг',
          expectedPriceTokens: 2,
          priceVersion: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: 'AI_ACTION_PRICE_CHANGED', status: 409 });

    const result = await database.query<{
      messages: string;
      operations: string;
      reservations: string;
      outbox: string;
      idempotency: string;
    }>(
      `select
        (select count(*) from ai_messages)::text as messages,
        (select count(*) from ai_operations)::text as operations,
        (select count(*) from token_transactions where entry_type='aiReservation')::text as reservations,
        (select count(*) from outbox_messages)::text as outbox,
        (select count(*) from idempotency_records)::text as idempotency`,
    );
    expect(result.rows[0]).toEqual({
      messages: '0',
      operations: '0',
      reservations: '0',
      outbox: '0',
      idempotency: '0',
    });
  });

  async function completedUserFixture() {
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
    return { userId, walletId, conversationId };
  }

  async function expectCounts(
    walletId: string,
    operationId: string,
    messages: number,
    reservations: number,
    outbox: number,
  ) {
    const result = await database.query<{
      messages: string;
      reservations: string;
      outbox: string;
    }>(
      `select
        (select count(*) from ai_messages where conversation_id in (select conversation_id from ai_operations where id=$1))::text as messages,
        (select count(*) from token_transactions where wallet_id=$2 and entry_type='aiReservation')::text as reservations,
        (select count(*) from outbox_messages where aggregate_id=$1 and event_type='ai-companion.quick_reply_requested.v1')::text as outbox`,
      [operationId, walletId],
    );
    expect(result.rows[0]).toEqual({
      messages: String(messages),
      reservations: String(reservations),
      outbox: String(outbox),
    });
  }
});
