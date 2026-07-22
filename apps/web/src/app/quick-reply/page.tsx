'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MobileNavigation } from '../mobile-navigation';

type Price = { priceTokens: number; priceVersion: number };
type OperationStatus =
  'queued' | 'processing' | 'succeeded' | 'technicalError' | 'outcomeUnknown';
type Operation = {
  id: string;
  status: OperationStatus;
  conversationId: string;
  reservedTokens: number;
  responseText?: string;
  errorCode?: string;
};

const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export default function QuickReplyPage() {
  const [csrfToken, setCsrfToken] = useState<string>();
  const [price, setPrice] = useState<Price>();
  const [message, setMessage] = useState('');
  const [operation, setOperation] = useState<Operation>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const idempotencyKey = useRef(newKey());

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    if (!operation || !['queued', 'processing'].includes(operation.status))
      return;
    const timer = window.setInterval(
      () => void pollOperation(operation.id),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [operation?.id, operation?.status]);

  async function loadInitialState() {
    setLoading(true);
    setError(undefined);
    try {
      const onboarding = await request<{ status: string; csrfToken: string }>(
        '/users/me/onboarding',
      );
      if (onboarding.status !== 'completed') {
        setError('Завершите настройку профиля перед первым AI-запросом.');
        return;
      }
      setCsrfToken(onboarding.csrfToken);
      const currentPrice = await request<Price>(
        '/ai-action-prices/quick-reply',
      );
      setPrice(currentPrice);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!price || !csrfToken || !message.trim()) return;
    setError(undefined);
    try {
      const conversation = await request<{ id: string }>('/ai-conversations', {
        method: 'POST',
        headers: mutationHeaders(csrfToken, newKey()),
      });
      const started = await request<Operation>('/ai/operations', {
        method: 'POST',
        headers: mutationHeaders(csrfToken, idempotencyKey.current),
        body: JSON.stringify({
          conversationId: conversation.id,
          content: message.trim(),
          scenarioId: 'quickReply',
          expectedPriceTokens: price.priceTokens,
          priceVersion: price.priceVersion,
        }),
      });
      setOperation(started);
      setMessage('');
    } catch (cause) {
      setError(readError(cause));
    }
  }

  async function pollOperation(operationId: string) {
    try {
      const next = await request<Operation>(`/ai/operations/${operationId}`);
      setOperation(next);
    } catch (cause) {
      setError(readError(cause));
    }
  }

  const submitDisabled =
    loading ||
    !price ||
    !csrfToken ||
    !message.trim() ||
    Boolean(
      operation &&
      ['queued', 'processing', 'outcomeUnknown'].includes(operation.status),
    );
  return (
    <main className="app-shell quick-reply-shell">
      <div className="app-page">
        <section
          aria-labelledby="quick-reply-title"
          className="quick-reply-card product-panel"
        >
          <p className="eyebrow">AI-друг</p>
          <h1 id="quick-reply-title">Быстрый ответ</h1>
          <p className="runtime-notice">
            Тестовый AI-адаптер. Ответ не создан реальной моделью.
          </p>
          {price && (
            <p className="price">
              Цена: {price.priceTokens} {tokenWord(price.priceTokens)}
            </p>
          )}
          <form onSubmit={submit} className="quick-reply-form">
            <label htmlFor="quick-reply-message">Сообщение</label>
            <textarea
              id="quick-reply-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={4000}
              required
            />
            <button type="submit" disabled={submitDisabled}>
              {price
                ? `Отправить за ${price.priceTokens} ${tokenWord(price.priceTokens)}`
                : 'Загружаем цену'}
            </button>
          </form>
          {loading && <p aria-live="polite">Загружаем данные…</p>}
          {operation && <OperationState operation={operation} />}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </section>
      </div>
      <MobileNavigation active="ai" />
    </main>
  );
}

function OperationState({ operation }: { operation: Operation }) {
  if (operation.status === 'queued')
    return <p aria-live="polite">Запрос поставлен в очередь</p>;
  if (operation.status === 'processing')
    return <p aria-live="polite">Запрос обрабатывается</p>;
  if (operation.status === 'succeeded')
    return (
      <div aria-live="polite">
        <h2>Ответ готов</h2>
        <p>{operation.responseText ?? 'Тестовый ответ получен.'}</p>
      </div>
    );
  if (operation.status === 'technicalError')
    return (
      <p role="alert">
        Техническая ошибка. Зарезервированные токены возвращены.
      </p>
    );
  return (
    <p role="alert">
      Статус ответа пока не подтверждён. Новый AI-запрос временно недоступен.
    </p>
  );
}

async function request<TResult>(
  path: string,
  init?: RequestInit,
): Promise<TResult> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...init,
  });
  const body = (await response.json().catch(() => undefined)) as
    TResult | { error?: { message?: string } } | undefined;
  if (!response.ok)
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        'Не удалось выполнить запрос. Повторите попытку.',
    );
  return body as TResult;
}

function mutationHeaders(
  csrfToken: string,
  idempotencyKey: string,
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    'Idempotency-Key': idempotencyKey,
  };
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function tokenWord(count: number): string {
  return count === 1 ? 'токен' : 'токенов';
}

function readError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'Не удалось выполнить запрос. Повторите попытку.';
}
