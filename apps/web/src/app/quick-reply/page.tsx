'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import {
  chatSubmission,
  loadChatOperation,
  loadChatPrice,
  loadConversation,
  loadOrCreateConversation,
  readChatError,
  startChatReply,
} from '../../features/ai-companion/chat-api';
import type {
  ChatMessage,
  ChatOperation,
  ChatPrice,
} from '../../features/ai-companion/chat-api';
import { ApiError, apiRequest } from '../../shared/api';

type PendingSubmission = {
  payload: string;
  idempotencyKey: string;
};

export default function QuickReplyPage() {
  const { replace } = useRouter();
  const [csrfToken, setCsrfToken] = useState('');
  const [price, setPrice] = useState<ChatPrice>();
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [operation, setOperation] = useState<ChatOperation>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const pendingSubmission = useRef<PendingSubmission | undefined>(undefined);
  const pollInFlight = useRef(false);
  const conversationRefreshVersion = useRef(0);
  const feedEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    feedEnd.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, operation?.status, error]);

  useEffect(() => {
    if (!operation || !isActiveOperation(operation.status)) return;
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
      const onboarding = await apiRequest<{
        status: string;
        csrfToken: string;
      }>('/users/me/onboarding');
      if (onboarding.status !== 'completed') {
        replace('/onboarding');
        return;
      }
      const [currentPrice, conversation] = await Promise.all([
        loadChatPrice(),
        loadOrCreateConversation(onboarding.csrfToken),
      ]);
      setCsrfToken(onboarding.csrfToken);
      setPrice(currentPrice);
      setConversationId(conversation.id);
      setMessages(conversation.messages);
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else {
        setError('Не удалось открыть чат. Попробуйте обновить страницу.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshConversation(id = conversationId) {
    if (!id) return;
    const version = conversationRefreshVersion.current + 1;
    conversationRefreshVersion.current = version;
    const conversation = await loadConversation(id);
    if (conversationRefreshVersion.current === version)
      setMessages(conversation.messages);
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !price || !conversationId || !csrfToken) return;

    const next = chatSubmission({ conversationId, content, price });
    if (pendingSubmission.current?.payload !== next.payload) {
      pendingSubmission.current = next;
    }

    setSending(true);
    setError(undefined);
    try {
      const started = await startChatReply({
        csrfToken,
        idempotencyKey: pendingSubmission.current.idempotencyKey,
        conversationId,
        content,
        price,
      });
      pendingSubmission.current = undefined;
      setDraft('');
      setOperation(started);
      await refreshConversation(conversationId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else {
        if (isDefinitiveSubmissionFailure(cause))
          pendingSubmission.current = undefined;
        setError(readChatError(cause));
      }
    } finally {
      setSending(false);
    }
  }

  async function pollOperation(operationId: string) {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    try {
      const next = await loadChatOperation(operationId);
      if (next.status === 'succeeded') {
        await refreshConversation(next.conversationId);
        setOperation(next);
        setError(undefined);
      } else if (next.status === 'technicalError') {
        setOperation(next);
        setError('Ответ не получен. Зарезервированный токен возвращён.');
      } else if (next.status === 'outcomeUnknown') {
        setOperation(next);
        setError('Статус ответа уточняется. Новое сообщение пока недоступно.');
      } else {
        setOperation(next);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else {
        setError('Связь прервалась. Повторяем загрузку ответа…');
      }
    } finally {
      pollInFlight.current = false;
    }
  }

  const waiting = operation && isActiveOperation(operation.status);
  const submitDisabled =
    loading || sending || !price || !draft.trim() || Boolean(waiting);

  return (
    <main className="app-shell chat-shell">
      <div className="chat-page">
        <header className="chat-header">
          <div>
            <p className="section-label">Поддержка рядом</p>
            <h1>AI-друг</h1>
          </div>
          <span className="fake-runtime-badge">тестовый AI</span>
        </header>

        <section
          className="chat-feed"
          role="log"
          aria-label="Переписка с AI"
          aria-live="polite"
        >
          {loading && <p className="chat-system-message">Открываем чат…</p>}
          {!loading && messages.length === 0 && !error && (
            <div className="chat-empty">
              <span aria-hidden="true">☼</span>
              <p>Можно написать о том, что сейчас непросто.</p>
            </div>
          )}
          {messages.map((message) => (
            <p
              key={message.id}
              className={`chat-message chat-message-${message.role}`}
            >
              {message.content}
            </p>
          ))}
          {waiting && (
            <p className="chat-message chat-message-assistant chat-message-pending">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span>AI готовит ответ…</span>
            </p>
          )}
          {error && (
            <div className="chat-error" role="alert">
              <p>{error}</p>
              {pendingSubmission.current && (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={sending}
                >
                  Повторить отправку
                </button>
              )}
            </div>
          )}
          <div ref={feedEnd} />
        </section>

        <form className="chat-composer" onSubmit={submit}>
          <label htmlFor="chat-message" className="sr-only">
            Сообщение
          </label>
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
            placeholder="Напишите сообщение"
            maxLength={4000}
            rows={2}
            disabled={
              sending || Boolean(waiting) || Boolean(pendingSubmission.current)
            }
          />
          <div className="chat-send-row">
            <span>
              {price
                ? `${price.priceTokens} ${tokenWord(price.priceTokens)}`
                : '—'}
            </span>
            <button type="submit" disabled={submitDisabled}>
              {sending ? 'Отправляем…' : 'Отправить'}
            </button>
          </div>
        </form>
      </div>
      <MobileNavigation active="ai" />
    </main>
  );
}

function tokenWord(count: number): string {
  return count === 1 ? 'токен' : 'токенов';
}

function isActiveOperation(status: ChatOperation['status']): boolean {
  return ['queued', 'processing', 'outcomeUnknown'].includes(status);
}

function isDefinitiveSubmissionFailure(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    cause.kind === 'request' &&
    cause.status !== undefined &&
    cause.status < 500
  );
}
