import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import { AiDailyStateRepository } from '../application/ai-daily-state-repository';
import { AiCompanionError } from '../domain/ai-companion-error';
import {
  applyAiDailyStateTransition,
  type AiDailyState,
  type AiDailyStateStatus,
} from '../domain/ai-daily-state';

interface AiDailyStateRow {
  id: string;
  user_id: string;
  local_date: string;
  status: AiDailyStateStatus;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresAiDailyStateRepository extends AiDailyStateRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async getOrCreateToday(userId: string): Promise<AiDailyState> {
    const result = await this.database.query<AiDailyStateRow>(
      `insert into ai_daily_states (id,user_id,local_date,status)
       select $1,profile.user_id,
              (current_timestamp at time zone profile.timezone)::date,
              'notStarted'
         from user_profiles profile
        where profile.user_id=$2
       on conflict (user_id,local_date)
       do update set user_id=excluded.user_id
       returning id,user_id,local_date::text,status,started_at,completed_at,
                 created_at,updated_at`,
      [randomUUID(), userId],
    );
    const row = result.rows[0];
    if (!row)
      throw new AiCompanionError(
        'PROFILE_TIMEZONE_REQUIRED',
        409,
        'A valid profile timezone is required for the daily coach',
      );
    return mapState(row);
  }

  async transition(input: {
    userId: string;
    stateId: string;
    targetStatus: Exclude<AiDailyStateStatus, 'notStarted'>;
    idempotencyKey: string;
  }): Promise<AiDailyState> {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          stateId: input.stateId,
          targetStatus: input.targetStatus,
        }),
      )
      .digest('hex');
    return this.database.transaction(async (client) => {
      await client.query(
        `insert into idempotency_records
          (id,user_id,operation_scope,idempotency_key,request_hash,state)
         values ($1,$2,'aiDailyStateTransition',$3,$4,'processing')
         on conflict do nothing`,
        [randomUUID(), input.userId, input.idempotencyKey, requestHash],
      );
      const idempotency = await client.query<{
        request_hash: string;
        state: string;
        response_body: AiDailyState | null;
      }>(
        `select request_hash,state,response_body
           from idempotency_records
          where user_id=$1 and operation_scope='aiDailyStateTransition'
            and idempotency_key=$2
          for update`,
        [input.userId, input.idempotencyKey],
      );
      const record = idempotency.rows[0]!;
      if (record.request_hash !== requestHash)
        throw new AiCompanionError(
          'IDEMPOTENCY_KEY_REUSED',
          409,
          'The idempotency key was already used with another request',
        );
      if (record.state === 'completed' && record.response_body)
        return record.response_body;

      const current = await client.query<AiDailyStateRow>(
        `select id,user_id,local_date::text,status,started_at,completed_at,
                created_at,updated_at
           from ai_daily_states
          where id=$1 and user_id=$2
          for update`,
        [input.stateId, input.userId],
      );
      const row = current.rows[0];
      if (!row)
        throw new AiCompanionError(
          'RESOURCE_NOT_FOUND',
          404,
          'Daily state not found',
        );
      const transition = applyAiDailyStateTransition(
        row.status,
        input.targetStatus,
      );
      let state = mapState(row);
      if (transition.changed) {
        const updated = await client.query<AiDailyStateRow>(
          `update ai_daily_states
              set status=$1,
                  started_at=case when $1='inProgress' then now() else started_at end,
                  completed_at=case when $1='completed' then now() else null end,
                  updated_at=now()
            where id=$2 and user_id=$3
            returning id,user_id,local_date::text,status,started_at,completed_at,
                      created_at,updated_at`,
          [transition.status, input.stateId, input.userId],
        );
        state = mapState(updated.rows[0]!);
      }
      await client.query(
        `update idempotency_records
            set state='completed',response_status=200,response_body=$1::jsonb,
                completed_at=now()
          where user_id=$2 and operation_scope='aiDailyStateTransition'
            and idempotency_key=$3`,
        [JSON.stringify(state), input.userId, input.idempotencyKey],
      );
      return state;
    });
  }
}

function mapState(row: AiDailyStateRow): AiDailyState {
  return {
    id: row.id,
    userId: row.user_id,
    localDate: row.local_date,
    status: row.status,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
