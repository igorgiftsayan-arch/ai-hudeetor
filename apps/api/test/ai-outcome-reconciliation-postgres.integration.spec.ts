import { randomUUID } from 'node:crypto';
import {
  DatabaseService,
  FinalizeReconciledAiOutcomeUseCase,
  type ReconciledAiSuccess,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI outcome reconciliation PostgreSQL transaction', () => {
  let database: DatabaseService;
  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
  });
  afterAll(async () => database.onApplicationShutdown());
  beforeEach(async () => {
    await database.query(
      'truncate table outbox_messages, token_transactions, ai_operations, ai_messages, ai_conversations, token_wallets, users cascade',
    );
  });

  it('atomically confirms a verified unknown outcome and safely replays', async () => {
    const input = await fixture();
    const useCase = new FinalizeReconciledAiOutcomeUseCase(database);

    await expect(useCase.execute(input)).resolves.toEqual({
      status: 'succeeded',
      replay: false,
    });
    await expect(useCase.execute(input)).resolves.toEqual({
      status: 'succeeded',
      replay: true,
    });

    const operation = await database.query<{
      status: string;
      provider_reference: string;
      output_message_id: string;
    }>(
      'select status,provider_reference,output_message_id from ai_operations where id=$1',
      [input.operationId],
    );
    expect(operation.rows[0]).toMatchObject({
      status: 'succeeded',
      provider_reference: input.providerRequestId,
    });
    const effects = await database.query<{ entry_type: string }>(
      `select entry_type from token_transactions where operation_id=$1 order by entry_type`,
      [input.operationId],
    );
    expect(effects.rows.map((row) => row.entry_type)).toEqual([
      'aiConfirmation',
      'aiReservation',
    ]);
    const messages = await database.query<{ role: string }>(
      `select role from ai_messages where conversation_id=(select conversation_id from ai_operations where id=$1) order by created_at,id`,
      [input.operationId],
    );
    expect(messages.rows.map((row) => row.role)).toEqual(['user', 'assistant']);
    const events = await database.query<{ event_type: string }>(
      `select event_type from outbox_messages where aggregate_id=$1 order by event_type`,
      [input.operationId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      'ai-companion.memory_extraction_requested.v1',
      'ai-companion.outcome_reconciled.v1',
    ]);
  });

  async function fixture(): Promise<ReconciledAiSuccess> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const operationId = randomUUID();
    const reservationId = randomUUID();
    await database.query(
      `insert into users
        (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
       values ($1,$2,'active','completed',$3,'hash')`,
      [userId, `${userId}@example.test`, randomUUID()],
    );
    await database.query(
      'insert into token_wallets(id,user_id) values($1,$2)',
      [walletId, userId],
    );
    await database.query(
      `insert into token_transactions
        (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id)
       values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)`,
      [randomUUID(), walletId, userId, randomUUID()],
    );
    await database.query(
      'insert into ai_conversations(id,user_id) values($1,$2)',
      [conversationId, userId],
    );
    await database.query(
      `insert into ai_messages(id,conversation_id,role,content) values($1,$2,'user','safe synthetic')`,
      [messageId, conversationId],
    );
    await database.query(
      `insert into ai_operations
        (id,user_id,conversation_id,input_message_id,status,action_type,price_version,reserved_tokens,runtime_adapter,prompt_version)
       values($1,$2,$3,$4,'outcomeUnknown','quickReply',1,1,'genapi','quick-reply-v1')`,
      [operationId, userId, conversationId, messageId],
    );
    await database.query(
      `insert into token_transactions
        (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id)
       values($1,$2,$3,'aiReservation',-1,'aiOperation',$4,$4)`,
      [reservationId, walletId, userId, operationId],
    );
    return {
      operationId,
      providerRequestId: '54055527',
      providerResponseId: 'provider-response',
      providerModel: 'grok-4-5',
      text: 'safe answer',
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cost: 5.23,
      latencyMs: 30910,
      parametersHash: 'abc123',
    };
  }
});
