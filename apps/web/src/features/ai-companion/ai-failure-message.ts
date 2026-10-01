import type { AiConversationOperationSummaryDto } from '@atlas/api-contracts';

export function aiFailureMessage(
  kind: 'chat' | 'food',
  reason: string | null | undefined,
  refundStatus: AiConversationOperationSummaryDto['refundStatus'] | undefined,
): string {
  const expired = reason === 'recoveryDeadlineExceeded';
  if (kind === 'chat') {
    const outcome = expired
      ? 'Ответ не удалось восстановить за 5 минут.'
      : 'Ответ не получен.';
    return `${outcome} ${
      refundStatus === 'refunded'
        ? 'Зарезервированный токен возвращён.'
        : 'Возврат токена пока не подтверждён.'
    }`;
  }
  const outcome = expired
    ? 'Разбор не удалось восстановить за 5 минут.'
    : 'Разбор не завершился.';
  return `${outcome} ${
    refundStatus === 'refunded'
      ? 'Все зарезервированные токены возвращены.'
      : 'Возврат токенов пока не подтверждён.'
  }`;
}
