import 'reflect-metadata';
import {
  DatabaseService,
  FinalizeReconciledAiOutcomeUseCase,
  GenApiOutcomeReconciliationClient,
  GetCompanionProfileContextUseCase,
  GetCompanionWeightContextUseCase,
  MemoryContextBuilder,
  PostgresAiMemoryRepository,
} from '@atlas/backend';
import { loadWorkerConfig } from './config/load-config';

async function main(): Promise<void> {
  const operationId = required('RECONCILE_OPERATION_ID');
  const providerRequestId = required('RECONCILE_PROVIDER_REQUEST_ID');
  const requestApiBaseUrl = required('GENAPI_RECONCILIATION_BASE_URL');
  const config = loadWorkerConfig();
  if (config.AI_PROVIDER !== 'genapi')
    throw new Error('GenAPI reconciliation requires AI_PROVIDER=genapi');

  const database = new DatabaseService(config.DATABASE_URL);
  try {
    const operation = await database.query<{
      user_id: string;
      conversation_id: string;
      input_message_id: string;
      persona_id: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `select operation.user_id,operation.conversation_id,operation.input_message_id,
              preference.persona_id,operation.created_at,operation.updated_at
         from ai_operations operation
         join ai_preferences preference on preference.user_id=operation.user_id
        where operation.id=$1 and operation.status in ('outcomeUnknown','succeeded')`,
      [operationId],
    );
    const row = operation.rows[0];
    if (!row) throw new Error('Reconcilable AI operation not found');
    const history = await database.query<{
      role: 'user' | 'assistant';
      content: string;
    }>(
      `select role,content from ai_messages
        where conversation_id=$1
          and created_at <= (select created_at from ai_messages where id=$2)
        order by created_at,id`,
      [row.conversation_id, row.input_message_id],
    );
    const profile = new GetCompanionProfileContextUseCase(database);
    const weight = new GetCompanionWeightContextUseCase(database);
    const memory = new PostgresAiMemoryRepository(database);
    const builder = new MemoryContextBuilder({
      profile: (userId) => profile.execute(userId),
      weight: (userId) => weight.execute(userId),
      memories: (userId) => memory.listActive(userId),
    });
    const request = {
      operationId,
      promptVersion: 'quick-reply-v1' as const,
      personaId: row.persona_id,
      memoryContext: await builder.build(
        row.user_id,
        history.rows.at(-1)?.content ?? '',
      ),
      messages: history.rows,
    };
    const verifier = new GenApiOutcomeReconciliationClient({
      apiKey: config.GENAPI_API_KEY!,
      requestApiBaseUrl,
      model: config.GENAPI_MODEL!,
    });
    const verified = await verifier.verifySuccess({
      operationId,
      providerRequestId,
      request,
      operationCreatedAt: row.created_at,
      outcomeUnknownAt: row.updated_at,
    });
    const result = await new FinalizeReconciledAiOutcomeUseCase(
      database,
    ).execute(verified);
    process.stdout.write(
      `${JSON.stringify({
        event: 'ai_outcome_reconciliation',
        operationId,
        providerRequestId,
        status: result.status,
        replay: result.replay,
      })}\n`,
    );
  } finally {
    await database.onApplicationShutdown();
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'ai_outcome_reconciliation_failed',
      error:
        error instanceof Error ? error.message : 'Unknown reconciliation error',
    }),
  );
  process.exitCode = 1;
});
