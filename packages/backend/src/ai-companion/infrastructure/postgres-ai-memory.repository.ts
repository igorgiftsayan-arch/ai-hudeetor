import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import { AiMemoryRepository } from '../application/ai-memory-repository';
import type { AiMemory, AiMemoryCategory, AiMemorySource } from '../domain/ai-memory';
import type { ExtractedMemoryFact } from '../application/deterministic-memory-extractor';
import { randomUUID } from 'node:crypto';

interface MemoryRow {
  id: string;
  user_id: string;
  category: AiMemoryCategory;
  key: string;
  value: string;
  source: AiMemorySource;
  confidence: string;
  created_at: Date;
  updated_at: Date;
}

export class PostgresAiMemoryRepository extends AiMemoryRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listActive(userId: string): Promise<AiMemory[]> {
    const result = await this.database.query<MemoryRow>(
      `select id,user_id,category,key,value,source,confidence::text,created_at,updated_at
         from ai_memories
        where user_id=$1 and deleted_at is null
        order by array_position(
          array['restriction','trigger','communicationPreference','supportStrategy','goal','preference'],
          category
        ), updated_at desc, id`,
      [userId],
    );
    return result.rows.map(mapMemory);
  }

  async softDelete(
    client: PoolClient,
    userId: string,
    id: string,
  ): Promise<boolean> {
    const result = await client.query(
      `update ai_memories set deleted_at=now(),updated_at=now()
        where id=$1 and user_id=$2 and deleted_at is null`,
      [id, userId],
    );
    return result.rowCount === 1;
  }

  async extractSourceMessage(
    sourceMessageId: string,
  ): Promise<{ userId: string; content: string } | null> {
    const result = await this.database.query<{
      user_id: string;
      content: string;
    }>(
      `select conversation.user_id,message.content
         from ai_messages message
         join ai_conversations conversation on conversation.id=message.conversation_id
        where message.id=$1 and message.role='user'`,
      [sourceMessageId],
    );
    return result.rows[0]
      ? {
          userId: result.rows[0].user_id,
          content: result.rows[0].content,
        }
      : null;
  }

  async applyExtraction(
    client: PoolClient,
    input: {
      userId: string;
      sourceMessageId: string;
      facts: ExtractedMemoryFact[];
    },
  ): Promise<boolean> {
    const receipt = await client.query(
      `insert into ai_memory_extractions
        (id,user_id,source_message_id,status,facts_written)
       values ($1,$2,$3,'completed',$4)
       on conflict (user_id,source_message_id) do nothing`,
      [randomUUID(), input.userId, input.sourceMessageId, input.facts.length],
    );
    if (receipt.rowCount !== 1) return false;
    for (const fact of input.facts)
      await client.query(
        `insert into ai_memories
          (id,user_id,category,key,value,source,confidence,source_message_id)
         values ($1,$2,$3,$4,$5,'conversation',$6,$7)
         on conflict (user_id,category,key) where deleted_at is null
         do update set value=excluded.value,confidence=excluded.confidence,
                       source_message_id=excluded.source_message_id,updated_at=now()`,
        [
          randomUUID(),
          input.userId,
          fact.category,
          fact.key,
          fact.value,
          fact.confidence,
          input.sourceMessageId,
        ],
      );
    return true;
  }
}

function mapMemory(row: MemoryRow): AiMemory {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    key: row.key,
    value: row.value,
    source: row.source,
    confidence: Number(row.confidence),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
