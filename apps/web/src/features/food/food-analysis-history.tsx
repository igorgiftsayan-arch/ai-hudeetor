'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api';
import { FoodDeletion } from './food-deletion';
import {
  loadPastFoodAnalyses,
  type FoodAnalysisListItem,
  type FoodDeletionStatus,
} from './food-api';

const labels: Record<FoodAnalysisListItem['status'], string> = {
  queued: 'Разбор ожидает обработки',
  processing: 'Разбор обрабатывается',
  analyzed: 'Разбор готов, еда не подтверждена',
  technicalError: 'Разбор завершился ошибкой',
  outcomeUnknown: 'Исход разбора уточняется',
  cancelled: 'Разбор отменён',
  deleted: 'Результат разбора удалён',
};
export function FoodAnalysisHistory({
  ownerScope,
  csrfToken,
  timezone,
  onDeletionStatus,
  onSessionExpired,
}: {
  ownerScope: string;
  csrfToken: string;
  timezone: string;
  onDeletionStatus: (status: FoodDeletionStatus) => void;
  onSessionExpired: () => void;
}) {
  const [items, setItems] = useState<FoodAnalysisListItem[]>([]);
  const [started, setStarted] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const retryCursor = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function load(cursor?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    retryCursor.current = cursor;
    setLoading(true);
    setError(undefined);
    try {
      const page = await loadPastFoodAnalyses(cursor);
      if (!active.current) return;
      setItems((previous) =>
        cursor
          ? [
              ...new Map(
                [...previous, ...page.items].map((item) => [item.id, item]),
              ).values(),
            ]
          : page.items,
      );
      setNextCursor(page.nextCursor);
      setStarted(true);
    } catch (cause) {
      if (!active.current) return;
      if (cause instanceof ApiError && cause.kind === 'session')
        onSessionExpired();
      else
        setError('Не удалось загрузить прошлые разборы. Попробуйте ещё раз.');
    } finally {
      inFlight.current = false;
      if (active.current) setLoading(false);
    }
  }
  function changed(status: FoodDeletionStatus) {
    if (!active.current) return;
    setItems((previous) =>
      previous.map((item) =>
        item.id !== status.analysisId
          ? item
          : {
              ...item,
              deletionStatus: status,
              status:
                status.analysisStatus === 'deleted'
                  ? 'deleted'
                  : status.cancellationStatus === 'cancelledRefunded'
                    ? 'cancelled'
                    : item.status,
              dishName:
                status.analysisStatus === 'deleted' ? null : item.dishName,
            },
      ),
    );
    onDeletionStatus(status);
  }
  return (
    <section className="food-history" aria-labelledby="past-food-title">
      <h2 id="past-food-title">Прошлые разборы</h2>
      <p>
        Разборы, не добавленные в дневник. Здесь можно отдельно удалить исходное
        фото и результат анализа.
      </p>
      {items.length > 0 && (
        <ol aria-label="Прошлые разборы">
          {items.map((item) => (
            <li key={item.id}>
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat('ru-RU', {
                  timeZone: timezone,
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.createdAt))}
              </time>
              <strong>{item.dishName ?? 'Разбор фотографии'}</strong>
              <p>{labels[item.status]}</p>
              {item.runtimeAdapter === 'fake' && <p>Тестовый разбор</p>}
              {item.deletionStatus.photoStatus === 'pending' && (
                <p>Удаление фото ожидается</p>
              )}
              {item.deletionStatus.photoStatus === 'deleted' && (
                <p>Фото больше не хранится</p>
              )}
              <FoodDeletion
                analysisId={item.id}
                ownerScope={ownerScope}
                csrfToken={csrfToken}
                onSessionExpired={onSessionExpired}
                onStatus={changed}
                mayCancel={['queued', 'processing', 'outcomeUnknown'].includes(
                  item.status,
                )}
              />
            </li>
          ))}
        </ol>
      )}
      {started && items.length === 0 && (
        <p>Прошлых неподтверждённых разборов пока нет.</p>
      )}
      {loading && <p role="status">Загружаем прошлые разборы…</p>}
      {error && <p role="alert">{error}</p>}
      {error ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(retryCursor.current)}
        >
          Повторить загрузку разборов
        </button>
      ) : !started ? (
        <button type="button" disabled={loading} onClick={() => void load()}>
          Показать прошлые разборы
        </button>
      ) : (
        nextCursor && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(nextCursor)}
          >
            Показать ещё разборы
          </button>
        )
      )}
    </section>
  );
}
