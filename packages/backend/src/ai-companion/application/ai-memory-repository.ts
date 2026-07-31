import type { PoolClient } from 'pg';
import type { AiMemory } from '../domain/ai-memory';
import type { ExtractedMemoryFact } from './deterministic-memory-extractor';

export abstract class AiMemoryRepository {
  abstract listActive(userId: string): Promise<AiMemory[]>;
  abstract softDelete(client: PoolClient, userId: string, id: string): Promise<boolean>;
  abstract extractSourceMessage(
    sourceMessageId: string,
  ): Promise<{ userId: string; content: string } | null>;
  abstract applyExtraction(
    client: PoolClient,
    input: {
      userId: string;
      sourceMessageId: string;
      facts: ExtractedMemoryFact[];
    },
  ): Promise<boolean>;
}
