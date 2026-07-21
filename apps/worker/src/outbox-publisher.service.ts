import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';

@Injectable()
export class OutboxPublisherService implements OnModuleInit {
  constructor(
    @Inject(DatabaseToken) private readonly database: DatabaseService,
    @InjectQueue('atlas-system') private readonly queue: Queue,
  ) {}
  onModuleInit(): void {
    setInterval(() => void this.publish(), 1000).unref();
    void this.publish();
  }
  async publish(): Promise<void> {
    const rows = await this.database.query<{ id: string }>(
      `select id from outbox_messages where published_at is null and event_type='ai-companion.quick_reply_requested.v1' order by created_at limit 50`,
    );
    for (const row of rows.rows) {
      await this.queue.add(
        'ai-operation',
        { outboxId: row.id },
        {
          jobId: row.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      await this.database.query(
        `update outbox_messages set published_at=now() where id=$1 and published_at is null`,
        [row.id],
      );
    }
  }
}
