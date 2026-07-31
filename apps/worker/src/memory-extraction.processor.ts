import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { DatabaseService, ExtractMemoryUseCase } from '@atlas/backend';
import {
  DatabaseService as DatabaseToken,
  ExtractMemoryUseCase as ExtractMemoryUseCaseToken,
} from '@atlas/backend';

@Injectable()
export class MemoryExtractionProcessor {
  constructor(
    @Inject(DatabaseToken) private readonly database: DatabaseService,
    @Inject(ExtractMemoryUseCaseToken)
    private readonly extractMemory: ExtractMemoryUseCase,
  ) {}

  async process(job: Job<{ outboxId: string }>): Promise<void> {
    if (job.name !== 'memory-extraction') return;
    const event = await this.database.query<{
      payload: { sourceMessageId?: string };
    }>(
      `select payload from outbox_messages
        where id=$1 and event_type='ai-companion.memory_extraction_requested.v1'`,
      [job.data.outboxId],
    );
    const sourceMessageId = event.rows[0]?.payload.sourceMessageId;
    if (!sourceMessageId) return;
    await this.extractMemory.execute(sourceMessageId);
  }
}
