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
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk'),
      yesterday = previousCalendarDate(today);
    const created = await service.createMarathon(captainId, randomUUID(), {
      ...request(),
      startsOn: yesterday,
    });
    await service.join(participantId, randomUUID(), created.joinCode);
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
    const completionKey = randomUUID();
    const completion = await service.completeTask(
      participantId,
      completionKey,
      task.id,
      true,
    );
    const view = await service.today(participantId);
    expect(view.captainTask?.currentUserCompletion.status).toBe('completed');
    expect(view.members.find((x) => x.isCurrentUser)?.captainTask.status).toBe(
      'completed',
    );
    await db.query(
      `update marathon_captain_tasks set task_date=$2::date-1 where id=$1`,
      [task.id, today],
    );
    await expect(
      service.completeTask(participantId, completionKey, task.id, true),
    ).resolves.toEqual(completion);
    await expect(
      service.completeTask(participantId, randomUUID(), task.id, true),
    ).rejects.toMatchObject({
      code: 'MARATHON_TASK_DATE_INVALID',
      status: 409,
    });
  });

  it('denies cross-team task reads and writes', async () => {
    const first = await service.createMarathon(
      captainId,
      randomUUID(),
      request(),
    );
    await service.join(participantId, randomUUID(), first.joinCode);

    const otherCaptainId = await user(db, 'other-captain', 'Asia/Irkutsk');
    const otherService = new MarathonService(
      db,
      {
        execute: jest.fn(async (token: string) => ({
          userId: token,
          onboardingStatus: 'completed',
        })),
      } as never,
      {
        bootstrapEnabled: true,
        bootstrapUserIds: new Set([otherCaptainId]),
        providerMode: 'fake',
        consentVersion: 'pilot-v1',
        consentDisclosure: 'test disclosure',
      },
    );
    await otherService.createMarathon(otherCaptainId, randomUUID(), request());
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const foreignTask = await otherService.saveTask(
      otherCaptainId,
      randomUUID(),
      today,
      { title: 'Foreign task', description: 'Must remain private' },
    );

    const firstTeamView = await service.today(participantId);
    expect(firstTeamView.team.id).toBe(first.teamId);
    expect(firstTeamView.captainTask).toBeNull();
    expect(JSON.stringify(firstTeamView)).not.toContain('Foreign task');
    expect(JSON.stringify(firstTeamView)).not.toContain('Must remain private');

    await expect(
      service.completeTask(participantId, randomUUID(), foreignTask.id, true),
    ).rejects.toMatchObject({ code: 'MARATHON_NOT_FOUND', status: 404 });
    expect(
      (
        await db.query(
          `select 1 from marathon_task_completions where task_id=$1`,
          [foreignTask.id],
        )
      ).rowCount,
    ).toBe(0);
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

  it('computes exact daily metrics, captures immutable baseline and groups tied podium places', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const yesterday = previousCalendarDate(today);
    const thirdId = await user(db, 'third', 'Asia/Irkutsk');
    const created = await service.createMarathon(captainId, randomUUID(), {
      ...request(),
      startsOn: yesterday,
    });
    await service.join(participantId, randomUUID(), created.joinCode);
    await service.join(thirdId, randomUUID(), created.joinCode);

    await weight(db, captainId, yesterday, '100.00');
    await weight(db, captainId, today, '99.00');
    await weight(db, participantId, yesterday, '80.00');
    await weight(db, participantId, today, '79.20');
    await weight(db, thirdId, yesterday, '90.00');
    await weight(db, thirdId, today, '90.00');

    const fivePoints = {
      morningShake: true,
      physicalActivity: true,
      waterTarget: true,
      secondShake: true,
      healthyDinner: true,
      goodSleep: false,
      noJunkFood: false,
      noSmoking: false,
    };
    await service.saveReport(captainId, randomUUID(), yesterday, fivePoints);
    await service.saveReport(
      participantId,
      randomUUID(),
      yesterday,
      fivePoints,
    );
    await service.saveReport(thirdId, randomUUID(), yesterday, {
      ...fivePoints,
      goodSleep: true,
    });
    const task = await service.saveTask(captainId, randomUUID(), today, {
      title: 'Шаги',
      description: 'Прогулка',
    });
    await service.completeTask(captainId, randomUUID(), task.id, true);
    await service.completeTask(participantId, randomUUID(), task.id, true);

    const view = await service.today(participantId);
    expect(view.members.map((member) => member.weight)).toEqual([
      { status: 'reported', dailyPercent: 1 },
      { status: 'reported', dailyPercent: 1 },
      { status: 'reported', dailyPercent: 0 },
    ]);
    expect(view.podiums.weight).toEqual([
      expect.objectContaining({ place: 1, value: 1 }),
      expect.objectContaining({ place: 2, value: 0 }),
    ]);
    expect(view.podiums.weight[0]?.members).toHaveLength(2);
    expect(view.podiums.wellness).toEqual([
      expect.objectContaining({ place: 1, value: 6 }),
      expect.objectContaining({ place: 2, value: 5 }),
    ]);
    expect(view.podiums.wellness[1]?.members).toHaveLength(2);
    expect(view.podiums.captainTask).toEqual([
      expect.objectContaining({ place: 1, value: true }),
    ]);
    expect(view.podiums.captainTask[0]?.members).toHaveLength(2);

    const baselines = await db.query<{
      user_id: string;
      baseline_weight_kg: string;
    }>(
      `select user_id,baseline_weight_kg::text from marathon_memberships order by user_id`,
    );
    expect(baselines.rows).toEqual(
      expect.arrayContaining([
        { user_id: captainId, baseline_weight_kg: '100.00' },
        { user_id: participantId, baseline_weight_kg: '80.00' },
        { user_id: thirdId, baseline_weight_kg: '90.00' },
      ]),
    );

    await db.query(
      `update weight_entries set weight_kg=78.50,updated_at=now() where user_id=$1 and local_date=$2 and is_current`,
      [participantId, yesterday],
    );
    await service.today(participantId);
    const baseline = await db.query<{ baseline_weight_kg: string }>(
      `select baseline_weight_kg::text from marathon_memberships where user_id=$1`,
      [participantId],
    );
    expect(baseline.rows[0]?.baseline_weight_kg).toBe('80.00');
  });

  it('keeps daily weight unknown without exact yesterday and today entries', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const yesterday = previousCalendarDate(today);
    const older = previousCalendarDate(yesterday);
    const created = await service.createMarathon(captainId, randomUUID(), {
      ...request(),
      startsOn: older,
    });
    await service.join(participantId, randomUUID(), created.joinCode);
    await weight(db, participantId, older, '82.00');
    await weight(db, participantId, today, '80.00');

    const view = await service.today(participantId);
    expect(view.members.find((member) => member.isCurrentUser)?.weight).toEqual(
      { status: 'unknown', dailyPercent: null },
    );
    expect(view.podiums.weight).toEqual([]);
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
    `insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,$4)`,
    [id, `${email}-${id}@example.test`, randomUUID(), 'request-hash'],
  );
  await db.query(`insert into user_profiles(user_id,timezone) values($1,$2)`, [
    id,
    timezone,
  ]);
  return id;
}

async function weight(
  db: DatabaseService,
  userId: string,
  localDate: string,
  value: string,
) {
  const id = randomUUID();
  await db.query(
    `insert into weight_entries(id,user_id,weight_kg,recorded_at,local_date,updated_at,is_current) values($1,$2,$3,$4::date + time '08:00',$4,now(),true)`,
    [id, userId, value, localDate],
  );
  return id;
}
