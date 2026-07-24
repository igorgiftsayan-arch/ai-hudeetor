import {
  ApiError,
  apiRequest,
  mutationHeaders,
  newIdempotencyKey,
} from '../../shared/api';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type ChatConversation = {
  id: string;
  messages: ChatMessage[];
};

export type ChatPrice = {
  priceTokens: number;
  priceVersion: number;
};

export type ChatOperation = {
  id: string;
  status:
    'queued' | 'processing' | 'succeeded' | 'technicalError' | 'outcomeUnknown';
  conversationId: string;
  inputMessageId: string;
  outputMessageId?: string;
  errorCode?: string;
};

const primaryConversationKey = 'atlas-primary-chat-v1';

export function loadChatPrice(): Promise<ChatPrice> {
  return apiRequest<ChatPrice>('/ai-action-prices/quick-reply');
}

export async function loadOrCreateConversation(
  csrfToken: string,
): Promise<ChatConversation> {
  try {
    return await apiRequest<ChatConversation>('/ai-conversations/current');
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.code !== 'RESOURCE_NOT_FOUND')
      throw cause;
  }

  const created = await apiRequest<{ id: string }>('/ai-conversations', {
    method: 'POST',
    headers: mutationHeaders(csrfToken, primaryConversationKey),
  });
  return loadConversation(created.id);
}

export function loadConversation(
  conversationId: string,
): Promise<ChatConversation> {
  return apiRequest<ChatConversation>(`/ai-conversations/${conversationId}`);
}

export function startChatReply(input: {
  csrfToken: string;
  idempotencyKey: string;
  conversationId: string;
  content: string;
  price: ChatPrice;
}): Promise<ChatOperation> {
  return apiRequest<ChatOperation>('/ai/operations', {
    method: 'POST',
    headers: mutationHeaders(input.csrfToken, input.idempotencyKey),
    body: JSON.stringify({
      conversationId: input.conversationId,
      content: input.content,
      scenarioId: 'quickReply',
      expectedPriceTokens: input.price.priceTokens,
      priceVersion: input.price.priceVersion,
    }),
  });
}

export function loadChatOperation(operationId: string): Promise<ChatOperation> {
  return apiRequest<ChatOperation>(`/ai/operations/${operationId}`);
}

export function chatSubmission(input: {
  conversationId: string;
  content: string;
  price: ChatPrice;
}): { payload: string; idempotencyKey: string } {
  return {
    payload: JSON.stringify(input),
    idempotencyKey: newIdempotencyKey(),
  };
}

export function readChatError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.kind === 'network')
      return 'Не удалось отправить сообщение. Проверьте связь и повторите.';
    if (cause.code === 'INSUFFICIENT_TOKENS')
      return 'Недостаточно токенов для нового сообщения.';
    if (cause.code === 'AI_OPERATION_IN_PROGRESS')
      return 'Предыдущий ответ ещё готовится. Подождите немного.';
    if (cause.code === 'AI_ACTION_PRICE_CHANGED')
      return 'Стоимость сообщения изменилась. Обновите чат и повторите.';
    if (cause.code === 'IDEMPOTENCY_KEY_REUSED')
      return 'Не удалось безопасно повторить изменённое сообщение. Отправьте его ещё раз.';
  }
  return 'Не удалось отправить сообщение. Попробуйте ещё раз.';
}
