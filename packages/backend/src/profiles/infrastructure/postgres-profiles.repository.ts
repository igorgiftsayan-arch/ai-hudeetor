import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import { ProfilesRepository } from '../application/profiles-repository';
import type { AiPreference, UserProfile } from '../domain/profile-types';

export class PostgresProfilesRepository extends ProfilesRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async upsertProfile(
    client: PoolClient,
    input: UserProfile,
  ): Promise<UserProfile> {
    const result = await client.query<{ user_id: string; timezone: string }>(
      `insert into user_profiles (user_id, timezone)
       values ($1, $2)
       on conflict (user_id) do update set timezone = excluded.timezone, updated_at = now()
       returning user_id, timezone`,
      [input.userId, input.timezone],
    );
    return mapProfile(result.rows[0]!);
  }

  async findProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.database.query<{
      user_id: string;
      timezone: string;
    }>('select user_id, timezone from user_profiles where user_id = $1', [
      userId,
    ]);
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }

  async findPreference(userId: string): Promise<AiPreference | null> {
    const result = await this.database.query<PreferenceRow>(
      `select user_id, persona_id, strictness, response_length
         from ai_preferences where user_id = $1`,
      [userId],
    );
    return result.rows[0] ? mapPreference(result.rows[0]) : null;
  }

  async lockPreference(
    client: PoolClient,
    userId: string,
  ): Promise<AiPreference | null> {
    const result = await client.query<PreferenceRow>(
      `select user_id, persona_id, strictness, response_length
         from ai_preferences where user_id = $1 for update`,
      [userId],
    );
    return result.rows[0] ? mapPreference(result.rows[0]) : null;
  }

  async upsertPreference(
    client: PoolClient,
    input: AiPreference,
  ): Promise<AiPreference> {
    const result = await client.query<PreferenceRow>(
      `insert into ai_preferences (user_id, persona_id, strictness, response_length)
       values ($1, $2, $3, $4)
       on conflict (user_id) do update
         set persona_id = excluded.persona_id,
             strictness = excluded.strictness,
             response_length = excluded.response_length,
             updated_at = now()
       returning user_id, persona_id, strictness, response_length`,
      [input.userId, input.personaId, input.strictness, input.responseLength],
    );
    return mapPreference(result.rows[0]!);
  }

  async insertPersonaSelectedEvent(
    client: PoolClient,
    input: { userId: string; personaId: string },
  ): Promise<void> {
    await client.query(
      `insert into outbox_messages
        (id, event_type, aggregate_type, aggregate_id, payload, occurred_at, available_at, attempts)
       values (gen_random_uuid(), 'profiles.ai_persona_selected.v1', 'user', $1,
               jsonb_build_object('userId', ($1::uuid)::text, 'personaId', $2::text, 'context', 'onboarding', 'version', 1),
               now(), now(), 0)`,
      [input.userId, input.personaId],
    );
  }
}

interface PreferenceRow {
  user_id: string;
  persona_id: AiPreference['personaId'];
  strictness: AiPreference['strictness'];
  response_length: AiPreference['responseLength'];
}

function mapProfile(row: { user_id: string; timezone: string }): UserProfile {
  return { userId: row.user_id, timezone: row.timezone };
}

function mapPreference(row: PreferenceRow): AiPreference {
  return {
    userId: row.user_id,
    personaId: row.persona_id,
    strictness: row.strictness,
    responseLength: row.response_length,
  };
}
