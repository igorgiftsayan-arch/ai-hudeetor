import type { DatabaseService } from '../../infrastructure/database/database.service';

export interface CompanionProfileContext {
  timezone: string;
  displayName: string | null;
  targetWeightKg: string | null;
  personaId: string | null;
}

export class GetCompanionProfileContextUseCase {
  constructor(private readonly database: DatabaseService) {}

  async execute(userId: string): Promise<CompanionProfileContext> {
    const result = await this.database.query<{
      timezone: string;
      display_name: string | null;
      target_weight_kg: string | null;
      persona_id: string | null;
    }>(
      `select profile.timezone,profile.display_name,
              profile.target_weight_kg::text,preference.persona_id
         from user_profiles profile
         left join ai_preferences preference on preference.user_id=profile.user_id
        where profile.user_id=$1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      timezone: row?.timezone ?? 'UTC',
      displayName: row?.display_name ?? null,
      targetWeightKg: row?.target_weight_kg ?? null,
      personaId: row?.persona_id ?? null,
    };
  }
}
