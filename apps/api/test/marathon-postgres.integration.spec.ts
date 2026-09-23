import { randomUUID } from 'node:crypto';
import {
  DatabaseService,
  MarathonService,
  calendarDateInTimezone,
  previousCalendarDate,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
describeWithDatabase('Gerbi marathon PostgreSQL integration', () => {
  let db: DatabaseService;
  let captainId: string;
  let participantId: string;
  let service: MarathonService;
  beforeAll(() => {
    db = new DatabaseService(databaseUrl!);
  });
  beforeEach(async () => {
    await db.query(
      'truncate table marathon_task_completions,marathon_captain_tasks,marathon_wellness_reports,marathon_memberships,marathon_teams,marathons,idempotency_records,user_profiles,users cascade',
    );
    captainId = await user(db, 'captain', 'Asia/Irkutsk');
    participantId = await user(db, 'participant', 'Asia/Irkutsk');
    service = new MarathonService(
      db,
      {
        execute: jest.fn(async (token: string) => ({
          userId: token,
          onboardingStatus: 'completed',
        })),
      } as never,
      {
        bootstrapEnabled: true,
        bootstrapUserIds: new Set([captainId]),
        providerMode: 'fake',
        consentVersion: 'pilot-v1',
        consentDisclosure: 'test disclosure',
      },
    );
  });
  afterAll(() => db.onApplicationShutdown());
  it('guards bootstrap and replays one atomic creation', async () => {
    await expect(service.current(participantId)).rejects.toMatchObject({
      code: 'MARATHON_NOT_FOUND',
      status: 404,
    });
    await expect(
      service.createMarathon(participantId, randomUUID(), request()),
    ).rejects.toMatchObject({ code: 'MARATHON_BOOTSTRAP_FORBIDDEN' });
    const key = randomUUID();
    const first = await service.createMarathon(captainId, key, request());
    const replay = await service.createMarathon(captainId, key, request());
    expect(replay).toEqual(first);
    expect((await db.query('select 1 from marathons')).rowCount).toBe(1);
    expect(
      (await db.query('select 1 from marathon_memberships')).rowCount,
    ).toBe(1);
  });
  it('keeps missing wellness unknown and idempotently restores all eight flags', async () => {
    const created = await service.createMarathon(
      captainId,
      randomUUID(),
      request(),
    );
    await service.join(participantId, randomUUID(), created.joinCode);
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk'),
      yesterday = previousCalendarDate(today);
    await expect(service.getReport(participantId, yesterday)).resolves.toEqual({
      status: 'unknown',
      reportDate: yesterday,
      report: null,
    });
    const report = {
      noSmoking: true,
      goodSleep: false,
      morningShake: true,
      noJunkFood: true,
      secondShake: false,
      waterTarget: true,
      healthyDinner: true,
      physicalActivity: false,
    };
    const key = randomUUID();
    const saved = await service.saveReport(
      participantId,
      key,
      yesterday,
      report,
    );
    const replay = await service.saveReport(
      participantId,
      key,
      yesterday,
      report,
    );
    expect(replay).toEqual(saved);
    expect(saved).toMatchObject({ status: 'reported', markedCount: 5 });
    const read = await service.getReport(participantId, yesterday);
    expect(read).toMatchObject({
      status: 'reported',
      reportDate: yesterday,
      report,
    });
    expect(
      (await db.query('select 1 from marathon_wellness_reports')).rowCount,
    ).toBe(1);
  });
  it('rejects a participant task write and scopes task completion to the same team', async () => {
    const created = await service.createMarathon(
      captainId,
      randomUUID(),
      request(),
    );
    await service.join(participantId, randomUUID(), created.joinCode);
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    await expect(
      service.saveTask(participantId, randomUUID(), today, {
        title: 't',
        description: 'd',
      }),
    ).rejects.toMatchObject({ code: 'MARATHON_CAPTAIN_REQUIRED' });
    const task = await service.saveTask(captainId, randomUUID(), today, {
      title: 'Шаги',
      description: 'Прогулка',
    });
    await service.completeTask(participantId, randomUUID(), task.id, true);
    const view = await service.today(participantId);
    expect(view.captainTask?.currentUserCompletion.status).toBe('completed');
    expect(
      view.members.find((x: any) => x.isCurrentUser)?.captainTask.status,
    ).toBe('completed');
  });
  it('refuses membership when profile and marathon timezones differ', async () => {
    const other = await user(db, 'other', 'UTC');
    const created = await service.createMarathon(
      captainId,
      randomUUID(),
      request(),
    );
    await expect(
      service.join(other, randomUUID(), created.joinCode),
    ).rejects.toMatchObject({ code: 'MARATHON_TIMEZONE_MISMATCH' });
  });

  it('keeps owner reads available and accepts the last report on the following morning', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const yesterday = previousCalendarDate(today);
    const created = await service.createMarathon(captainId, randomUUID(), {
      ...request(),
      startsOn: yesterday,
      endsOn: yesterday,
    });
    await service.join(participantId, randomUUID(), created.joinCode);
    await expect(
      service.getReport(participantId, yesterday),
    ).resolves.toMatchObject({ status: 'unknown' });
    await expect(
      service.saveReport(participantId, randomUUID(), yesterday, {
        morningShake: true,
        physicalActivity: true,
        waterTarget: true,
        secondShake: true,
        healthyDinner: true,
        goodSleep: true,
        noJunkFood: true,
        noSmoking: true,
      }),
    ).resolves.toMatchObject({ status: 'reported', markedCount: 8 });
  });

  it('returns notApplicable instead of failing on the first marathon day', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const created = await service.createMarathon(
      captainId,
      randomUUID(),
      request(),
    );
    await service.join(participantId, randomUUID(), created.joinCode);
    const reportDate = previousCalendarDate(today);
    await expect(service.getReport(participantId, reportDate)).resolves.toEqual(
      {
        status: 'notApplicable',
        reportDate,
        report: null,
      },
    );
  });
});
function request() {
  const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
  return {
    name: 'Pilot',
    startsOn: today,
    endsOn: today,
    timezone: 'Asia/Irkutsk',
    teamName: 'Team',
  };
}
async function user(db: DatabaseService, email: string, timezone: string) {
  const id = randomUUID();
  await db.query(
    `insert into users(id,email,status,onboarding_status) values($1,$2,'active','completed')`,
    [id, `${email}-${id}@example.test`],
  );
  await db.query(
    `insert into user_profiles(id,user_id,timezone,age_confirmed) values($1,$2,$3,true)`,
    [randomUUID(), id, timezone],
  );
  return id;
}
