import type { DatabaseService } from '../../infrastructure/database/database.service';

export interface CompanionWeightContext {
  startWeightKg: string | null;
  currentWeightKg: string | null;
  changeWeightKg: string | null;
  lastRecordedAt: string | null;
}

export class GetCompanionWeightContextUseCase {
  constructor(private readonly database: DatabaseService) {}

  async execute(userId: string): Promise<CompanionWeightContext> {
    const result = await this.database.query<{
      start_weight: string | null;
      current_weight: string | null;
      change_weight: string | null;
      last_recorded_at: Date | null;
    }>(
      `with ranked as (
         select weight_kg,recorded_at,local_date,
                row_number() over (order by local_date,recorded_at,id) as first_rank,
                row_number() over (order by local_date desc,recorded_at desc,id desc) as last_rank
           from weight_entries where user_id=$1 and is_current
       )
       select
         max(weight_kg) filter (where first_rank=1)::text as start_weight,
         max(weight_kg) filter (where last_rank=1)::text as current_weight,
         (max(weight_kg) filter (where last_rank=1) -
          max(weight_kg) filter (where first_rank=1))::text as change_weight,
         max(recorded_at) filter (where last_rank=1) as last_recorded_at
       from ranked`,
      [userId],
    );
    const row = result.rows[0];
    return {
      startWeightKg: row?.start_weight ?? null,
      currentWeightKg: row?.current_weight ?? null,
      changeWeightKg: row?.change_weight ?? null,
      lastRecordedAt: row?.last_recorded_at?.toISOString() ?? null,
    };
  }
}
