import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';
import {
  calendarDateInTimezone,
  previousCalendarDate,
} from '../domain/marathon-date';

type Report = {
  morningShake: boolean;
  physicalActivity: boolean;
  waterTarget: boolean;
  secondShake: boolean;
  healthyDinner: boolean;
  goodSleep: boolean;
  noJunkFood: boolean;
  noSmoking: boolean;
};
type Membership = {
  id: string;
  marathon_id: string;
  team_id: string;
  role: 'captain' | 'participant';
  timezone: string;
  marathon_name: string;
  starts_on: string;
  ends_on: string;
  team_name: string;
};
type CaptainTaskRow = {
  id: string;
  taskDate: string;
  title: string;
  description: string;
  completed: boolean | null;
  completionUpdatedAt: Date | null;
};
type TeamMemberTodayRow = {
  membershipId: string;
  displayName: string | null;
  role: 'captain' | 'participant';
  isCurrentUser: boolean;
  wellnessStatus: 'unknown' | 'reported';
  markedCount: number | null;
  taskStatus: 'notAssigned' | 'unknown' | 'completed' | 'notCompleted';
  dailyPercent: number | null;
};
type PodiumMember = Pick<
  TeamMemberTodayRow,
  'membershipId' | 'displayName' | 'role' | 'isCurrentUser'
>;
type RankedMember<T extends number | boolean> = PodiumMember & { value: T };

