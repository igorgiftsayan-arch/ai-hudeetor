import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private interval?: ReturnType<typeof setInterval>;
  private activePublish?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(DatabaseToken) private readonly database: DatabaseService,
    @InjectQueue('atlas-system') private readonly queue: Queue,
  ) {}
  onModuleInit(): void {
    this.interval = setInterval(() => this.poll(), 1000);
    this.interval.unref();
    this.poll();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.interval) clearInterval(this.interval);
    await this.activePublish;
  }
  private poll(): void {
    if (this.stopping || this.activePublish) return;
    this.activePublish = this.publish()
      .catch((error: unknown) => {
        const code =
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : undefined;
        const errorCode =
          typeof code === 'string' &&
          [
            'EAI_AGAIN',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            '57P01',
            '57P02',
            '57P03',
          ].includes(code)
            ? code
            : 'dependencyUnavailable';
        console.error(
          JSON.stringify({ event: 'outbox_publish_error', errorCode }),
        );
      })
      .finally(() => {
        this.activePublish = undefined;
      });
  }
  async publish(): Promise<void> {
    const rows = await this.database.query<{ id: string; event_type: string }>(
      `select id,event_type from outbox_messages
        where published_at is null
          and available_at <= now()
          and event_type in (
            'ai-companion.quick_reply_requested.v1',
            'ai-companion.memory_extraction_requested.v1',
            'food.analysis_requested.v1',
            'food.analysis_reconciliation_requested.v1',
            'ai-companion.operation_reconciliation_requested.v1',
            'notifications.push_delivery_requested.v1'
          )
        order by created_at limit 50`,
    );
    for (const row of rows.rows) {
      await this.queue.add(
        row.event_type === 'ai-companion.memory_extraction_requested.v1'
          ? 'memory-extraction'
          : row.event_type === 'food.analysis_requested.v1'
            ? 'food-analysis'
            : row.event_type === 'food.analysis_reconciliation_requested.v1'
              ? 'food-analysis-reconciliation'
              : row.event_type ===
                  'ai-companion.operation_reconciliation_requested.v1'
                ? 'ai-operation-reconciliation'
                : row.event_type === 'notifications.push_delivery_requested.v1'
                  ? 'push-delivery'
                  : 'ai-operation',
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
