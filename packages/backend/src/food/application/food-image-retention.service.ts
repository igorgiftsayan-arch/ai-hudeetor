import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';

export interface FoodImageDeletionPort {
  deleteObject(key: string): Promise<void>;
}

type Cleanup = {
  id: string;
  image_id: string;
  reason: string;
  original_object_key: string;
  staging_object_key: string;
};

// PostgreSQL is the durable cleanup queue. Storage deletion is idempotent, so an
// expired lease can safely replay after a crash between S3 and the DB commit.
export class FoodImageRetentionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: FoodImageDeletionPort,
  ) {}

  async enqueueDue(
    now = new Date(),
  ): Promise<{ enqueued: number; skippedUnknownTerminalTime: number }> {
    const result = await this.db.query(
      `insert into food_image_cleanup_jobs(image_id,original_object_key,staging_object_key)
      select i.id,i.object_key,'food-staging/'||i.user_id::text||'/'||i.id::text
      from uploaded_images i
      where i.deleted_at is null and i.status='available'
        and i.uploaded_at <= $1::timestamptz-interval '600 seconds'
        and i.created_at <= $1::timestamptz-interval '600 seconds'
        and exists(select 1 from food_analyses a where a.uploaded_image_id=i.id)
        and not exists(select 1 from food_analyses a where a.uploaded_image_id=i.id and
          (a.status not in ('analyzed','technicalError') or a.terminal_at is null or a.terminal_at > $1::timestamptz-interval '30 days'))
      on conflict(image_id) do nothing`,
      [now],
    );
    const skipped = await this.db.query<{ count: number }>(
      `select count(*)::int count from food_analyses a join uploaded_images i on i.id=a.uploaded_image_id where a.status in ('analyzed','technicalError') and a.terminal_at is null and i.deleted_at is null`,
    );
    return {
      enqueued: result.rowCount ?? 0,
      skippedUnknownTerminalTime: skipped.rows[0]?.count ?? 0,
    };
  }

  async processOne(now = new Date()): Promise<boolean> {
    const lease = randomUUID();
    const claimed = await this.db.transaction(async (client) => {
      const job = (
        await client.query<Cleanup>(
          `select id,image_id,original_object_key,staging_object_key,reason from food_image_cleanup_jobs
        where (status='queued' and available_at <= $1) or (status='processing' and lease_expires_at <= $1)
        order by available_at,id limit 1 for update skip locked`,
          [now],
        )
      ).rows[0];
      if (!job) return null;
      // The same image lock is held by upload completion and analysis creation.
      await client.query(
        'select id from uploaded_images where id=$1 for update',
        [job.image_id],
      );
      const eligible = await client.query(
        `select 1 from uploaded_images i where i.id=$1 and i.status in ('available','deleted')
        and i.uploaded_at <= $2::timestamptz-interval '600 seconds' and i.created_at <= $2::timestamptz-interval '600 seconds'
        and exists(select 1 from food_analyses a where a.uploaded_image_id=i.id)
        and not exists(select 1 from food_analyses a where a.uploaded_image_id=i.id and
          (a.status not in ('analyzed','technicalError') or ($3='retention' and (a.terminal_at is null or a.terminal_at > $2::timestamptz-interval '30 days'))))`,
        [job.image_id, now, job.reason],
      );
      if (!eligible.rowCount) {
        await client.query(`update food_image_cleanup_jobs set status='queued',available_at=$2::timestamptz+interval '1 minute',lease_expires_at=null where id=$1`, [job.id,now]);
        return null;
      }
      await client.query(
        `update uploaded_images set deleted_at=coalesce(deleted_at,$2) where id=$1`,
        [job.image_id, now],
      );
      await client.query(
        `update food_image_cleanup_jobs set status='processing',lease_id=$2,lease_expires_at=$3::timestamptz+interval '5 minutes',attempts=attempts+1 where id=$1`,
        [job.id, lease, now],
      );
      return job;
    });
    if (!claimed) return false;
    try {
      for (const key of new Set([
        claimed.original_object_key,
        claimed.staging_object_key,
      ]))
        await this.storage.deleteObject(key);
      await this.db.transaction(async (client) => {
        const done = await client.query(
          `update food_image_cleanup_jobs set status='completed',completed_at=$3,last_error_category=null,lease_expires_at=null where id=$1 and lease_id=$2 and status='processing' returning image_id`,
          [claimed.id, lease, now],
        );
        if (done.rowCount)
          await client.query(
            `update uploaded_images set status='deleted' where id=$1`,
            [claimed.image_id],
          );
      });
    } catch {
      await this.db.query(
        `update food_image_cleanup_jobs set status='queued',available_at=$3::timestamptz+interval '1 minute',lease_expires_at=null,last_error_category='storageUnavailable' where id=$1 and lease_id=$2 and status='processing'`,
        [claimed.id, lease, now],
      );
    }
    return true;
  }
}