function podium<T extends number | boolean>(members: RankedMember<T>[]) {
  const groups = new Map<T, PodiumMember[]>();
  for (const { value, ...member } of members) {
    const group = groups.get(value) ?? [];
    group.push(member);
    groups.set(value, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => Number(right) - Number(left))
    .slice(0, 3)
    .map(([value, group], index) => ({
      place: index + 1,
      value,
      members: group,
    }));
}

export class MarathonService {
  constructor(
    private readonly db: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly options: {
      bootstrapEnabled: boolean;
      bootstrapUserIds: Set<string>;
      providerMode: 'fake' | 'genapi';
      consentVersion: string;
      consentDisclosure: string;
    },
  ) {}

  private async user(token: string) {
    return this.currentUser.execute(token);
  }
  private async idempotent<T>(
    userId: string,
    scope: string,
    key: string,
    payload: unknown,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return this.db.transaction(async (client) => {
      await client.query(
        `insert into idempotency_records(id,user_id,operation_scope,idempotency_key,request_hash,state) values($1,$2,$3,$4,$5,'processing') on conflict do nothing`,
        [randomUUID(), userId, scope, key, hash],
      );
      const record = await client.query<{
        request_hash: string;
        state: string;
        response_body: T | null;
      }>(
        `select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope=$2 and idempotency_key=$3 for update`,
        [userId, scope, key],
      );
      if (record.rows[0]!.request_hash !== hash)
        throw new IdentityError(
          'IDEMPOTENCY_KEY_REUSED',
          409,
          'The idempotency key was already used with another request',
        );
      if (
        record.rows[0]!.state === 'completed' &&
        record.rows[0]!.response_body
      )
        return record.rows[0]!.response_body;
      const response = await action(client);
      await client.query(
        `update idempotency_records set state='completed',response_status=200,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope=$3 and idempotency_key=$4`,
        [JSON.stringify(response), userId, scope, key],
      );
      return response;
    });
  }
  private async membership(
    userId: string,
    missingCode = 'MARATHON_MEMBERSHIP_REQUIRED',
  ): Promise<Membership> {
    const result = await this.db.query<Membership>(
      `select mm.id,mm.marathon_id,mm.team_id,mm.role,m.timezone,m.name marathon_name,m.starts_on::text,m.ends_on::text,mt.name team_name from marathon_memberships mm join marathons m on m.id=mm.marathon_id join marathon_teams mt on mt.id=mm.team_id where mm.user_id=$1 order by m.created_at desc limit 1`,
      [userId],
    );
    if (!result.rows[0])
      throw new IdentityError(
        missingCode,
        missingCode === 'MARATHON_NOT_FOUND' ? 404 : 403,
        'A marathon membership is required',
      );
    return result.rows[0];
  }
  async createMarathon(
    token: string,
    key: string,
    input: {
      name: string;
      startsOn: string;
      endsOn: string;
      timezone: string;
      teamName: string;
    },
  ) {
    const user = await this.user(token);
    if (
      !this.options.bootstrapEnabled ||
      !this.options.bootstrapUserIds.has(user.userId)
    )
      throw new IdentityError(
        'MARATHON_BOOTSTRAP_FORBIDDEN',
        403,
        'Marathon bootstrap is not allowed',
      );
    calendarDateInTimezone(new Date(), input.timezone);
    if (input.endsOn < input.startsOn)
      throw new IdentityError(
        'VALIDATION_ERROR',
        422,
        'Marathon dates are invalid',
      );
    return this.idempotent(
      user.userId,
      'marathonCreate',
      key,
      input,
      async (c) => {
        const joinCode = randomBytes(24).toString('base64url');
        const marathonId = randomUUID(),
          teamId = randomUUID(),
          membershipId = randomUUID();
        await c.query(
          `insert into marathons(id,name,starts_on,ends_on,timezone,created_by_user_id) values($1,$2,$3,$4,$5,$6)`,
          [
            marathonId,
            input.name,
            input.startsOn,
            input.endsOn,
            input.timezone,
            user.userId,
          ],
        );
        await c.query(
          `insert into marathon_teams(id,marathon_id,name,join_code_hash) values($1,$2,$3,$4)`,
          [
            teamId,
            marathonId,
            input.teamName,
            createHash('sha256').update(joinCode).digest('hex'),
          ],
        );
        await c.query(
          `insert into marathon_memberships(id,marathon_id,team_id,user_id,role) values($1,$2,$3,$4,'captain')`,
          [membershipId, marathonId, teamId, user.userId],
        );
        return {
          marathonId,
          teamId,
          membershipId,
          role: 'captain' as const,
          joinCode,
        };
      },
    );
  }
  async join(token: string, key: string, joinCode: string) {
    const user = await this.user(token);
    const hash = createHash('sha256').update(joinCode).digest('hex');
    return this.idempotent(
      user.userId,
      'marathonJoin',
      key,
      { joinCode },
      async (c) => {
        const team = await c.query<{
          id: string;
          marathon_id: string;
          timezone: string;
        }>(
          `select mt.id,mt.marathon_id,m.timezone from marathon_teams mt join marathons m on m.id=mt.marathon_id where mt.join_code_hash=$1 for share`,
          [hash],
        );
        if (!team.rows[0])
          throw new IdentityError(
            'MARATHON_NOT_FOUND',
            404,
            'Marathon team not found',
          );
        const profile = await c.query<{ timezone: string }>(
          `select timezone from user_profiles where user_id=$1`,
          [user.userId],
        );
        if (profile.rows[0]?.timezone !== team.rows[0].timezone)
          throw new IdentityError(
            'MARATHON_TIMEZONE_MISMATCH',
            409,
            'The profile timezone must match the marathon timezone',
          );
        const existing = await c.query<{
          id: string;
          team_id: string;
          role: 'captain' | 'participant';
        }>(
          `select id,team_id,role from marathon_memberships where marathon_id=$1 and user_id=$2`,
          [team.rows[0].marathon_id, user.userId],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].team_id !== team.rows[0].id)
            throw new IdentityError(
              'MARATHON_ALREADY_JOINED',
              409,
              'The user already belongs to another team',
            );
          return {
            marathonId: team.rows[0].marathon_id,
            teamId: existing.rows[0].team_id,
            membershipId: existing.rows[0].id,
            role: existing.rows[0].role,
          };
        }
        const id = randomUUID();
        await c.query(
          `insert into marathon_memberships(id,marathon_id,team_id,user_id,role) values($1,$2,$3,$4,'participant')`,
          [id, team.rows[0].marathon_id, team.rows[0].id, user.userId],
        );
        return {
          marathonId: team.rows[0].marathon_id,
          teamId: team.rows[0].id,
          membershipId: id,
          role: 'participant' as const,
        };
      },
    );
  }
  async current(token: string) {
    const user = await this.user(token),
      m = await this.membership(user.userId, 'MARATHON_NOT_FOUND'),
      displayDate = calendarDateInTimezone(new Date(), m.timezone);
    return {
      marathon: {
        id: m.marathon_id,
        name: m.marathon_name,
        startsOn: m.starts_on,
        endsOn: m.ends_on,
        timezone: m.timezone,
      },
      team: { id: m.team_id, name: m.team_name },
      membership: { id: m.id, role: m.role, isCurrentUser: true },
      displayDate,
      reportDate: previousCalendarDate(displayDate),
    };
  }
  async getReport(token: string, date: string) {
    const user = await this.user(token),
      m = await this.membership(user.userId);
    if (date < m.starts_on || date > m.ends_on)
      return { status: 'notApplicable', reportDate: date, report: null };
    const r = await this.db.query(
      `select morning_shake "morningShake",physical_activity "physicalActivity",water_target "waterTarget",second_shake "secondShake",healthy_dinner "healthyDinner",good_sleep "goodSleep",no_junk_food "noJunkFood",no_smoking "noSmoking",updated_at "updatedAt" from marathon_wellness_reports where membership_id=$1 and report_date=$2`,
      [m.id, date],
    );
    return r.rows[0]
      ? { status: 'reported', reportDate: date, report: r.rows[0] }
      : { status: 'unknown', reportDate: date, report: null };
  }
  private assertReportDate(m: Membership, date: string) {
    const expected = previousCalendarDate(
      calendarDateInTimezone(new Date(), m.timezone),
    );
    if (date !== expected || date < m.starts_on || date > m.ends_on)
      throw new IdentityError(
        'MARATHON_REPORT_DATE_INVALID',
        409,
        'Only the previous marathon calendar date can be reported',
      );
  }
  private assertActive(m: Membership) {
    const today = calendarDateInTimezone(new Date(), m.timezone);
    if (today < m.starts_on || today > m.ends_on)
      throw new IdentityError(
        'MARATHON_NOT_ACTIVE',
        409,
        'The marathon is not active',
      );
  }
  async saveReport(token: string, key: string, date: string, r: Report) {
    const user = await this.user(token),
      m = await this.membership(user.userId);
    this.assertReportDate(m, date);
    const values = [
      r.morningShake,
      r.physicalActivity,
      r.waterTarget,
      r.secondShake,
      r.healthyDinner,
      r.goodSleep,
      r.noJunkFood,
      r.noSmoking,
    ];
    return this.idempotent(
      user.userId,
      'marathonWellnessReport',
      key,
      { date, ...r },
      async (c) => {
        const saved = await c.query<{ updatedAt: Date }>(
          `insert into marathon_wellness_reports(id,membership_id,report_date,morning_shake,physical_activity,water_target,second_shake,healthy_dinner,good_sleep,no_junk_food,no_smoking) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(membership_id,report_date) do update set morning_shake=excluded.morning_shake,physical_activity=excluded.physical_activity,water_target=excluded.water_target,second_shake=excluded.second_shake,healthy_dinner=excluded.healthy_dinner,good_sleep=excluded.good_sleep,no_junk_food=excluded.no_junk_food,no_smoking=excluded.no_smoking,updated_at=now() returning updated_at "updatedAt"`,
          [randomUUID(), m.id, date, ...values],
        );
        return {
          status: 'reported',
          reportDate: date,
          ...r,
          markedCount: values.filter(Boolean).length,
          updatedAt: saved.rows[0]!.updatedAt.toISOString(),
        };
      },
    );
  }
  async saveTask(
    token: string,
    key: string,
    date: string,
    input: { title: string; description: string },
  ) {
    const user = await this.user(token),
      m = await this.membership(user.userId);
    this.assertActive(m);
    if (m.role !== 'captain')
      throw new IdentityError(
        'MARATHON_CAPTAIN_REQUIRED',
        403,
        'Captain membership is required',
      );
    const today = calendarDateInTimezone(new Date(), m.timezone);
    if (date !== today)
      throw new IdentityError(
        'VALIDATION_ERROR',
        422,
        'Task date must be the current marathon date',
      );
    return this.idempotent(
      user.userId,
      'marathonCaptainTask',
      key,
      { date, ...input },
      async (c) => {
        const q = await c.query<{ id: string; updatedAt: Date }>(
          `insert into marathon_captain_tasks(id,team_id,task_date,title,description,created_by_membership_id) values($1,$2,$3,$4,$5,$6) on conflict(team_id,task_date) do update set title=excluded.title,description=excluded.description,updated_at=now() returning id,updated_at "updatedAt"`,
          [randomUUID(), m.team_id, date, input.title, input.description, m.id],
        );
        return {
          id: q.rows[0]!.id,
          teamId: m.team_id,
          taskDate: date,
          ...input,
          updatedAt: q.rows[0]!.updatedAt.toISOString(),
        };
      },
    );
  }
  async completeTask(
    token: string,
    key: string,
    taskId: string,
    completed: boolean,
  ) {
    const user = await this.user(token),
      m = await this.membership(user.userId);
    return this.idempotent(
      user.userId,
      'marathonTaskCompletion',
      key,
      { taskId, completed },
      async (c) => {
        const task = await c.query<{ id: string; task_date: string }>(
          `select id,task_date::text from marathon_captain_tasks where id=$1 and team_id=$2`,
          [taskId, m.team_id],
        );
        if (!task.rows[0])
          throw new IdentityError('MARATHON_NOT_FOUND', 404, 'Task not found');
        if (
          task.rows[0].task_date !==
          calendarDateInTimezone(new Date(), m.timezone)
        )
          throw new IdentityError(
            'MARATHON_TASK_DATE_INVALID',
            409,
            'Only the current marathon task can be completed',
          );
        const q = await c.query<{ updatedAt: Date }>(
          `insert into marathon_task_completions(id,task_id,membership_id,completed) values($1,$2,$3,$4) on conflict(task_id,membership_id) do update set completed=excluded.completed,updated_at=now() returning updated_at "updatedAt"`,
          [randomUUID(), taskId, m.id, completed],
        );
        return {
          taskId,
          membershipId: m.id,
          completed,
          updatedAt: q.rows[0]!.updatedAt.toISOString(),
        };
      },
    );
  }
  async today(token: string) {
    const user = await this.user(token),
      m = await this.membership(user.userId),
      displayDate = calendarDateInTimezone(new Date(), m.timezone),
      reportDate = previousCalendarDate(displayDate);
    const task = (
      await this.db.query<CaptainTaskRow>(
        `select t.id,t.task_date::text "taskDate",t.title,t.description,c.completed,c.updated_at "completionUpdatedAt" from marathon_captain_tasks t left join marathon_task_completions c on c.task_id=t.id and c.membership_id=$1 where t.team_id=$2 and t.task_date=$3`,
        [m.id, m.team_id, displayDate],
      )
    ).rows[0];
    const members = await this.db.query<TeamMemberTodayRow>(
      `select mm.id "membershipId",up.display_name "displayName",mm.role,mm.user_id=$1 "isCurrentUser",
        case when wr.id is null then 'unknown' else 'reported' end "wellnessStatus",
        case when wr.id is null then null else (wr.morning_shake::int+wr.physical_activity::int+wr.water_target::int+wr.second_shake::int+wr.healthy_dinner::int+wr.good_sleep::int+wr.no_junk_food::int+wr.no_smoking::int) end "markedCount",
        case when $4::uuid is null then 'notAssigned' when tc.id is null then 'unknown' when tc.completed then 'completed' else 'notCompleted' end "taskStatus",
        case when yesterday_weight.id is null or today_weight.id is null then null
          else round(((yesterday_weight.weight_kg-today_weight.weight_kg)/yesterday_weight.weight_kg*100)::numeric,2)::float8
        end "dailyPercent"
       from marathon_memberships mm
       left join user_profiles up on up.user_id=mm.user_id
       left join marathon_wellness_reports wr on wr.membership_id=mm.id and wr.report_date=$3::date-1
       left join marathon_task_completions tc on tc.membership_id=mm.id and tc.task_id=$4
       left join weight_entries yesterday_weight on yesterday_weight.user_id=mm.user_id and yesterday_weight.local_date=$3::date-1 and yesterday_weight.is_current
       left join weight_entries today_weight on today_weight.user_id=mm.user_id and today_weight.local_date=$3 and today_weight.is_current
       where mm.team_id=$2 order by mm.created_at`,
      [user.userId, m.team_id, displayDate, task?.id ?? null],
    );
    const safeMembers = members.rows.map((x) => ({
      membershipId: x.membershipId,
      displayName: x.displayName,
      role: x.role,
      isCurrentUser: x.isCurrentUser,
    }));
    return {
      displayDate,
      reportDate,
      team: { id: m.team_id, name: m.team_name },
      currentMembership: { id: m.id, role: m.role, isCurrentUser: true },
      captainTask: task
        ? {
            id: task.id,
            taskDate: task.taskDate,
            title: task.title,
            description: task.description,
            currentUserCompletion: {
              status:
                task.completed == null
                  ? 'unknown'
                  : task.completed
                    ? 'completed'
                    : 'notCompleted',
              updatedAt: task.completionUpdatedAt?.toISOString() ?? null,
            },
          }
        : null,
      members: members.rows.map((x) => ({
        ...safeMembers.find(
          (member) => member.membershipId === x.membershipId,
        )!,
        weight:
          x.dailyPercent == null
            ? { status: 'unknown' as const, dailyPercent: null }
            : { status: 'reported' as const, dailyPercent: x.dailyPercent },
        wellness: { status: x.wellnessStatus, markedCount: x.markedCount },
        captainTask: { status: x.taskStatus },
      })),
      podiums: {
        weight: podium(
          members.rows
            .filter((member) => member.dailyPercent != null)
            .map((member) => ({
              ...safeMembers.find(
                (safe) => safe.membershipId === member.membershipId,
              )!,
              value: member.dailyPercent!,
            })),
        ),
        wellness: podium(
          members.rows
            .filter((member) => member.markedCount != null)
            .map((member) => ({
              ...safeMembers.find(
                (safe) => safe.membershipId === member.membershipId,
              )!,
              value: member.markedCount!,
            })),
        ),
        captainTask: podium(
          members.rows
            .filter((member) => member.taskStatus === 'completed')
            .map((member) => ({
              ...safeMembers.find(
                (safe) => safe.membershipId === member.membershipId,
              )!,
              value: true,
            })),
        ),
      },
    };
  }
  async consentMetadata(token: string) {
    const user = await this.user(token);
    const q = await this.db.query<{ accepted_at: Date }>(
      `select accepted_at from user_consents where user_id=$1 and consent_type='aiProviderProcessing' and document_version=$2`,
      [user.userId, this.options.consentVersion],
    );
    return {
      providerMode: this.options.providerMode,
      externalProviderEnabled: this.options.providerMode === 'genapi',
      documentVersion: this.options.consentVersion,
      disclosure: this.options.consentDisclosure,
      accepted: Boolean(q.rows[0]),
      acceptedAt: q.rows[0]?.accepted_at.toISOString() ?? null,
    };
  }
  async acceptConsent(
    token: string,
    input: { accepted: boolean; documentVersion: string },
  ) {
    const user = await this.user(token);
    if (
      !input.accepted ||
      input.documentVersion !== this.options.consentVersion
    )
      throw new IdentityError(
        'AI_PROVIDER_CONSENT_INVALID',
        409,
        'Current external provider consent is required',
      );
    await this.db.query(
      `insert into user_consents(id,user_id,consent_type,document_version,source) values($1,$2,'aiProviderProcessing',$3,'web') on conflict(user_id,consent_type,document_version) do nothing`,
      [randomUUID(), user.userId, input.documentVersion],
    );
    return this.consentMetadata(token);
  }
}
