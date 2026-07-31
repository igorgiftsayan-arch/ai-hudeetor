import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { AiMemoryRepository } from './ai-memory-repository';
import type { DeterministicMemoryExtractor } from './deterministic-memory-extractor';

export class ExtractMemoryUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: AiMemoryRepository,
    private readonly extractor: DeterministicMemoryExtractor,
  ) {}

  async execute(sourceMessageId: string): Promise<void> {
    const source = await this.repository.extractSourceMessage(sourceMessageId);
    if (!source) return;
    const facts = this.extractor.extract(source.content);
    await this.database.transaction((client) =>
      this.repository.applyExtraction(client, {
        userId: source.userId,
        sourceMessageId,
        facts,
      }),
    );
  }
}
