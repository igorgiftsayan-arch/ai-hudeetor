import {
  Argon2PasswordHasher,
  CryptoSessionTokenService,
  DatabaseService,
  GetCurrentUserUseCase,
  IdentityEmailTokenService,
  PostgresIdentityRepository,
  RegisterUserUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  VerifyEmailUseCase,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Identity email PostgreSQL integration', () => {
  let database: DatabaseService;
  let repository: PostgresIdentityRepository;
  let emailTokens: IdentityEmailTokenService;
  let register: RegisterUserUseCase;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
    repository = new PostgresIdentityRepository(database);
    emailTokens = new IdentityEmailTokenService(
      'integration-email-payload-secret-at-least-32-characters',
    );
    register = new RegisterUserUseCase(
      repository,
      new Argon2PasswordHasher(),
      new CryptoSessionTokenService({
        accessTtlMs: 900_000,
        refreshTtlMs: 2_592_000_000,
      }),
      emailTokens,
      86_400_000,
    );
  });

  beforeEach(async () => {
    await database.query(
      `truncate table identity_email_deliveries,identity_tokens,user_sessions,
       user_consents,password_credentials,users cascade`,
    );
  });

  afterAll(async () => database.onApplicationShutdown());

  it('creates an unverified user and durable encrypted verification delivery atomically', async () => {
    const result = await register.execute(registrationCommand());
    const stored = await database.query<{
      email_verified_at: Date | null;
      token_hash: string;
      token_ciphertext: string;
      status: string;
    }>(
      `select u.email_verified_at,t.token_hash,d.token_ciphertext,d.status
         from users u join identity_tokens t on t.user_id=u.id
         join identity_email_deliveries d on d.token_id=t.id
        where u.id=$1`,
      [result.user.id],
    );
    expect(stored.rows[0]).toMatchObject({
      email_verified_at: null,
      token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: 'pending',
    });
    expect(stored.rows[0]!.token_ciphertext).not.toContain('token=');
  });

  it('serializes concurrent resend requests and leaves one active token', async () => {
    const registered = await register.execute(registrationCommand());
    await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.createEmailVerification(
          registered.user.id,
          emailTokens.issue('verifyEmail', 86_400_000),
        ),
      ),
    );
    const active = await database.query<{ count: string }>(
      `select count(*) from identity_tokens
        where user_id=$1 and purpose='emailVerification' and consumed_at is null`,
      [registered.user.id],
    );
    expect(active.rows[0]!.count).toBe('1');
  });

  it('consumes a verification token once and exposes verified session state', async () => {
    const registered = await register.execute(registrationCommand());
    const issued = emailTokens.issue('verifyEmail', 86_400_000);
    await repository.createEmailVerification(registered.user.id, issued);
    const verify = new VerifyEmailUseCase(repository, emailTokens);
    await expect(verify.execute(issued.rawToken)).resolves.toEqual({
      emailVerified: true,
    });
    await expect(verify.execute(issued.rawToken)).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_TOKEN_INVALID',
    });
    const current = new GetCurrentUserUseCase(
      repository,
      new CryptoSessionTokenService({
        accessTtlMs: 900_000,
        refreshTtlMs: 2_592_000_000,
      }),
    );
    await expect(
      current.execute(registered.session.accessToken),
    ).resolves.toMatchObject({ emailVerified: true });
  });

  it('is enumeration-safe and serializes concurrent password reset issuance', async () => {
    const registered = await register.execute(registrationCommand());
    const requestReset = new RequestPasswordResetUseCase(
      repository,
      emailTokens,
      1_800_000,
    );
    await expect(requestReset.execute('unknown@example.com')).resolves.toEqual({
      accepted: true,
    });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        requestReset.execute('person@example.com'),
      ),
    );
    const counts = await database.query<{ active: string; unknown: string }>(
      `select
        count(*) filter (where user_id=$1 and consumed_at is null)::text active,
        count(*) filter (where user_id<>$1)::text unknown
       from identity_tokens where purpose='passwordReset'`,
      [registered.user.id],
    );
    expect(counts.rows[0]).toEqual({ active: '1', unknown: '0' });
  });

  it('changes the password once, revokes sessions and invalidates all reset tokens', async () => {
    const registered = await register.execute(registrationCommand());
    const issued = emailTokens.issue('passwordReset', 1_800_000);
    await repository.createPasswordReset('person@example.com', issued);
    const reset = new ResetPasswordUseCase(
      repository,
      new Argon2PasswordHasher(),
      emailTokens,
    );
    await expect(
      reset.execute({
        token: issued.rawToken,
        newPassword: 'Changed-pass-2026',
      }),
    ).resolves.toEqual({ passwordReset: true });
    await expect(
      reset.execute({
        token: issued.rawToken,
        newPassword: 'Changed-pass-2027',
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
    const state = await database.query<{ sessions: string; tokens: string }>(
      `select
        (select count(*) from user_sessions where user_id=$1 and revoked_at is null)::text sessions,
        (select count(*) from identity_tokens where user_id=$1 and purpose='passwordReset' and consumed_at is null)::text tokens`,
      [registered.user.id],
    );
    expect(state.rows[0]).toEqual({ sessions: '0', tokens: '0' });
  });
});

function registrationCommand() {
  return {
    email: 'person@example.com',
    password: 'Strong-password-2026',
    ageConfirmed: true as const,
    idempotencyKey: 'identity-email-integration-key',
    consents: [
      {
        consentType: 'terms' as const,
        documentVersion: 'v1',
        accepted: true as const,
      },
      {
        consentType: 'privacy' as const,
        documentVersion: 'v1',
        accepted: true as const,
      },
    ],
  };
}
