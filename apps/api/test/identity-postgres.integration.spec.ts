import {
  Argon2PasswordHasher,
  CryptoSessionTokenService,
  DatabaseService,
  GetCurrentUserUseCase,
  PostgresIdentityRepository,
  RefreshSessionUseCase,
  RegisterUserUseCase,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Identity PostgreSQL integration', () => {
  let database: DatabaseService;
  let repository: PostgresIdentityRepository;
  let register: RegisterUserUseCase;
  let currentUser: GetCurrentUserUseCase;
  let refresh: RefreshSessionUseCase;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
    repository = new PostgresIdentityRepository(database);
    const hasher = new Argon2PasswordHasher();
    const tokens = new CryptoSessionTokenService({
      accessTtlMs: 15 * 60 * 1000,
      refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    });
    register = new RegisterUserUseCase(repository, hasher, tokens);
    currentUser = new GetCurrentUserUseCase(repository, tokens);
    refresh = new RefreshSessionUseCase(repository, tokens);
  });

  beforeEach(async () => {
    await database.query(
      'truncate table user_sessions, user_consents, password_credentials, users cascade',
    );
  });

  afterAll(async () => {
    await database.onApplicationShutdown();
  });

  it('commits user, credential, consents and hashed session secrets atomically', async () => {
    const result = await register.execute(registrationCommand());

    const stored = await database.query<{
      password_hash: string;
      access_token_hash: string;
      refresh_token_hash: string;
      consent_count: string;
    }>(
      `select pc.password_hash, s.access_token_hash, s.refresh_token_hash,
              (select count(*) from user_consents c where c.user_id = u.id) consent_count
         from users u
         join password_credentials pc on pc.user_id = u.id
         join user_sessions s on s.user_id = u.id
        where u.id = $1`,
      [result.user.id],
    );

    expect(stored.rows[0]).toMatchObject({
      password_hash: expect.stringMatching(/^\$argon2id\$/),
      consent_count: '2',
    });
    expect(stored.rows[0]!.access_token_hash).not.toBe(
      result.session.accessToken,
    );
    expect(stored.rows[0]!.refresh_token_hash).not.toBe(
      result.session.refreshToken,
    );
    await expect(
      currentUser.execute(result.session.accessToken),
    ).resolves.toEqual({
      userId: result.user.id,
      onboardingStatus: 'registered',
    });
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const result = await register.execute(registrationCommand());
    const rotated = await refresh.execute(result.session.refreshToken);

    await expect(
      refresh.execute(result.session.refreshToken),
    ).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
    await expect(
      currentUser.execute(rotated.accessToken),
    ).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
  });

  it('handles concurrent registration retries without duplicating the user', async () => {
    const command = registrationCommand();
    const [first, second] = await Promise.all([
      register.execute(command),
      register.execute(command),
    ]);
    const stored = await database.query<{ count: string }>(
      'select count(*) from users where email_normalized = $1',
      ['person@example.com'],
    );

    expect(first.user.id).toBe(second.user.id);
    expect(stored.rows[0]!.count).toBe('1');
  });

  it('caps rotated access expiry at the absolute refresh-family expiry', async () => {
    const result = await register.execute(registrationCommand());
    const refreshExpiresAt = new Date(Date.now() + 60_000);
    const accessExpiresAt = new Date(Date.now() + 30_000);
    await database.query(
      `update user_sessions
          set access_expires_at = $2, refresh_expires_at = $3
        where id = $1`,
      [result.session.id, accessExpiresAt, refreshExpiresAt],
    );

    const rotated = await refresh.execute(result.session.refreshToken);

    expect(rotated.accessExpiresAt.getTime()).toBeLessThan(
      refreshExpiresAt.getTime(),
    );
    expect(rotated.refreshExpiresAt.getTime()).toBe(refreshExpiresAt.getTime());
  });
});

function registrationCommand() {
  return {
    email: 'Person@Example.com',
    password: 'correct horse 123',
    ageConfirmed: true as const,
    idempotencyKey: crypto.randomUUID(),
    consents: [
      {
        consentType: 'terms' as const,
        documentVersion: 'test-v1',
        accepted: true as const,
      },
      {
        consentType: 'privacy' as const,
        documentVersion: 'test-v1',
        accepted: true as const,
      },
    ],
  };
}
