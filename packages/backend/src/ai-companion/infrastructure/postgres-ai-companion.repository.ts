import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import { AiCompanionError } from '../domain/ai-companion-error';
import {
  AiCompanionRepository,
  type AiActionPrice,
  type AiConversation,
  type QueuedAiOperation,
  type StartQuickReplyInput,
} from '../application/ai-companion-repository';

const quickReplyScope = 'startQuickReply';
const conversationScope = 'createAiConversation';

export class PostgresAiCompanionRepository extends AiCompanionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async getQuickReplyPrice(userId: string): Promise<AiActionPrice> {
    await this.database.query('select 1 from users where id=$1', [userId]);
    const result = await this.database.query<{
      price_tokens: number;
      version: number;
    }>(
      `select price_tokens, version
         from ai_action_prices
        where action_type='quickReply' and active=true`,
    );
    const price = result.rows[0];
    if (!price)
      throw new AiCompanionError(
        'AI_ACTION_UNAVAILABLE',
        409,
        'Quick reply is unavailable',
      );
    return {
      actionType: 'quickReply',
      priceTokens: price.price_tokens,
      priceVersion: price.version,
    };
  }

  async createConversation(
    client: PoolClient,
    input: { userId: string; idempotencyKey: string },
  ): Promise<AiConversation> {
    const hash = hashPayload({});
    const existing = await this.lockIdempotency<AiConversation>(
      client,
      input.userId,
      conversationScope,
      input.idempotencyKey,
      hash,
    );
    if (existing) return existing;

    const conversation = { id: randomUUID() };
    await client.query(
      'insert into ai_conversations (id,user_id) values ($1,$2)',
      [conversation.id, input.userId],
    );
    await this.completeIdempotency(
      client,
      input.userId,
      conversationScope,
      input.idempotencyKey,
      201,
      conversation,
    );
    return conversation;
  }

  async startQuickReply(
    client: PoolClient,
    input: StartQuickReplyInput,
  ): Promise<QueuedAiOperation> {
    const payload = {
      conversationId: input.conversationId,
      content: input.content.trim(),
      expectedPriceTokens: input.expectedPriceTokens,
      priceVersion: input.priceVersion,
      scenarioId: 'quickReply',
    };
    const hash = hashPayload(payload);
    const existing = await this.lockIdempotency<QueuedAiOperation>(
      client,
      input.userId,
      quickReplyScope,
      input.idempotencyKey,
      hash,
    );
    if (existing) return existing;

    const onboarding = await client.query<{ onboarding_status: string }>(
      'select onboarding_status from users where id=$1 for update',
      [input.userId],
    );
    if (onboarding.rows[0]?.onboarding_status !== 'completed')
      throw new AiCompanionError(
        'ONBOARDING_INCOMPLETE',
        409,
        'Complete onboarding before using AI',
      );

    const conversation = await client.query<{ id: string }>(
      'select id from ai_conversations where id=$1 and user_id=$2',
      [input.conversationId, input.userId],
    );
    if (!conversation.rows[0])
      throw new AiCompanionError(
        'RESOURCE_NOT_FOUND',
        404,
        'Conversation not found',
      );

    const active = await client.query<{ id: string }>(
      `select id from ai_operations
        where user_id=$1 and status in ('queued','processing','outcomeUnknown')
        limit 1`,
      [input.userId],
    );
    if (active.rows[0])
      throw new AiCompanionError(
        'AI_OPERATION_IN_PROGRESS',
        409,
        'An AI operation is already in progress',
      );

    const price = await client.query<{ price_tokens: number; version: number }>(
      `select price_tokens, version from ai_action_prices
        where action_type='quickReply' and active=true for key share`,
    );
    const currentPrice = price.rows[0];
    if (!currentPrice)
      throw new AiCompanionError(
        'AI_ACTION_UNAVAILABLE',
        409,
        'Quick reply is unavailable',
      );
    if (
      currentPrice.price_tokens !== input.expectedPriceTokens ||
      currentPrice.version !== input.priceVersion
    )
      throw new AiCompanionError(
        'AI_ACTION_PRICE_CHANGED',
        409,
        'The quick reply price has changed',
        {
          priceTokens: currentPrice.price_tokens,
          priceVersion: currentPrice.version,
        },
      );

    const wallet = await client.query<{ id: string }>(
      'select id from token_wallets where user_id=$1 for update',
      [input.userId],
    );
    if (!wallet.rows[0])
      throw new AiCompanionError(
        'INSUFFICIENT_TOKENS',
        409,
        'Insufficient token balance',
      );
    const balance = await client.query<{ balance: string }>(
      `select coalesce(sum(amount_tokens),0)::text as balance
         from token_transactions where wallet_id=$1`,
      [wallet.rows[0].id],
    );
    if (Number(balance.rows[0]?.balance ?? 0) < currentPrice.price_tokens)
      throw new AiCompanionError(
        'INSUFFICIENT_TOKENS',
        409,
        'Insufficient token balance',
      );

    const operationId = randomUUID();
    const messageId = randomUUID();
    const reservationId = randomUUID();
    await client.query(
      `insert into ai_messages (id,conversation_id,role,content)
       values ($1,$2,'user',$3)`,
      [messageId, input.conversationId, payload.content],
    );
    await client.query(
      `insert into ai_operations
        (id,user_id,conversation_id,input_message_id,status,action_type,price_version,reserved_tokens,runtime_adapter,prompt_version)
       values ($1,$2,$3,$4,'queued','quickReply',$5,$6,'fake','quick-reply-v1')`,
      [
        operationId,
        input.userId,
        input.conversationId,
        messageId,
        currentPrice.version,
        currentPrice.price_tokens,
      ],
    );
    await client.query(
      `insert into token_transactions
        (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id)
       values ($1,$2,$3,'aiReservation',$4,'aiOperation',$5,$5)`,
      [
        reservationId,
        wallet.rows[0].id,
        input.userId,
        -currentPrice.price_tokens,
        operationId,
      ],
    );
    const operation: QueuedAiOperation = {
      id: operationId,
      status: 'queued',
      conversationId: input.conversationId,
      inputMessageId: messageId,
      reservedTokens: currentPrice.price_tokens,
      priceVersion: currentPrice.version,
      pollUrl: `/api/v1/ai/operations/${operationId}`,
      runtimeAdapter: 'fake',
    };
    await client.query(
      `insert into outbox_messages
        (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
       values ($1,'ai-companion.quick_reply_requested.v1','aiOperation',$2,$3::jsonb,now(),now(),0)`,
      [
        randomUUID(),
        operationId,
        JSON.stringify({
          operationId,
          userId: input.userId,
          actionType: 'quickReply',
        }),
      ],
    );
    await this.completeIdempotency(
      client,
      input.userId,
      quickReplyScope,
      input.idempotencyKey,
      202,
      operation,
    );
    return operation;
  }

  private async lockIdempotency<TResult>(
    client: PoolClient,
    userId: string,
    operationScope: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<TResult | null> {
    await client.query(
      `insert into idempotency_records
        (id,user_id,operation_scope,idempotency_key,request_hash,state)
       values ($1,$2,$3,$4,$5,'processing') on conflict do nothing`,
      [randomUUID(), userId, operationScope, idempotencyKey, requestHash],
    );
    const result = await client.query<{
      request_hash: string;
      state: string;
      response_body: TResult | null;
    }>(
      `select request_hash,state,response_body from idempotency_records
        where user_id=$1 and operation_scope=$2 and idempotency_key=$3 for update`,
      [userId, operationScope, idempotencyKey],
    );
    const record = result.rows[0]!;
    if (record.request_hash !== requestHash)
      throw new AiCompanionError(
        'IDEMPOTENCY_KEY_REUSED',
        409,
        'The idempotency key was already used with another request',
      );
    return record.state === 'completed' && record.response_body
      ? record.response_body
      : null;
  }

  private async completeIdempotency(
    client: PoolClient,
    userId: string,
    operationScope: string,
    idempotencyKey: string,
    responseStatus: number,
    response: object,
  ): Promise<void> {
    await client.query(
      `update idempotency_records
          set state='completed', response_status=$1, response_body=$2::jsonb, completed_at=now()
        where user_id=$3 and operation_scope=$4 and idempotency_key=$5`,
      [
        responseStatus,
        JSON.stringify(response),
        userId,
        operationScope,
        idempotencyKey,
      ],
    );
  }
}

function hashPayload(payload: object): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
