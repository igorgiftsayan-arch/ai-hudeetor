import { randomUUID } from 'node:crypto';
import {
  DatabaseService,
  GetTodayAiDailyStateUseCase,
  PostgresAiDailyStateRepository,
  TransitionAiDailyStateUseCase,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AI daily state PostgreSQL integration', () => {
  let database: DatabaseService;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
  });

  afterAll(async () => database.onApplicationShutdown());

  beforeEach(async () => {
    await database.query(
      'truncate table ai_daily_states, idempotency_records, ai_memories, weight_entries, ai_preferences, user_profiles, user_sessions, users cascade',
    );
  });

  it('lazily creates one state for concurrent requests on the user local date', async () => {
    const userId = await createCompletedUser('Pacific/Kiritimati');
    const useCase = todayUseCase(userId);

    const states = await Promise.all(
      Array.from({ length: 8 }, () => useCase.execute('access-token')),
    );

    expect(new Set(states.map((state) => state.id)).size).toBe(1);
    expect(states[0]).toMatchObject({
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      status: 'notStarted',
    });
    const count = await database.query<{ count: string }>(
      'select count(*) from ai_daily_states where user_id=$1',
      [userId],
    );
    expect(count.rows[0]).toEqual({ count: '1' });
  });

  it('uses the profile timezone rather than the server UTC date', async () => {
    const userId = await createCompletedUser('Pacific/Kiritimati');
    const repository = new PostgresAiDailyStateRepository(database);

    const state = await repository.getOrCreateToday(userId);
    const expected = await database.query<{ local_date: string }>(
      `select (current_timestamp at time zone 'Pacific/Kiritimati')::date::text local_date`,
    );

    expect(state.localDate).toBe(expected.rows[0]!.local_date);
  });

  it('applies valid transitions, replays safely and rejects changed payload', async () => {
    const userId = await createCompletedUser('Asia/Irkutsk');
    const today = await todayUseCase(userId).execute('access-token');
    const transition = transitionUseCase(userId);
    const key = `daily-${randomUUID()}`;
    const command = {
      accessToken: 'access-token',
      stateId: today.id,
      targetStatus: 'inProgress' as const,
      idempotencyKey: key,
    };

    const first = await transition.execute(command);
    const replay = await transition.execute(command);

    expect(first.status).toBe('inProgress');
    expect(replay).toEqual(first);
    await expect(
      transition.execute({ ...command, targetStatus: 'completed' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    const otherStateId = randomUUID();
    await database.query(
      `insert into ai_daily_states (id,user_id,local_date,status)
       values ($1,$2,current_date - 1,'notStarted')`,
      [otherStateId, userId],
    );
    await expect(
      transition.execute({ ...command, stateId: otherStateId }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('rejects skipped and backwards transitions without partial state', async () => {
    const userId = await createCompletedUser('UTC');
    const today = await todayUseCase(userId).execute('access-token');
    const transition = transitionUseCase(userId);

    await expect(
      transition.execute({
        accessToken: 'access-token',
        stateId: today.id,
        targetStatus: 'completed',
        idempotencyKey: `daily-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'DAILY_STATE_TRANSITION_INVALID' });
    const stored = await database.query<{ status: string }>(
      'select status from ai_daily_states where id=$1',
      [today.id],
    );
    expect(stored.rows[0]).toEqual({ status: 'notStarted' });
  });

  it('does not allow another owner to transition a state', async () => {
    const ownerId = await createCompletedUser('UTC');
    const otherId = await createCompletedUser('UTC');
    const today = await todayUseCase(ownerId).execute('access-token');

    await expect(
      transitionUseCase(otherId).execute({
        accessToken: 'access-token',
        stateId: today.id,
        targetStatus: 'inProgress',
        idempotencyKey: `daily-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('requires completed onboarding before lazy initialization', async () => {
    const userId = await createUser('profileReady', 'UTC');

    await expect(
      todayUseCase(userId, 'profileReady').execute('access-token'),
    ).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' });
    const count = await database.query<{ count: string }>(
      'select count(*) from ai_daily_states where user_id=$1',
      [userId],
    );
    expect(count.rows[0]).toEqual({ count: '0' });
  });

  function todayUseCase(
    userId: string,
    onboardingStatus: 'completed' | 'profileReady' = 'completed',
  ) {
    return new GetTodayAiDailyStateUseCase(
      currentUser(userId, onboardingStatus) as never,
      new PostgresAiDailyStateRepository(database),
      dailyContext(),
    );
  }

  function transitionUseCase(userId: string) {
    return new TransitionAiDailyStateUseCase(
      currentUser(userId, 'completed') as never,
      new PostgresAiDailyStateRepository(database),
    );
  }

  function dailyContext() {
    return {
      build: jest.fn().mockImplementation((_userId, localDate) => ({
        localDate,
        timezone: 'UTC',
        profile: {},
        weight: {},
        memories: [],
      })),
    };
  }

  async function createCompletedUser(timezone: string) {
    return createUser('completed', timezone);
  }

  async function createUser(
    onboardingStatus: 'completed' | 'profileReady',
    timezone: string,
  ) {
    const userId = randomUUID();
    await database.query(
      `insert into users
        (id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
       values ($1,$2,'active',$3,$4,'hash')`,
      [userId, `${userId}@example.test`, onboardingStatus, randomUUID()],
    );
    await database.query(
      'insert into user_profiles (user_id,timezone) values ($1,$2)',
      [userId, timezone],
    );
    return userId;
  }
});

function currentUser(
  userId: string,
  onboardingStatus: 'completed' | 'profileReady',
) {
  return {
    execute: jest.fn().mockResolvedValue({ userId, onboardingStatus }),
  };
}
