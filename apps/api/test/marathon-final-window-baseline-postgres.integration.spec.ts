import { randomUUID } from 'node:crypto';
import {
  DatabaseService,
  MarathonService,
  calendarDateInTimezone,
  previousCalendarDate,
} from '@atlas/backend';
import { Client } from 'pg';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('Marathon final window and public baseline on PostgreSQL', () => {
  let db: DatabaseService;
  let captainId: string;
  let participantId: string;
  let service: MarathonService;

  beforeAll(() => {
    db = new DatabaseService(databaseUrl!);
  });

  beforeEach(async () => {
    await db.query(
      'truncate table marathon_task_completions,marathon_captain_tasks,marathon_wellness_reports,marathon_memberships,marathon_teams,marathons,idempotency_records,weight_entries,user_profiles,users cascade',
    );
    captainId = await user(db, 'captain', 'Asia/Irkutsk');
    participantId = await user(db, 'participant', 'Europe/Moscow');
    service = marathonService(db, [captainId]);
  });

  afterAll(() => db.onApplicationShutdown());

  it('keeps the ended membership readable for its one-day final report window while lobby shows the next enrollment', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const yesterday = previousCalendarDate(today);
    const ended = await service.createMarathon(captainId, randomUUID(), {
      name: 'Завершённый марафон',
      startsOn: yesterday,
      endsOn: yesterday,
      timezone: 'Asia/Irkutsk',
      teamName: 'Предыдущая команда',
    });
    const endedMembership = await service.join(
      participantId,
      randomUUID(),
      ended.joinCode,
    );
    await service.lobby(captainId);

    const next = await service.openEnrollment(captainId, randomUUID(), {
      durationDays: 7,
    });
    await service.joinEnrollment(participantId, next.marathonId, randomUUID());

    await expect(service.lobby(participantId)).resolves.toMatchObject({
      marathon: { id: next.marathonId, status: 'enrollmentOpen' },
      currentMembership: { role: 'participant' },
      finale: {
        marathonId: ended.marathonId,
        endsOn: yesterday,
        membershipId: endedMembership.membershipId,
        role: 'participant',
      },
    });
    await expect(service.current(participantId)).resolves.toMatchObject({
      marathon: { id: ended.marathonId, endsOn: yesterday },
      displayDate: today,
      reportDate: yesterday,
    });
    await expect(service.today(participantId)).resolves.toMatchObject({
      displayDate: today,
      reportDate: yesterday,
      team: { id: ended.teamId },
      captainTask: null,
    });
    await expect(
      service.saveReport(participantId, randomUUID(), yesterday, fullReport()),
    ).resolves.toMatchObject({ status: 'reported', reportDate: yesterday });
    await expect(service.getReport(participantId, yesterday)).resolves.toMatchObject(
      { status: 'reported', reportDate: yesterday },
    );
    await expect(
      service.saveTask(captainId, randomUUID(), today, {
        title: 'Нельзя',
        description: 'Финальное окно только для чтения и отчёта',
      }),
    ).rejects.toMatchObject({ code: 'MARATHON_NOT_ACTIVE' });
  });

  it('rejects current, today and report writes after the one-day final window', async () => {
    const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
    const endedTwoDaysAgo = previousCalendarDate(previousCalendarDate(today));
    const ended = await service.createMarathon(captainId, randomUUID(), {
      name: 'Старый марафон',
      startsOn: endedTwoDaysAgo,
      endsOn: endedTwoDaysAgo,
      timezone: 'Asia/Irkutsk',
      teamName: 'Старая команда',
    });
    await service.join(participantId, randomUUID(), ended.joinCode);
    await service.lobby(captainId);

    await expect(service.current(participantId)).rejects.toMatchObject({
      code: 'MARATHON_NOT_ACTIVE',
    });
    await expect(service.today(participantId)).rejects.toMatchObject({
      code: 'MARATHON_NOT_ACTIVE',
    });
    await expect(
      service.saveReport(
        participantId,
        randomUUID(),
        endedTwoDaysAgo,
        fullReport(),
      ),
    ).rejects.toMatchObject({ code: 'MARATHON_REPORT_DATE_INVALID' });
  });

  it('ignores a same-day pre-start weight and captures the first post-start update as immutable baseline', async () => {
    const created = await service.openEnrollment(captainId, randomUUID(), {
      durationDays: 7,
    });
    await service.joinEnrollment(
      participantId,
      created.marathonId,
      randomUUID(),
    );
    const entryId = randomUUID();
    await db.query(
      `insert into weight_entries(
         id,user_id,weight_kg,recorded_at,local_date,updated_at,is_current
       ) values(
         $1,$2,90.00,now()-interval '1 hour',
         (now() at time zone 'Europe/Moscow')::date,now(),true
       )`,
      [entryId, participantId],
    );
    await service.closeEnrollment(captainId, created.marathonId, randomUUID());
    await service.startMarathon(captainId, created.marathonId, randomUUID());

    await expect(baseline(db, created.marathonId, participantId)).resolves.toBeNull();
    await db.query(
      `update weight_entries
          set weight_kg=89.50,recorded_at=now()+interval '1 second',updated_at=now()
        where id=$1`,
      [entryId],
    );
    await expect(baseline(db, created.marathonId, participantId)).resolves.toBe(
      '89.50',
    );
    await db.query(
      `update weight_entries
          set weight_kg=88.00,recorded_at=now()+interval '2 seconds',updated_at=now()
        where id=$1`,
      [entryId],
    );
    await expect(baseline(db, created.marathonId, participantId)).resolves.toBe(
      '89.50',
    );
  });

  it('serializes a post-start weight write against the marathon start row lock', async () => {
    const created = await service.openEnrollment(captainId, randomUUID(), {
      durationDays: 7,
    });
    await service.joinEnrollment(
      participantId,
      created.marathonId,
      randomUUID(),
    );
    await service.closeEnrollment(captainId, created.marathonId, randomUUID());
    const startClient = new Client({ connectionString: databaseUrl });
    const weightClient = new Client({ connectionString: databaseUrl });
    await startClient.connect();
    await weightClient.connect();
    try {
      await startClient.query('begin');
      await startClient.query(
        `update marathons
            set status='inProgress',starts_on=(now() at time zone timezone)::date,
                ends_on=(now() at time zone timezone)::date+duration_days-1,
                started_at=now()
          where id=$1`,
        [created.marathonId],
      );
      const write = weightClient.query(
        `insert into weight_entries(
           id,user_id,weight_kg,recorded_at,local_date,updated_at,is_current
         ) values(
           $1,$2,87.25,now()+interval '1 second',
           (now() at time zone 'Europe/Moscow')::date,now(),true
         )`,
        [randomUUID(), participantId],
      );
      const settledBeforeCommit = await Promise.race([
        write.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      expect(settledBeforeCommit).toBe(false);
      await startClient.query('commit');
      await write;
      await expect(
        baseline(db, created.marathonId, participantId),
      ).resolves.toBe('87.25');
    } finally {
      await startClient.query('rollback').catch(() => undefined);
      await startClient.end();
      await weightClient.end();
    }
  });
});

function marathonService(db: DatabaseService, bootstrapUserIds: string[]) {
  return new MarathonService(
    db,
    {
      execute: jest.fn(async (token: string) => ({
        userId: token,
        onboardingStatus: 'completed',
      })),
    } as never,
    {
      bootstrapEnabled: true,
      bootstrapUserIds: new Set(bootstrapUserIds),
      providerMode: 'fake',
      foodProviderMode: 'fake',
      consentVersion: 'test-v1',
      consentDisclosure: 'test disclosure',
    },
  );
}

async function user(db: DatabaseService, name: string, timezone: string) {
  const id = randomUUID();
  await db.query(
    `insert into users(
       id,email_normalized,status,onboarding_status,
       registration_idempotency_key,registration_request_hash
     ) values($1,$2,'active','completed',$3,'request-hash')`,
    [id, `${name}-${id}@example.test`, randomUUID()],
  );
  await db.query('insert into user_profiles(user_id,timezone) values($1,$2)', [
    id,
    timezone,
  ]);
  return id;
}

async function baseline(
  db: DatabaseService,
  marathonId: string,
  userId: string,
) {
  const result = await db.query<{ baseline_weight_kg: string | null }>(
    `select baseline_weight_kg::text
       from marathon_memberships
      where marathon_id=$1 and user_id=$2`,
    [marathonId, userId],
  );
  return result.rows[0]?.baseline_weight_kg ?? null;
}

function fullReport() {
  return {
    morningShake: true,
    physicalActivity: true,
    waterTarget: true,
    secondShake: true,
    healthyDinner: true,
    goodSleep: true,
    noJunkFood: true,
    noSmoking: true,
  };
}
