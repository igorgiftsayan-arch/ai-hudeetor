import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
export class ListWeightEntriesUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
  ) {}
  async execute(accessToken: string) {
    const user = await this.currentUser.execute(accessToken);
    const r = await this.database.query<{
      id: string;
      weight_kg: string;
      recorded_at: Date;
      source: 'manual';
    }>(
      `select id,weight_kg::text,recorded_at,source
       from weight_entries
       where user_id=$1 and is_current
       order by local_date desc,recorded_at desc,id desc
       limit 50`,
      [user.userId],
    );
    return {
      items: r.rows.map((x) => ({
        id: x.id,
        weightKg: x.weight_kg,
        recordedAt: x.recorded_at.toISOString(),
        source: x.source,
      })),
      nextCursor: null,
    };
  }
}
