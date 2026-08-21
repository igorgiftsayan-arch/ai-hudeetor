import {
  IdentityRepository,
  IdentityError,
  LoginAttemptLimiter,
  ProfilesRepository,
  DatabaseService,
  AiDailyStateRepository,
  DailyContextBuilder,
  type CreateIdentitySessionInput,
  type IdentitySessionRecord,
  type OnboardingStatus,
  type RegisteredIdentity,
  type RotateIdentitySessionInput,
} from '@atlas/backend';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap/configure-application';

class InMemoryIdentityRepository extends IdentityRepository {
  private readonly users = new Map<string, RegisteredIdentity>();
  private readonly passwordHashes = new Map<string, string>();
  private readonly sessions = new Map<string, IdentitySessionRecord>();

  async register(
    identity: RegisteredIdentity,
    passwordHash: string,
    session: CreateIdentitySessionInput,
  ): Promise<{ user: RegisteredIdentity; session: IdentitySessionRecord }> {
    if (this.users.has(identity.emailNormalized)) {
      throw this.emailAlreadyRegistered();
    }
    if (
      [...this.users.values()].some(
        (user) =>
          user.registrationIdempotencyKey ===
          identity.registrationIdempotencyKey,
      )
    ) {
      throw new IdentityError(
        'IDEMPOTENCY_KEY_REUSED',
        409,
        'The idempotency key was already used with another request',
      );
    }
    this.users.set(identity.emailNormalized, identity);
    this.passwordHashes.set(identity.id, passwordHash);
    const record = this.sessionRecord(session);
    this.sessions.set(record.id, record);
    return { user: identity, session: record };
  }

  async findCredentialsByEmail(emailNormalized: string) {
    const user = this.users.get(emailNormalized);
    if (!user) return null;
    return { user, passwordHash: this.passwordHashes.get(user.id)! };
  }

  async findCredentialsByRegistrationIdempotencyKey(
    registrationIdempotencyKey: string,
  ) {
    const user = [...this.users.values()].find(
      (candidate) =>
        candidate.registrationIdempotencyKey === registrationIdempotencyKey,
    );
    if (!user) return null;
    return { user, passwordHash: this.passwordHashes.get(user.id)! };
  }

  async createSession(input: CreateIdentitySessionInput) {
    const record = this.sessionRecord(input);
    this.sessions.set(record.id, record);
    return record;
  }

