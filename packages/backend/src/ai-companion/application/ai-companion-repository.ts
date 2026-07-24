import type { PoolClient } from 'pg';

export type StartQuickReplyInput = {
  userId: string;
  idempotencyKey: string;
  conversationId: string;
  content: string;
  expectedPriceTokens: number;
  priceVersion: number;
};

export type QueuedAiOperation = {
  id: string;
  status: 'queued';
  conversationId: string;
  inputMessageId: string;
  reservedTokens: number;
  priceVersion: number;
  pollUrl: string;
  runtimeAdapter: 'fake';
};

export type AiOperation = {
  id: string;
  status:
    'queued' | 'processing' | 'succeeded' | 'technicalError' | 'outcomeUnknown';
  conversationId: string;
  inputMessageId: string;
  outputMessageId?: string;
  responseText?: string;
  reservedTokens: number;
  priceVersion: number;
  pollUrl: string;
  runtimeAdapter: 'fake';
  errorCode?: string;
};

export type AiActionPrice = {
  actionType: 'quickReply';
  priceTokens: number;
  priceVersion: number;
};

export type AiConversation = {
  id: string;
};

export type AiConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type AiConversationDetail = AiConversation & {
  messages: AiConversationMessage[];
};

export abstract class AiCompanionRepository {
  abstract getQuickReplyPrice(userId: string): Promise<AiActionPrice>;

  abstract createConversation(
    client: PoolClient,
    input: { userId: string; idempotencyKey: string },
  ): Promise<AiConversation>;

  abstract getConversation(
    userId: string,
    conversationId: string,
  ): Promise<AiConversationDetail>;

  abstract getCurrentConversation(
    userId: string,
  ): Promise<AiConversationDetail>;

  abstract startQuickReply(
    client: PoolClient,
    input: StartQuickReplyInput,
  ): Promise<QueuedAiOperation>;

  abstract getOperation(
    userId: string,
    operationId: string,
  ): Promise<AiOperation>;
}
