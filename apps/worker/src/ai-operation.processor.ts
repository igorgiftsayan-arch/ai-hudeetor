import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { DatabaseService, AiProviderAdapter } from '@atlas/backend';
import {
  AiProviderAdapter as AiProviderAdapterToken,
  DatabaseService as DatabaseToken,
} from '@atlas/backend';

@Processor('atlas-system')
export class AiOperationProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseToken) private readonly database: DatabaseService,
    @Inject(AiProviderAdapterToken) private readonly adapter: AiProviderAdapter,
  ) {
    super();
  }

  async process(job: Job<{ outboxId: string }>): Promise<void> {
    const event = await this.database.query<{
      payload: { operationId: string };
    }>(
      `select payload from outbox_messages where id=$1 and event_type='ai-companion.quick_reply_requested.v1'`,
      [job.data.outboxId],
    );
    const operationId = event.rows[0]?.payload.operationId;
    if (!operationId) return;
    const claimed = await this.database.transaction(async (client) => {
      const result = await client.query<{
        persona_id: string;
        user_id: string;
        conversation_id: string;
      }>(
        `update ai_operations set status='processing',runtime_adapter=$2,updated_at=now()
          where id=$1 and status='queued'
          returning user_id,conversation_id,
            (select persona_id from ai_preferences where user_id=ai_operations.user_id) as persona_id`,
        [operationId, this.adapter.providerName],
      );
      return result.rows[0] ?? null;
    });
    if (!claimed) return;
    const consent =
      this.adapter.providerName === 'fake' ||
      Boolean(
        (
          await this.database.query(
            `select 1 from user_consents
              where user_id=$1 and consent_type='aiProviderProcessing'
              limit 1`,
            [claimed.user_id],
          )
        ).rows[0],
      );
    const history = await this.database.query<{
      role: 'user' | 'assistant';
      content: string;
    }>(
      `select role,content from ai_messages
        where conversation_id=$1 order by created_at,id`,
      [claimed.conversation_id],
    );
    const startedAt = Date.now();
    const result = consent
      ? await this.adapter.execute({
          operationId,
          promptVersion: 'quick-reply-v1',
          personaId: claimed.persona_id,
          messages: history.rows,
        })
      : ({ kind: 'technicalError', errorClass: 'safetyRejected' } as const);
    const latencyMs = Date.now() - startedAt;
    await this.database.transaction(async (client) => {
      const operation = await client.query<{
        user_id: string;
        conversation_id: string;
      }>(
        `select user_id,conversation_id from ai_operations where id=$1 and status='processing' for update`,
        [operationId],
      );
      if (!operation.rows[0]) return;
      const row = operation.rows[0];
      const reservation = await client.query<{
        id: string;
        wallet_id: string;
        amount_tokens: number;
      }>(
        `select id,wallet_id,amount_tokens from token_transactions where operation_id=$1 and entry_type='aiReservation' for update`,
        [operationId],
      );
      const r = reservation.rows[0]!;
      if (result.kind === 'success') {
        const assistantMessage = await client.query<{ id: string }>(
          `insert into ai_messages (id,conversation_id,role,content,prompt_version)
           values (gen_random_uuid(),$1,'assistant',$2,'quick-reply-v1') returning id`,
          [row.conversation_id, result.text],
        );
        await client.query(
          `insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiConfirmation',0,'aiOperation',$3,$3,$4)`,
          [r.wallet_id, row.user_id, operationId, r.id],
        );
        await client.query(
          `update ai_operations set status='succeeded',output_message_id=$2,
             provider_reference=$3,provider_model=$4,provider_input_tokens=$5,
             provider_output_tokens=$6,provider_total_tokens=$7,provider_cost=$8,
             provider_latency_ms=$9,updated_at=now() where id=$1`,
          [
            operationId,
            assistantMessage.rows[0]!.id,
            result.providerReference ?? null,
            this.adapter.providerName === 'genapi' ? process.env.GENAPI_MODEL : null,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.totalTokens,
            result.usage.cost ?? null,
            latencyMs,
          ],
        );
      } else if (result.kind === 'technicalError') {
        await client.query(
          `insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiRefund',$3,'aiOperation',$4,$4,$5)`,
          [r.wallet_id, row.user_id, -r.amount_tokens, operationId, r.id],
        );
        await client.query(
          `update ai_operations set status='technicalError',error_class=$2,updated_at=now() where id=$1`,
          [operationId, result.errorClass],
        );
      } else
        await client.query(
          `update ai_operations set status='outcomeUnknown',updated_at=now() where id=$1`,
          [operationId],
        );
    });
  }
}