  async replaceRegistrationSession(
    userId: string,
    registrationIdempotencyKey: string,
    input: CreateIdentitySessionInput,
  ) {
    for (const session of this.sessions.values()) {
      const registrationSession = [...this.sessions.values()].find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.registrationIdempotencyKey === registrationIdempotencyKey,
      );
      if (session.familyId === registrationSession?.familyId)
        session.revokedAt = new Date();
    }
    return this.createSession({ ...input, userId });
  }

  async findByAccessHash(accessTokenHash: string) {
    const session =
      [...this.sessions.values()].find(
        (candidate) =>
          candidate.accessTokenHash === accessTokenHash &&
          !candidate.revokedAt &&
          candidate.accessExpiresAt > new Date(),
      ) ?? null;
    if (!session) return null;
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === session.userId,
    );
    return { ...session, onboardingStatus: user?.onboardingStatus };
  }

  async rotateSession(input: RotateIdentitySessionInput) {
    const current = [...this.sessions.values()].find(
      (session) => session.refreshTokenHash === input.currentRefreshTokenHash,
    );
    if (!current || current.refreshExpiresAt <= new Date()) {
      return { kind: 'invalid' as const };
    }
    if (current.rotatedAt || current.revokedAt) {
      for (const session of this.sessions.values()) {
        if (session.familyId === current.familyId) {
          session.revokedAt = new Date();
        }
      }
      return { kind: 'reused' as const };
    }
    current.rotatedAt = new Date();
    const rotated = this.sessionRecord({
      ...input.nextSession,
      userId: current.userId,
      familyId: current.familyId,
    });
    this.sessions.set(rotated.id, rotated);
    return { kind: 'rotated' as const, session: rotated };
  }

  async revokeByTokenHashes(
    accessTokenHash: string | null,
    refreshTokenHash: string | null,
  ) {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.accessTokenHash === accessTokenHash ||
        candidate.refreshTokenHash === refreshTokenHash,
    );
    if (session) await this.revokeFamily(session.familyId);
  }

  async revokeFamily(familyId: string) {
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId) session.revokedAt = new Date();
    }
  }

  async acceptWellnessNoticeAndAdvanceProfile(
    _client: unknown,
    input: { userId: string },
  ): Promise<OnboardingStatus> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === input.userId,
    );
    if (!user)
      throw new IdentityError('SESSION_INVALID', 401, 'The session is invalid');
    if (user.onboardingStatus === 'registered')
      user.onboardingStatus = 'profileReady';
    return user.onboardingStatus;
  }

  async advanceToPersonaReady(
    _client: unknown,
    userId: string,
  ): Promise<OnboardingStatus> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === userId,
    );
    if (!user)
      throw new IdentityError('SESSION_INVALID', 401, 'The session is invalid');
    if (user.onboardingStatus === 'profileReady')
      user.onboardingStatus = 'personaReady';
    return user.onboardingStatus;
  }

  async advanceToCompleted(
    _client: unknown,
    userId: string,
  ): Promise<OnboardingStatus> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === userId,
    );
    if (!user)
      throw new IdentityError('SESSION_INVALID', 401, 'The session is invalid');
    if (user.onboardingStatus === 'personaReady')
      user.onboardingStatus = 'completed';
    return user.onboardingStatus;
  }

  expireAccessSessions(): void {
    for (const session of this.sessions.values()) {
      session.accessExpiresAt = new Date(0);
    }
  }

  setOnboardingStatus(userId: string, status: OnboardingStatus): void {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === userId,
    );
    if (user) user.onboardingStatus = status;
  }

  private sessionRecord(
    input: CreateIdentitySessionInput,
  ): IdentitySessionRecord {
    return {
      id: input.id,
      userId: input.userId,
      familyId: input.familyId,
      registrationIdempotencyKey: input.registrationIdempotencyKey ?? null,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
      rotatedAt: null,
      revokedAt: null,
    };
  }
}

class InMemoryProfilesRepository extends ProfilesRepository {
  readonly profiles = new Map<
    string,
    {
      userId: string;
      timezone: string;
      displayName: string | null;
      targetWeightKg: string | null;
    }
  >();
  readonly preferences = new Map<
    string,
    {
      userId: string;
      personaId:
        | 'gentleFriend'
        | 'strictCoach'
        | 'russianLuli'
        | 'glamorousFriend'
        | 'analyst';
      strictness: 'low' | 'medium' | 'high';
      responseLength: 'short' | 'medium' | 'long';
    }
  >();
  readonly events: Array<{ userId: string; personaId: string }> = [];
  async upsertProfile(
    _client: unknown,
    input: {
      userId: string;
      timezone: string;
      displayName?: string | null;
      targetWeightKg?: string | null;
    },
  ) {
    const previous = this.profiles.get(input.userId);
    const profile = {
      userId: input.userId,
      timezone: input.timezone,
      displayName:
        'displayName' in input
          ? (input.displayName ?? null)
          : (previous?.displayName ?? null),
      targetWeightKg:
        'targetWeightKg' in input
          ? (input.targetWeightKg ?? null)
          : (previous?.targetWeightKg ?? null),
    };
    this.profiles.set(input.userId, profile);
    return profile;
  }
  async findProfile(userId: string) {
    return this.profiles.get(userId) ?? null;
  }
  async findPreference(userId: string) {
    return this.preferences.get(userId) ?? null;
  }
  async lockPreference(_client: unknown, userId: string) {
    return this.preferences.get(userId) ?? null;
  }
  async upsertPreference(
    _client: unknown,
    input: {
      userId: string;
      personaId:
        | 'gentleFriend'
        | 'strictCoach'
        | 'russianLuli'
        | 'glamorousFriend'
        | 'analyst';
      strictness: 'low' | 'medium' | 'high';
      responseLength: 'short' | 'medium' | 'long';
    },
  ) {
    this.preferences.set(input.userId, input);
    return input;
  }
  async insertPersonaSelectedEvent(
    _client: unknown,
    input: { userId: string; personaId: string },
  ) {
    this.events.push(input);
  }
}

class InMemoryDatabaseService {
  async transaction<TResult>(
    operation: (client: unknown) => Promise<TResult>,
  ): Promise<TResult> {
    return operation({});
  }
}

