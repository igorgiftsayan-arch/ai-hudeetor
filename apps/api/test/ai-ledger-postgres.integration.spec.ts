import { randomUUID } from 'node:crypto';
import { DatabaseService } from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI ledger PostgreSQL constraints', () => {
  let database: DatabaseService;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
  });

  afterAll(async () => database.onApplicationShutdown());

  beforeEach(async () => {
    await database.query(
      'truncate table token_transactions, ai_operations, ai_messages, ai_conversations, token_wallets, users cascade',
    );
  });

  it('rejects a second reservation for the same operation', async () => {
    const { operationId, userId, walletId } = await fixture();
    const insert = () => reserve({ operationId, userId, walletId });

    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('allows no more than one active operation per user', async () => {
    const { userId, conversationId, messageId } = await fixture();
    await expect(
      createOperation(userId, conversationId, messageId, 'processing'),
    ).rejects.toThrow();
  });

  it('makes confirmation and refund mutually exclusive', async () => {
    const { userId, walletId, operationId, reservationId } =
      await reservedFixture();
    await terminal({
      type: 'aiConfirmation',
      amount: 0,
      reservationId,
      walletId,
      userId,
      operationId,
    });

    await expect(
      terminal({
        type: 'aiRefund',
        amount: 1,
        reservationId,
        walletId,
        userId,
        operationId,
      }),
    ).rejects.toThrow();
  });

  it('rejects a refund that does not equal its reservation', async () => {
    const { userId, walletId, operationId, reservationId } =
      await reservedFixture();
    await expect(
      terminal({
        type: 'aiRefund',
        amount: 2,
        reservationId,
        walletId,
        userId,
        operationId,
      }),
    ).rejects.toThrow();
  });

  it('allows an exact refund of its reservation', async () => {
    const { userId, walletId, operationId, reservationId } =
      await reservedFixture();

    await terminal({
      type: 'aiRefund',
      amount: 1,
      reservationId,
      walletId,
      userId,
      operationId,
    });

    expect(await balanceFor(walletId)).toBe(100);
  });

  it('rejects a second terminal financial effect for the same reservation', async () => {
    const { userId, walletId, operationId, reservationId } =
      await reservedFixture();
    await terminal({
      type: 'aiConfirmation',
      amount: 0,
      reservationId,
      walletId,
      userId,
      operationId,
    });

    await expect(
      terminal({
        type: 'aiConfirmation',
        amount: 0,
        reservationId,
        walletId,
        userId,
        operationId,
      }),
    ).rejects.toThrow();
  });

  it('keeps the balance nonnegative when concurrent reservations compete', async () => {
    const { userId, walletId, conversationId, messageId, operationId } =
      await fixture();

    await database.query(
      "update ai_operations set status='succeeded' where id=$1",
      [operationId],
    );
    const secondOperationId = await createOperation(
      userId,
      conversationId,
      messageId,
      'queued',
    );

    const results = await Promise.allSettled([
      reserve({
        operationId,
        userId,
        walletId,
        amount: -60,
      }),
      reserve({
        operationId: secondOperationId,
        userId,
        walletId,
        amount: -60,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(await balanceFor(walletId)).toBe(40);
  });

  it('rolls back reservation and keeps wallet ledger consistent', async () => {
    const { operationId, userId, walletId } = await fixture();

    await expect(
      database.transaction(async (client) => {
        await client.query(
          `insert into token_transactions
             (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id)
           values ($1,$2,$3,'aiReservation',-1,'aiOperation',$4,$4)`,
          [randomUUID(), walletId, userId, operationId],
        );
        throw new Error('force transaction rollback');
      }),
    ).rejects.toThrow('force transaction rollback');

    expect(await balanceFor(walletId)).toBe(100);
    expect(await transactionCountFor(walletId)).toBe(1);
  });

  async function fixture() {
    const userId = randomUUID();
    const walletId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const operationId = randomUUID();

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
    await database.query(
      `insert into ai_messages (id,conversation_id,role,content)
       values ($1,$2,'user','hello')`,
      [messageId, conversationId],
    );
    await createOperation(
      userId,
      conversationId,
      messageId,
      'queued',
      operationId,
    );

    return { userId, walletId, conversationId, messageId, operationId };
  }

  async function createOperation(
    userId: string,
    conversationId: string,
    messageId: string,
    status: 'queued' | 'processing' | 'succeeded',
    operationId = randomUUID(),
  ) {
    await database.query(
      `insert into ai_operations
         (id,user_id,conversation_id,input_message_id,status,action_type,price_version,reserved_tokens,runtime_adapter,prompt_version)
       values ($1,$2,$3,$4,$5,'quickReply',1,1,'fake','quick-reply-v1')`,
      [operationId, userId, conversationId, messageId, status],
    );
    return operationId;
  }

  async function reservedFixture() {
    const result = await fixture();
    const reservationId = await reserve(result);
    return { ...result, reservationId };
  }

  async function reserve({
    operationId,
    userId,
    walletId,
    amount = -1,
  }: {
    operationId: string;
    userId: string;
    walletId: string;
    amount?: number;
  }) {
    const reservationId = randomUUID();
    await database.query(
      `insert into token_transactions
         (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id)
       values ($1,$2,$3,'aiReservation',$4,'aiOperation',$5,$5)`,
      [reservationId, walletId, userId, amount, operationId],
    );
    return reservationId;
  }

  function terminal({
    type,
    amount,
    reservationId,
    walletId,
    userId,
    operationId,
  }: {
    type: 'aiConfirmation' | 'aiRefund';
    amount: number;
    reservationId: string;
    walletId: string;
    userId: string;
    operationId: string;
  }) {
    return database.query(
      `insert into token_transactions
         (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id,reservation_id)
       values ($1,$2,$3,$4,$5,'aiOperation',$6,$6,$7)`,
      [
        randomUUID(),
        walletId,
        userId,
        type,
        amount,
        operationId,
        reservationId,
      ],
    );
  }

  async function balanceFor(walletId: string) {
    const result = await database.query<{ balance: string }>(
      'select coalesce(sum(amount_tokens), 0)::text as balance from token_transactions where wallet_id=$1',
      [walletId],
    );
    return Number(result.rows[0]!.balance);
  }

  async function transactionCountFor(walletId: string) {
    const result = await database.query<{ count: string }>(
      'select count(*)::text as count from token_transactions where wallet_id=$1',
      [walletId],
    );
    return Number(result.rows[0]!.count);
  }
});
