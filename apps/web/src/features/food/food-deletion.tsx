'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, newIdempotencyKey } from '../../shared/api';
import {
  loadFoodDeletionStatus,
  requestFoodDeletion,
  type FoodDeletionStatus,
} from './food-api';
type Kind = 'photo' | 'analysis';
type Intent = { kind: Kind; key: string };
export function FoodDeletion({
  analysisId,
  ownerScope,
  csrfToken,
  onStatus,
  onSessionExpired,
  disabled = false,
  mayCancel = false,
}: {
  analysisId: string;
  ownerScope: string;
  csrfToken: string;
  onStatus?: (status: FoodDeletionStatus) => void;
  onSessionExpired: () => void;
  disabled?: boolean;
  mayCancel?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<FoodDeletionStatus>();
  const [confirm, setConfirm] = useState<Kind>();
  const [pending, setPending] = useState<Intent>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true),
    inFlight = useRef(false);
  const storageKey = `food-deletion:${ownerScope}:${analysisId}`;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function remember(intent?: Intent) {
    if (intent) sessionStorage.setItem(storageKey, JSON.stringify(intent));
    else sessionStorage.removeItem(storageKey);
    setPending(intent);
  }
  function accept(value: FoodDeletionStatus) {
    setStatus(value);
    onStatus?.(value);
  }
  function failure(cause: unknown) {
    if (cause instanceof ApiError && cause.kind === 'session')
      onSessionExpired();
    else if (
      cause instanceof ApiError &&
      cause.code === 'FOOD_ANALYSIS_NOT_TERMINAL'
    ) {
      remember();
      setConfirm(undefined);
      setError(
        'Анализ ещё не завершён. Удаление станет доступно после уточнения результата.',
      );
    } else if (
      cause instanceof ApiError &&
      cause.code === 'FOOD_ANALYSIS_ALREADY_SUBMITTED'
    ) {
      remember();
      setConfirm(undefined);
      setError(
        'Запрос уже мог быть отправлен провайдеру. Отмена с возвратом сейчас недоступна; дождитесь результата.',
      );
    } else
      setError(
        cause instanceof Error
          ? cause.message
          : 'Не удалось проверить удаление.',
      );
  }
  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    setOpened(true);
    try {
      const raw = sessionStorage.getItem(storageKey),
        intent = raw ? (JSON.parse(raw) as Intent) : undefined;
      const value = await loadFoodDeletionStatus(analysisId);
      if (!active.current) return;
      if (
        intent &&
        ((intent.kind === 'photo' && value.photoStatus === 'available') ||
          (intent.kind === 'analysis' && value.analysisStatus === 'available'))
      )
        setPending(intent);
      else remember();
      accept(value);
    } catch (cause) {
      if (active.current) failure(cause);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function remove(kind: Kind) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const intent = pending ?? { kind, key: newIdempotencyKey() };
      remember(intent);
      const value = await requestFoodDeletion({
        analysisId,
        kind: intent.kind,
        csrfToken,
        idempotencyKey: intent.key,
      });
      if (!active.current) return;
      remember();
      setConfirm(undefined);
      accept(value);
    } catch (cause) {
      if (active.current) failure(cause);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section aria-label="Удаление фото и анализа">
      {!opened ? (
        <button type="button" disabled={disabled} onClick={() => void check()}>
          Фото и анализ
        </button>
      ) : (
        <>
          {mayCancel && (
            <p>
              До отправки провайдеру анализ можно отменить: тогда все
              зарезервированные токены вернутся. После возможной отправки нужно
              дождаться результата.
            </p>
          )}
          {status?.cancellationStatus === 'cancelledRefunded' && (
            <p role="status">
              Анализ отменён. Все зарезервированные токены возвращены.
            </p>
          )}
          <p>
            Фото и результат анализа удаляются отдельно. Подтверждённая запись о
            еде сохраняется в дневнике.
          </p>
          {status?.photoStatus === 'pending' && (
            <p role="status">
              Фото скрыто. Удаление из хранилища ожидается в течение 24 часов.
            </p>
          )}
          {status?.photoStatus === 'deleted' && (
            <p role="status">Исходное фото удалено.</p>
          )}
          {status?.analysisStatus === 'deleted' && (
            <p role="status">
              Результат анализа удалён. Подтверждённая запись о еде сохранена.
            </p>
          )}
          <fieldset
            disabled={busy || disabled}
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            {!pending && status?.photoStatus === 'available' && (
              <button type="button" onClick={() => setConfirm('photo')}>
                {mayCancel
                  ? 'Отменить анализ и удалить исходное фото'
                  : 'Удалить исходное фото'}
              </button>
            )}
            {!pending && status?.analysisStatus === 'available' && (
              <button type="button" onClick={() => setConfirm('analysis')}>
                {mayCancel
                  ? 'Отменить анализ и удалить результат'
                  : 'Удалить результат анализа'}
              </button>
            )}
            {!pending && confirm && (
              <div>
                <p>
                  {mayCancel
                    ? 'Отменить анализ, если он ещё не отправлен, и удалить выбранные данные? Полный возврат токенов будет показан после подтверждения сервера.'
                    : confirm === 'photo'
                      ? 'Удалить исходное фото без возможности восстановления? Результат анализа останется.'
                      : 'Удалить результат анализа без возможности восстановления? Исходное фото останется до отдельного удаления или окончания срока хранения.'}
                </p>
                <button type="button" onClick={() => void remove(confirm)}>
                  {confirm === 'photo'
                    ? 'Подтвердить удаление фото'
                    : 'Подтвердить удаление анализа'}
                </button>
                <button type="button" onClick={() => setConfirm(undefined)}>
                  Отмена
                </button>
              </div>
            )}
            {pending && (
              <button type="button" onClick={() => void remove(pending.kind)}>
                Повторить запрос удаления
              </button>
            )}
            {!pending && status?.photoStatus === 'pending' && (
              <button type="button" onClick={() => void check()}>
                Проверить удаление фото
              </button>
            )}
            {!status && (
              <button type="button" onClick={() => void check()}>
                Повторить проверку
              </button>
            )}
          </fieldset>
        </>
      )}
      {busy && <p role="status">Проверяем удаление…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
