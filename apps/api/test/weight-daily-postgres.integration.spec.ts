import { randomUUID } from 'node:crypto';
import { DatabaseService } from '@atlas/backend';
import { CreateWeightEntryUseCase } from '../../../packages/backend/src/tracking/application/create-weight-entry.use-case';
import { ListWeightEntriesUseCase } from '../../../packages/backend/src/tracking/application/list-weight-entries.use-case';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Daily weight PostgreSQL integration', () => {
  let database: DatabaseService;
  let userId: string;
  let create: CreateWeightEntryUseCase;
  let list: ListWeightEntriesUseCase;

  beforeAll(() => {
    database = new DatabaseService(databaseUrl!);
  });

  beforeEach(async () => {
    await database.query(
      'truncate table outbox_messages, idempotency_records, weight_entries, user_profiles, users cascade',
    );
    userId = randomUUID();
    await createCompletedUser(database, userId, 'Pacific/Kiritimati');
    const currentUser = {
      execute: jest.fn().mockResolvedValue({
        userId,
        onboardingStatus: 'completed',
      }),
    };
    create = new CreateWeightEntryUseCase(database, currentUser as never);
    list = new ListWeightEntriesUseCase(database, currentUser as never);
  });

  afterAll(async () => {
    await database.onApplicationShutdown();
  });

  it('creates the first daily entry and updates it on a second save for the same local date', async () => {
    const first = await create.execute(
      command({
        weightKg: 80,
        recordedAt: '2026-01-01T10:30:00.000Z',
      }),
    );
    const updated = await create.execute(
      command({
        weightKg: 79.5,
        recordedAt: '2026-01-02T09:30:00.000Z',
      }),
    );

    expect(first).toMatchObject({ result: 'created', weightKg: '80.00' });
    expect(updated).toMatchObject({
      id: first.id,
      result: 'updated',
      weightKg: '79.50',
    });
    const rows = await database.query<{
      count: string;
      local_date: string;
      weight_kg: string;
      recorded_at: Date;
      created_at: Date;
      updated_at: Date;
    }>(
      `select count(*) over () count, local_date::text, weight_kg::text,
              recorded_at, created_at, updated_at
         from weight_entries where user_id = $1 and is_current`,
      [userId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      count: '1',
      local_date: '2026-01-02',
      weight_kg: '79.50',
    });
    expect(rows.rows[0]!.recorded_at.toISOString()).toBe(
      '2026-01-02T09:30:00.000Z',
    );
    expect(rows.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(
      rows.rows[0]!.created_at.getTime(),
    );
  });

  it('creates a new entry after the next local calendar date', async () => {
    await create.execute(
      command({
        weightKg: 80,
        recordedAt: '2026-01-01T10:30:00.000Z',
      }),
    );
    const nextDay = await create.execute(
      command({
        weightKg: 79.5,
        recordedAt: '2026-01-02T10:30:00.000Z',
      }),
    );

    expect(nextDay).toMatchObject({ result: 'created' });
    const dates = await database.query<{ local_date: string }>(
      `select local_date::text from weight_entries
       where user_id = $1 and is_current order by local_date`,
      [userId],
    );
    expect(dates.rows).toEqual([
      { local_date: '2026-01-02' },
      { local_date: '2026-01-03' },
    ]);
  });

  it('replays an idempotent retry without creating another entry', async () => {
    const idempotencyKey = randomUUID();
    const input = command({
      idempotencyKey,
      weightKg: 80,
      recordedAt: '2026-01-01T10:30:00.000Z',
    });
    const first = await create.execute(input);
    const replay = await create.execute(input);

    expect(replay).toEqual(first);
    const count = await database.query<{ count: string }>(
      'select count(*) from weight_entries where user_id = $1',
      [userId],
    );
    expect(count.rows[0]).toEqual({ count: '1' });
  });

  it('serializes concurrent same-day saves into one current entry', async () => {
    const [first, second] = await Promise.all([
      create.execute(
        command({
          weightKg: 80,
          recordedAt: '2026-01-01T10:30:00.000Z',
        }),
      ),
      create.execute(
        command({
          weightKg: 79.5,
          recordedAt: '2026-01-02T09:30:00.000Z',
        }),
      ),
    ]);
    const current = await database.query<{ count: string }>(
      `select count(*) from weight_entries where user_id=$1 and is_current`,
      [userId],
    );

    expect([first.result, second.result].sort()).toEqual([
      'created',
      'updated',
    ]);
    expect(current.rows[0]).toEqual({ count: '1' });
  });

  it('returns only the latest current entry for legacy duplicates in history', async () => {
    const localDate = '2026-01-02';
    await insertLegacyDuplicate(database, userId, {
      weightKg: '81.0',
      localDate,
      isCurrent: false,
      createdAt: '2026-01-01T11:00:00.000Z',
      updatedAt: '2026-01-01T11:00:00.000Z',
    });
    const latestId = await insertLegacyDuplicate(database, userId, {
      weightKg: '79.5',
      localDate,
      isCurrent: true,
      createdAt: '2026-01-01T12:00:00.000Z',
      updatedAt: '2026-01-01T13:00:00.000Z',
    });

    const history = await list.execute('access-token');

    expect(history.items).toEqual([
      expect.objectContaining({ id: latestId, weightKg: '79.50' }),
    ]);
  });

  it('returns daily values in local-date order for history and graphs', async () => {
    await create.execute(
      command({
        weightKg: 80,
        recordedAt: '2026-01-01T10:30:00.000Z',
      }),
    );
    await create.execute(
      command({
        weightKg: 79.5,
        recordedAt: '2026-01-02T10:30:00.000Z',
      }),
    );

    const history = await list.execute('access-token');

    expect(history.items.map((entry) => entry.weightKg)).toEqual([
      '79.50',
      '80.00',
    ]);
  });
});

function command(input: {
  idempotencyKey?: string;
  weightKg: number;
  recordedAt: string;
}) {
  return {
    accessToken: 'access-token',
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    weightKg: input.weightKg,
    recordedAt: input.recordedAt,
  };
}

async function createCompletedUser(
  database: DatabaseService,
  userId: string,
  timezone: string,
) {
  await database.query(
    `insert into users
       (id, email_normalized, status, onboarding_status,
        registration_idempotency_key, registration_request_hash)
     values ($1, $2, 'active', 'completed', $3, $4)`,
    [userId, `${userId}@example.test`, randomUUID(), 'request-hash'],
  );
  await database.query(
    'insert into user_profiles (user_id, timezone) values ($1, $2)',
    [userId, timezone],
  );
}

async function insertLegacyDuplicate(
  database: DatabaseService,
  userId: string,
  input: {
    weightKg: string;
    localDate: string;
    isCurrent: boolean;
    createdAt: string;
    updatedAt: string;
  },
) {
  const id = randomUUID();
  await database.query(
    `insert into weight_entries
       (id, user_id, weight_kg, recorded_at, local_date, is_current, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      userId,
      input.weightKg,
      input.createdAt,
      input.localDate,
      input.isCurrent,
      input.createdAt,
      input.updatedAt,
    ],
  );
  return id;
}
