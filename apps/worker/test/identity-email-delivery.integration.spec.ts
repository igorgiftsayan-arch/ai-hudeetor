import { DatabaseService, IdentityEmailTokenService } from '@atlas/backend';
import { FakeEmailTransport } from '../src/email-transport';
import { IdentityEmailDeliveryService } from '../src/identity-email-delivery.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('identity email delivery PostgreSQL integration', () => {
  let database: DatabaseService;
  let tokens: IdentityEmailTokenService;
  let transport: FakeEmailTransport;
  let service: IdentityEmailDeliveryService;
  const userId = 'ec8c2f54-63fc-4f9f-a576-4bd8571424f8';

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
    tokens = new IdentityEmailTokenService(
      'integration-email-payload-secret-at-least-32-characters',
    );
  });

  beforeEach(async () => {
    transport = new FakeEmailTransport();
    service = new IdentityEmailDeliveryService(
      database,
      transport,
      tokens,
      'https://rebody38.test',
    );
    await database.query(
      `truncate table identity_email_deliveries,identity_tokens,user_sessions,
       user_consents,password_credentials,users cascade`,
    );
    await database.query(
      `insert into users
        (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
       values ($1,'synthetic@example.test','active','registered','email-delivery-test-key','hash')`,
      [userId],
    );
  });

  afterAll(async () => database.onApplicationShutdown());

  it('delivers once across overlapping polls and wipes encrypted payload', async () => {
    await insertDelivery('verifyEmail');
    await Promise.all([service.deliverPending(), service.deliverPending()]);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: 'synthetic@example.test',
      messageId: expect.stringMatching(/^<identity-/),
    });
    expect(transport.sent[0]!.text).toContain('/verify-email#token=');
    const stored = await database.query<{
      status: string;
      token_ciphertext: string;
    }>('select status,token_ciphertext from identity_email_deliveries');
    expect(stored.rows[0]).toEqual({ status: 'sent', token_ciphertext: '' });
  });

  it('does not send expired tokens and removes their encrypted payload', async () => {
    const delivery = await insertDelivery('passwordReset');
    await database.query(
      `update identity_tokens
          set created_at=now()-interval '2 hours',
              expires_at=now()-interval '1 hour'
        where id=$1`,
      [delivery.id],
    );
    await service.deliverPending();
    expect(transport.sent).toHaveLength(0);
    const stored = await database.query<{
      status: string;
      last_error_code: string;
      token_ciphertext: string;
    }>(
      'select status,last_error_code,token_ciphertext from identity_email_deliveries',
    );
    expect(stored.rows[0]).toEqual({
      status: 'failed',
      last_error_code: 'tokenUnavailable',
      token_ciphertext: '',
    });
  });

  it('reclaims a stale sending lease after worker restart without duplicate effects', async () => {
    await insertDelivery('verifyEmail');
    await database.query(
      `update identity_email_deliveries
          set status='sending',claimed_at=now()-interval '6 minutes',claim_id=gen_random_uuid()
        where status='pending'`,
    );
    await service.deliverPending();
    await service.deliverPending();
    expect(transport.sent).toHaveLength(1);
    const stored = await database.query<{ attempts: number; status: string }>(
      'select attempts,status from identity_email_deliveries',
    );
    expect(stored.rows[0]).toEqual({ attempts: 1, status: 'sent' });
  });

  it('contains database outages at the poll boundary', async () => {
    const failing = new IdentityEmailDeliveryService(
      {
        query: jest.fn().mockRejectedValue(new Error('database unavailable')),
        transaction: jest
          .fn()
          .mockRejectedValue(new Error('database unavailable')),
      } as never,
      transport,
      tokens,
      'https://rebody38.test',
    );
    await expect(
      (failing as unknown as { pollSafely(): Promise<void> }).pollSafely(),
    ).resolves.toBeUndefined();
  });

  async function insertDelivery(template: 'verifyEmail' | 'passwordReset') {
    const issued = tokens.issue(
      template,
      template === 'verifyEmail' ? 86_400_000 : 1_800_000,
    );
    await database.query(
      `insert into identity_tokens (id,user_id,purpose,token_hash,expires_at)
       values ($1,$2,$3,$4,$5)`,
      [
        issued.id,
        userId,
        template === 'verifyEmail' ? 'emailVerification' : 'passwordReset',
        issued.tokenHash,
        issued.expiresAt,
      ],
    );
    await database.query(
      `insert into identity_email_deliveries
        (id,user_id,token_id,template,token_ciphertext,token_iv,token_auth_tag)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        issued.deliveryId,
        userId,
        issued.id,
        template,
        issued.tokenCiphertext,
        issued.tokenIv,
        issued.tokenAuthTag,
      ],
    );
    return issued;
  }
});
