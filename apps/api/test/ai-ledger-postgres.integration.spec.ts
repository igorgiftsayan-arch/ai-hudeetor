import { DatabaseService } from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI ledger PostgreSQL constraints', () => {
  let database: DatabaseService;
  beforeAll(() => { database = new DatabaseService(databaseUrl!); });
  afterAll(async () => database.onApplicationShutdown());

  it('rejects a second reservation for the same operation', async () => {
    const userId = crypto.randomUUID();
    const walletId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    await database.query(`insert into users (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values ($1,$2,'active','completed',$3,'hash')`, [userId, `${userId}@example.test`, crypto.randomUUID()]);
    await database.query('insert into token_wallets (id,user_id) values ($1,$2)', [walletId,userId]);
    const insert = () => database.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id) values ($1,$2,$3,'aiReservation',-1,'aiOperation',$4,$4)`, [crypto.randomUUID(),walletId,userId,operationId]);
    await insert();
    await expect(insert()).rejects.toThrow();
  });
});
