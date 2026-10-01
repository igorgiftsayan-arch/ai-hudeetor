import { createHash, randomUUID } from 'node:crypto';
import {
  DatabaseService,
  MarathonService,
  calendarDateInTimezone,
  previousCalendarDate,
} from '@atlas/backend';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  'Marathon public enrollment lifecycle on PostgreSQL',
  () => {
    let db: DatabaseService;
    let captainId: string;
    let participantId: string;
    let unauthorizedId: string;
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
      unauthorizedId = await user(db, 'unauthorized', 'UTC');
      service = marathonService(db, [captainId]);
    });

    afterAll(() => db.onApplicationShutdown());

    it('opens one canonical enrollment and safely replays the same command', async () => {
      const key = randomUUID();
      const created = await service.openEnrollment(captainId, key, {
        durationDays: 30,
      });
      await expect(
        service.openEnrollment(captainId, key, { durationDays: 30 }),
      ).resolves.toEqual(created);
      expect(created).toMatchObject({
        status: 'enrollmentOpen',
        durationDays: 30,
        timezone: 'Asia/Irkutsk',
        role: 'captain',
      });
      expect((await db.query('select 1 from marathons')).rowCount).toBe(1);
      expect(
        (await db.query('select 1 from marathon_memberships')).rowCount,
      ).toBe(1);
      expect(
        (
          await db.query<{ starts_on: string | null; ends_on: string | null }>(
            'select starts_on::text,ends_on::text from marathons',
          )
        ).rows[0],
      ).toEqual({ starts_on: null, ends_on: null });
    });

    it('allows every authenticated user to read lobby and join without a code', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 21,
      });
      const before = await service.lobby(participantId);
      expect(before).toMatchObject({
        marathon: { id: created.marathonId, status: 'enrollmentOpen' },
        enrollment: { isOpen: true, memberCount: 1 },
        currentMembership: null,
        canManage: false,
      });
      const key = randomUUID();
      const joined = await service.joinEnrollment(
        participantId,
        created.marathonId,
        key,
      );
      await expect(
        service.joinEnrollment(participantId, created.marathonId, key),
      ).resolves.toEqual(joined);
      await expect(
        service.joinEnrollment(participantId, created.marathonId, randomUUID()),
      ).resolves.toEqual(joined);
      expect(joined).toMatchObject({ role: 'participant' });
      expect((await service.lobby(participantId)).enrollment).toEqual({
        isOpen: true,
        memberCount: 2,
      });
    });

    it('requires current allowlist and captain role for management', async () => {
      await expect(
        service.openEnrollment(unauthorizedId, randomUUID(), {
          durationDays: 7,
        }),
      ).rejects.toMatchObject({ code: 'MARATHON_BOOTSTRAP_FORBIDDEN' });
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 7,
      });
      await service.joinEnrollment(
        participantId,
        created.marathonId,
        randomUUID(),
      );
      await expect(
        service.closeEnrollment(
          participantId,
          created.marathonId,
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'MARATHON_BOOTSTRAP_FORBIDDEN' });
      const revoked = marathonService(db, []);
      expect((await revoked.lobby(captainId)).canManage).toBe(false);
      await expect(
        revoked.closeEnrollment(captainId, created.marathonId, randomUUID()),
      ).rejects.toMatchObject({ code: 'MARATHON_BOOTSTRAP_FORBIDDEN' });
    });

    it('closes enrollment, forbids later joins and starts on captain local today', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 10,
      });

      await expect(
        service.startMarathon(captainId, created.marathonId, randomUUID()),
      ).rejects.toMatchObject({
        code: 'MARATHON_START_REQUIRES_CLOSED_ENROLLMENT',
      });
      const closeKey = randomUUID();
      const closed = await service.closeEnrollment(
        captainId,
        created.marathonId,
        closeKey,
      );
      await expect(
        service.closeEnrollment(captainId, created.marathonId, closeKey),
      ).resolves.toEqual(closed);
      await expect(
        service.joinEnrollment(participantId, created.marathonId, randomUUID()),
      ).rejects.toMatchObject({ code: 'MARATHON_ENROLLMENT_CLOSED' });
      const started = await service.startMarathon(
        captainId,
        created.marathonId,
        randomUUID(),
      );
      const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
      expect(started).toMatchObject({
        status: 'inProgress',
        startsOn: today,
      });
      const dates = await db.query<{ days: number }>(
        'select (ends_on-starts_on+1)::int days from marathons where id=$1',
        [created.marathonId],
      );
      expect(dates.rows[0]?.days).toBe(10);
      await expect(
        service.startMarathon(captainId, created.marathonId, randomUUID()),
      ).resolves.toEqual(started);
    });

    it('never permits a public-enrollment marathon through the legacy join-code endpoint', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 10,
      });
      const guessedCode = `enrollment:${created.marathonId}`;
      await db.query(
        `update marathon_teams set join_code_hash=$2 where marathon_id=$1`,
        [
          created.marathonId,
          createHash('sha256').update(guessedCode).digest('hex'),
        ],
      );
      await service.closeEnrollment(
        captainId,
        created.marathonId,
        randomUUID(),
      );
      await expect(
        service.join(participantId, randomUUID(), guessedCode),
      ).rejects.toMatchObject({ code: 'MARATHON_JOIN_CODE_UNAVAILABLE' });
      await service.startMarathon(captainId, created.marathonId, randomUUID());
      await expect(
        service.join(unauthorizedId, randomUUID(), guessedCode),
      ).rejects.toMatchObject({ code: 'MARATHON_JOIN_CODE_UNAVAILABLE' });
      const memberCount = await db.query<{ count: number }>(
        'select count(*)::int count from marathon_memberships where marathon_id=$1',
        [created.marathonId],
      );
      expect(memberCount.rows[0]?.count).toBe(1);
    });

    it('serializes concurrent enrollment creation', async () => {
      const otherCaptain = await user(db, 'other-captain', 'Europe/Moscow');
      const concurrentService = marathonService(db, [captainId, otherCaptain]);
      const results = await Promise.allSettled([
        concurrentService.openEnrollment(captainId, randomUUID(), {
          durationDays: 14,
        }),
        concurrentService.openEnrollment(otherCaptain, randomUUID(), {
          durationDays: 30,
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect((await db.query('select 1 from marathons')).rowCount).toBe(1);
    });

    it('serializes join against close without admitting a member after closure', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 14,
      });
      const [join, close] = await Promise.allSettled([
        service.joinEnrollment(participantId, created.marathonId, randomUUID()),
        service.closeEnrollment(captainId, created.marathonId, randomUUID()),
      ]);
      expect(close.status).toBe('fulfilled');
      if (join.status === 'rejected') {
        expect(join.reason).toMatchObject({
          code: 'MARATHON_ENROLLMENT_CLOSED',
        });
      }
      const state = await db.query<{
        status: string;
        member_count: number;
      }>(
        `select m.status,count(mm.id)::int member_count
         from marathons m join marathon_memberships mm on mm.marathon_id=m.id
        where m.id=$1 group by m.id`,
        [created.marathonId],
      );
      expect(state.rows[0]?.status).toBe('enrollmentClosed');
      expect(state.rows[0]?.member_count).toBe(
        join.status === 'fulfilled' ? 2 : 1,
      );
    });

    it('does not capture baseline before start and keeps the first in-range daily weight immutable', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 7,
      });
      await service.joinEnrollment(
        participantId,
        created.marathonId,
        randomUUID(),
      );
      const today = calendarDateInTimezone(new Date(), 'Europe/Moscow');
      await weight(db, participantId, today, '90.00');
      await expect(service.today(participantId)).rejects.toMatchObject({
        code: 'MARATHON_NOT_ACTIVE',
      });
      expect(
        (
          await db.query(
            'select baseline_weight_kg from marathon_memberships where marathon_id=$1 and user_id=$2',
            [created.marathonId, participantId],
          )
        ).rows[0]?.baseline_weight_kg,
      ).toBeNull();
      await service.closeEnrollment(
        captainId,
        created.marathonId,
        randomUUID(),
      );
      await service.startMarathon(captainId, created.marathonId, randomUUID());
      await weight(db, participantId, today, '89.50');
      await db.query(
        'update weight_entries set weight_kg=88.00,updated_at=now() where user_id=$1 and local_date=$2 and is_current',
        [participantId, today],
      );
      const baseline = await db.query<{ baseline_weight_kg: string }>(
        'select baseline_weight_kg::text from marathon_memberships where marathon_id=$1 and user_id=$2',
        [created.marathonId, participantId],
      );
      expect(baseline.rows[0]?.baseline_weight_kg).toBe('90.00');
    });

    it('uses the captain calendar for cross-timezone weight comparison without changing user local dates', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 7,
      });
      await service.joinEnrollment(
        participantId,
        created.marathonId,
        randomUUID(),
      );
      await service.closeEnrollment(
        captainId,
        created.marathonId,
        randomUUID(),
      );
      await service.startMarathon(captainId, created.marathonId, randomUUID());
      const today = calendarDateInTimezone(new Date(), 'Asia/Irkutsk');
      const yesterday = previousCalendarDate(today);
      const participantYesterday = previousCalendarDate(yesterday);
      const participantToday = yesterday;
      await db.query(
        'update marathons set starts_on=$2::date,ends_on=$2::date+6 where id=$1',
        [created.marathonId, yesterday],
      );
      await db.query(
        `insert into weight_entries(id,user_id,weight_kg,recorded_at,local_date,updated_at,is_current)
       values($1,$2,90.00,$3::date + time '00:30' - interval '8 hours',$4,now(),true),
             ($5,$2,89.00,$6::date + time '00:30' - interval '8 hours',$7,now(),true)`,
        [
          randomUUID(),
          participantId,
          yesterday,
          participantYesterday,
          randomUUID(),
          today,
          participantToday,
        ],
      );
      const view = await service.today(participantId);
      expect(
        view.members.find((member) => member.isCurrentUser)?.weight,
      ).toEqual({
        status: 'reported',
        dailyPercent: 1.11,
      });
      const localDates = await db.query<{ local_date: string }>(
        'select local_date::text from weight_entries where user_id=$1 order by local_date',
        [participantId],
      );
      expect(localDates.rows.map((row) => row.local_date)).toEqual([
        participantYesterday,
        participantToday,
      ]);
    });

    it('lazily completes after the captain-local end date', async () => {
      const created = await service.openEnrollment(captainId, randomUUID(), {
        durationDays: 1,
      });
      await service.closeEnrollment(
        captainId,
        created.marathonId,
        randomUUID(),
      );
      await service.startMarathon(captainId, created.marathonId, randomUUID());
      await db.query(
        'update marathons set starts_on=current_date-2,ends_on=current_date-2 where id=$1',
        [created.marathonId],
      );
      const lobby = await service.lobby(captainId);
      expect(lobby.marathon?.status).toBe('completed');
      expect(lobby.enrollment?.isOpen).toBe(false);
    });
  },
);

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
    `insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash)
     values($1,$2,'active','completed',$3,'request-hash')`,
    [id, `${name}-${id}@example.test`, randomUUID()],
  );
  await db.query('insert into user_profiles(user_id,timezone) values($1,$2)', [
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
    `insert into weight_entries(id,user_id,weight_kg,recorded_at,local_date,updated_at,is_current)
     values($1,$2,$3,$4::date + time '08:00',$4,now(),true)
     on conflict(user_id,local_date) where is_current
     do update set weight_kg=excluded.weight_kg,updated_at=now()`,
    [id, userId, value, localDate],
  );
  return id;
}