class InMemoryAiDailyStateRepository extends AiDailyStateRepository {
  private status: 'notStarted' | 'inProgress' | 'completed' = 'notStarted';

  async getOrCreateToday(userId: string) {
    return this.state(userId);
  }

  async transition(input: {
    userId: string;
    targetStatus: 'inProgress' | 'completed';
  }) {
    this.status = input.targetStatus;
    return this.state(input.userId);
  }

  private state(userId: string) {
    return {
      id: '019d23a0-2ec0-7000-8000-000000000001',
      userId,
      localDate: '2026-08-21',
      status: this.status,
      startedAt:
        this.status === 'notStarted' ? null : '2026-08-21T01:00:00.000Z',
      completedAt:
        this.status === 'completed' ? '2026-08-21T02:00:00.000Z' : null,
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T01:00:00.000Z',
    };
  }
}

class InMemoryLoginAttemptLimiter extends LoginAttemptLimiter {
  private readonly attempts = new Map<string, number>();

  async assertAllowed(scope: string): Promise<void> {
    if ((this.attempts.get(scope) ?? 0) >= 5) throw this.rateLimited();
  }

  async recordFailure(scope: string): Promise<void> {
    const attempts = (this.attempts.get(scope) ?? 0) + 1;
    this.attempts.set(scope, attempts);
    if (attempts >= 5) throw this.rateLimited();
  }

  async clear(scope: string): Promise<void> {
    this.attempts.delete(scope);
  }

  private rateLimited(): IdentityError {
    return new IdentityError(
      'RATE_LIMITED',
      429,
      'Too many authentication attempts',
    );
  }
}

