import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';

export type ReconciledAiSuccess = {
  operationId: string;
  providerRequestId: string;
  providerResponseId: string;
  providerModel: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number | null;
  latencyMs: number;
  parametersHash: string;
};

export class FinalizeReconciledAiOutcomeUseCase {
  constructor(private readonly database: DatabaseService) {}

  execute(
    input: ReconciledAiSuccess,
  ): Promise<{ status: 'succeeded'; replay: boolean }> {
    return this.database.transaction(async (client) => {
      const operation = await client.query<{
        status: string;
        provider_reference: string | null;
        user_id: string;
        conversation_id: string;
        input_message_id: string;
      }>(
        `select status,provider_reference,user_id,conversation_id,input_message_id
           from ai_operations where id=$1 for update`,
        [input.operationId],
      );
      const row = operation.rows[0];
      if (!row) throw new Error('AI operation not found');
      if (
        row.status === 'succeeded' &&
        row.provider_reference === input.providerRequestId
      )
        return { status: 'succeeded' as const, replay: true };
      if (row.status !== 'outcomeUnknown' || row.provider_reference)
        throw new Error('AI operation is not safely reconcilable');

      const reservation = await client.query<{
        id: string;
        wallet_id: string;
      }>(
        `select id,wallet_id from token_transactions
          where operation_id=$1 and entry_type='aiReservation' for update`,
        [input.operationId],
      );
      if (reservation.rowCount !== 1)
        throw new Error('AI reservation invariant failed');
      const terminal = await client.query<{ count: string }>(
        `select count(*)::text count from token_transactions
          where operation_id=$1 and entry_type in ('aiConfirmation','aiRefund')`,
        [input.operationId],
      );
      if (terminal.rows[0]?.count !== '0')
        throw new Error('AI terminal ledger effect already exists');

      const outputMessageId = randomUUID();
      await client.query(
        `insert into ai_messages (id,conversation_id,role,content,prompt_version)
         values ($1,$2,'assistant',$3,'quick-reply-v1')`,
        [outputMessageId, row.conversation_id, input.text],
      );
      await client.query(
        `insert into token_transactions
          (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id,reservation_id)
         values ($1,$2,$3,'aiConfirmation',0,'aiOperation',$4,$4,$5)`,
        [
          randomUUID(),
          reservation.rows[0]!.wallet_id,
          row.user_id,
          input.operationId,
          reservation.rows[0]!.id,
        ],
      );
      await client.query(
        `update ai_operations set
           status='succeeded',output_message_id=$2,provider_reference=$3,
           provider_model=$4,provider_input_tokens=$5,provider_output_tokens=$6,
           provider_total_tokens=$7,provider_cost=$8,provider_latency_ms=$9,
           updated_at=now()
         where id=$1 and status='outcomeUnknown'`,
        [
          input.operationId,
          outputMessageId,
          input.providerRequestId,
          input.providerModel,
          input.inputTokens,
          input.outputTokens,
          input.totalTokens,
          input.cost,
          input.latencyMs,
        ],
      );
      await client.query(
        `insert into outbox_messages
          (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
         values (
           $1,'ai-companion.memory_extraction_requested.v1','aiOperation',$2,
           jsonb_build_object(
             'userId',($3::uuid)::text,
             'operationId',($2::uuid)::text,
             'sourceMessageId',($4::uuid)::text
           ),now(),now(),0
         )`,
        [randomUUID(), input.operationId, row.user_id, row.input_message_id],
      );
      await client.query(
        `insert into outbox_messages
          (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,published_at,attempts)
         values (
           $1,'ai-companion.outcome_reconciled.v1','aiOperation',$2,
           jsonb_build_object(
             'operationId',($2::uuid)::text,
             'providerRequestId',$3::text,
             'providerResponseId',$4::text,
             'parametersHash',$5::text,
             'result','succeeded'
           ),now(),now(),now(),0
         )`,
        [
          randomUUID(),
          input.operationId,
          input.providerRequestId,
          input.providerResponseId,
          input.parametersHash,
        ],
      );
      return { status: 'succeeded' as const, replay: false };
    });
  }
}