describe('Identity API', () => {
  const origin = 'http://localhost:3000';
  let repository: InMemoryIdentityRepository;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    repository = new InMemoryIdentityRepository();
    app = await createApp(repository);
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers a user, creates opaque cookies and returns the current user', async () => {
    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);

    expect(registration.status).toBe(201);
    expect(registration.body).toMatchObject({
      userId: expect.any(String),
      onboardingStatus: 'registered',
      csrfToken: expect.any(String),
    });
    expect(registration.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('atlas_access='),
        expect.stringContaining('atlas_refresh='),
        expect.stringContaining('atlas_csrf='),
      ]),
    );

    const current = await agent.get('/api/v1/users/me');
    expect(current.status).toBe(200);
    expect(current.body).toEqual({
      userId: registration.body.userId,
      onboardingStatus: 'registered',
    });
  });

  it('logs in with valid credentials and rejects invalid credentials', async () => {
    const registrationAgent = request.agent(app.getHttpServer());
    await register(registrationAgent);

    const valid = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .send({
        email: 'person@example.com',
        password: 'correct horse 123',
      });
    expect(valid.status).toBe(201);
    expect(valid.body.csrfToken).toEqual(expect.any(String));

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .send({ email: 'person@example.com', password: 'wrong password 123' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('AUTHENTICATION_FAILED');
  });

  it('rate limits repeated invalid login attempts', async () => {
    await register(request.agent(app.getHttpServer()));

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .send({ email: 'person@example.com', password: 'wrong password 123' });
      expect(response.status).toBe(401);
    }
    const limited = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .send({ email: 'person@example.com', password: 'wrong password 123' });

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('requires exactly the terms and privacy consents', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...registrationPayload(),
        consents: [
          { consentType: 'terms', documentVersion: 'test-v1', accepted: true },
          { consentType: 'terms', documentVersion: 'test-v2', accepted: true },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the contract validation status for an invalid DTO', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...registrationPayload(), email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects outdated mandatory consent versions', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...registrationPayload(),
        consents: [
          { consentType: 'terms', documentVersion: 'old-v0', accepted: true },
          {
            consentType: 'privacy',
            documentVersion: 'test-v1',
            accepted: true,
          },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONSENT_VERSION_OUTDATED');
  });

  it('replays registration without duplicating the user and replaces the session', async () => {
    const key = crypto.randomUUID();
    const first = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send(registrationPayload());
    const firstCookies = first.headers['set-cookie'] as unknown as string[];

    const replay = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send(registrationPayload());
    const replayCookies = replay.headers['set-cookie'] as unknown as string[];

    expect(replay.status).toBe(201);
    expect(replay.body.userId).toBe(first.body.userId);
    expect(replayCookies).not.toEqual(firstCookies);
    expect(
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', firstCookies),
    ).toMatchObject({ status: 401 });
    expect(
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', replayCookies),
    ).toMatchObject({ status: 200 });
  });

  it('rejects an idempotency key reused with a changed registration payload', async () => {
    const key = crypto.randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send(registrationPayload());

    const changed = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send({
        ...registrationPayload(),
        password: 'different password 456',
      });

    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a registration idempotency key reused for another email', async () => {
    const key = crypto.randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send(registrationPayload());

    const response = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', key)
      .send({ ...registrationPayload(), email: 'another@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a non-printable registration idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', 'invalid key with spaces')
      .send(registrationPayload());

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rotates refresh sessions and detects reuse of the previous token', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(registrationPayload());
    const oldCookies = registration.headers[
      'set-cookie'
    ] as unknown as string[];
    const csrfToken = registration.body.csrfToken as string;

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/sessions/refreshes')
      .set('Cookie', oldCookies)
      .set('Origin', origin)
      .set('x-csrf-token', csrfToken);
    expect(refresh.status).toBe(201);
    expect(refresh.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('atlas_refresh=')]),
    );

    const reused = await request(app.getHttpServer())
      .post('/api/v1/sessions/refreshes')
      .set('Cookie', oldCookies)
      .set('Origin', origin)
      .set('x-csrf-token', csrfToken);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('SESSION_INVALID');
  });

  it('requires CSRF for logout and revokes the current session', async () => {
    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);

    const missingCsrf = await agent.delete('/api/v1/sessions/current');
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe('CSRF_VALIDATION_FAILED');

    const logout = await agent
      .delete('/api/v1/sessions/current')
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken);
    expect(logout.status).toBe(204);

    const current = await agent.get('/api/v1/users/me');
    expect(current.status).toBe(401);
    expect(current.body.error.code).toBe('SESSION_INVALID');
  });

  it('revokes the whole rotated session family on logout', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(registrationPayload());
    const oldCookies = registration.headers[
      'set-cookie'
    ] as unknown as string[];

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/sessions/refreshes')
      .set('Cookie', oldCookies)
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken);
    const refreshedCookies = refresh.headers[
      'set-cookie'
    ] as unknown as string[];

    const logout = await request(app.getHttpServer())
      .delete('/api/v1/sessions/current')
      .set('Cookie', refreshedCookies)
      .set('Origin', origin)
      .set('x-csrf-token', refresh.body.csrfToken);

    expect(logout.status).toBe(204);
    expect(
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', oldCookies),
    ).toMatchObject({ status: 401 });
    expect(
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', refreshedCookies),
    ).toMatchObject({ status: 401 });
  });

  it('revokes the session family when the access cookie is absent', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/registrations')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(registrationPayload());
    const cookies = registration.headers['set-cookie'] as unknown as string[];
    const refreshAndCsrfCookies = cookies.filter(
      (cookie) =>
        cookie.startsWith('atlas_refresh=') || cookie.startsWith('atlas_csrf='),
    );

    const logout = await request(app.getHttpServer())
      .delete('/api/v1/sessions/current')
      .set('Cookie', refreshAndCsrfCookies)
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken);

    expect(logout.status).toBe(204);
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/sessions/refreshes')
      .set('Cookie', refreshAndCsrfCookies)
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken);
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('SESSION_INVALID');
  });

  it('rejects expired access sessions', async () => {
    const agent = request.agent(app.getHttpServer());
    await register(agent);
    repository.expireAccessSessions();

    const current = await agent.get('/api/v1/users/me');

    expect(current.status).toBe(401);
    expect(current.body.error.code).toBe('SESSION_INVALID');
  });

  it('progresses an authenticated user from registered to personaReady', async () => {
    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);

    const profile = await agent
      .patch('/api/v1/users/me/profile')
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken)
      .send({
        timezone: 'Asia/Irkutsk',
        consents: [
          {
            consentType: 'aiWellnessNotice',
            documentVersion: 'test-v1',
            accepted: true,
          },
        ],
      });

    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ timezone: 'Asia/Irkutsk' });

    const preference = await agent
      .put('/api/v1/users/me/ai-preference')
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken)
      .send({ personaId: 'gentleFriend' });

    expect(preference.status).toBe(200);
    expect(preference.body).toMatchObject({
      personaId: 'gentleFriend',
      strictness: 'medium',
      responseLength: 'medium',
      onboardingStatus: 'personaReady',
    });

    const onboarding = await agent.get('/api/v1/users/me/onboarding');
    expect(onboarding.status).toBe(200);
    expect(onboarding.body).toMatchObject({
      status: 'personaReady',
      completedSteps: ['legal', 'timezone', 'persona'],
      canComplete: false,
      csrfToken: expect.any(String),
    });
  });

  it('requires an authenticated completed user for today daily state', async () => {
    const unauthorized = await request(app.getHttpServer()).get(
      '/api/v1/ai-daily-states/today',
    );
    expect(unauthorized.status).toBe(401);

    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);
    repository.setOnboardingStatus(registration.body.userId, 'completed');
    const response = await agent.get('/api/v1/ai-daily-states/today');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      localDate: '2026-08-21',
      status: 'notStarted',
      context: { timezone: 'UTC', memories: [] },
    });
    expect(response.body).not.toHaveProperty('userId');
  });

  it('requires CSRF, Origin and a valid idempotency key for transitions', async () => {
    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);
    repository.setOnboardingStatus(registration.body.userId, 'completed');
    const state = await agent.get('/api/v1/ai-daily-states/today');
    const endpoint = `/api/v1/ai-daily-states/${state.body.id}/transitions`;

    const missingCsrf = await agent
      .post(endpoint)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ targetStatus: 'inProgress' });
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error.code).toBe('CSRF_VALIDATION_FAILED');

    const invalidKey = await agent
      .post(endpoint)
      .set('Origin', origin)
      .set('x-csrf-token', registration.body.csrfToken)
      .set('Idempotency-Key', 'short')
      .send({ targetStatus: 'inProgress' });
    expect(invalidKey.status).toBe(400);
    expect(invalidKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('validates and applies the daily state transition DTO', async () => {
    const agent = request.agent(app.getHttpServer());
    const registration = await register(agent);
    repository.setOnboardingStatus(registration.body.userId, 'completed');
    const state = await agent.get('/api/v1/ai-daily-states/today');
    const endpoint = `/api/v1/ai-daily-states/${state.body.id}/transitions`;
    const headers = {
      Origin: origin,
      'x-csrf-token': registration.body.csrfToken,
      'Idempotency-Key': crypto.randomUUID(),
    };

    const invalid = await agent
      .post(endpoint)
      .set(headers)
      .send({ targetStatus: 'notStarted' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const transitioned = await agent
      .post(endpoint)
      .set({ ...headers, 'Idempotency-Key': crypto.randomUUID() })
      .send({ targetStatus: 'inProgress' });
    expect(transitioned.status).toBe(200);
    expect(transitioned.body.status).toBe('inProgress');
  });
});

async function createApp(repository: InMemoryIdentityRepository) {
  const profiles = new InMemoryProfilesRepository();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdentityRepository)
    .useValue(repository)
    .overrideProvider(LoginAttemptLimiter)
    .useValue(new InMemoryLoginAttemptLimiter())
    .overrideProvider(ProfilesRepository)
    .useValue(profiles)
    .overrideProvider(DatabaseService)
    .useValue(new InMemoryDatabaseService())
    .overrideProvider(AiDailyStateRepository)
    .useValue(new InMemoryAiDailyStateRepository())
    .overrideProvider(DailyContextBuilder)
    .useValue({
      build: jest.fn().mockImplementation((_userId, localDate) => ({
        localDate,
        timezone: 'UTC',
        profile: {},
        weight: {},
        memories: [],
      })),
    })
    .compile();
  const nestApp = moduleRef.createNestApplication();
  configureApplication(nestApp);
  await nestApp.init();
  return nestApp;
}

async function register(agent: ReturnType<typeof request.agent>) {
  return agent
    .post('/api/v1/registrations')
    .set('Idempotency-Key', crypto.randomUUID())
    .send(registrationPayload());
}

function registrationPayload() {
  return {
    email: 'Person@Example.com',
    password: 'correct horse 123',
    ageConfirmed: true,
    consents: [
      { consentType: 'terms', documentVersion: 'test-v1', accepted: true },
      { consentType: 'privacy', documentVersion: 'test-v1', accepted: true },
    ],
  };
}
