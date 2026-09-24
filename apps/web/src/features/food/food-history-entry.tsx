'use client';

import { useRef, useState } from 'react';
import type {
  FoodConsumptionResourceDto,
  UpdateFoodConsumptionDto,
} from '@atlas/api-contracts';
import { ApiError, newIdempotencyKey } from '../../shared/api';
import { FoodDeletion } from './food-deletion';
import type { FoodDeletionStatus } from './food-api';
import { deleteFoodConsumption, updateFoodConsumption } from './food-api';

type Operation = {
  kind: 'update' | 'delete';
  key: string;
  payload?: UpdateFoodConsumptionDto;
  completed: boolean;
};

export function FoodHistoryEntry({
  consumption,
  csrfToken,
  onChanged,
  onSessionExpired,
  ownerScope,
  onDeletionStatus,
}: {
  consumption: FoodConsumptionResourceDto;
  ownerScope?: string;
  onDeletionStatus?: (status: FoodDeletionStatus) => void;
  csrfToken: string;
  onChanged: (message: string) => Promise<void>;
  onSessionExpired: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [composition, setComposition] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef<Operation | undefined>(undefined);
  const inFlight = useRef(false);

  async function submit(kind: Operation['kind']) {
    if (inFlight.current) return;
    if (!pending.current) {
      const items = composition
        .split(/[,\n]/)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
      if (kind === 'update' && !items.length) {
        setError('Укажите хотя бы один продукт или блюдо.');
        return;
      }
      pending.current = {
        kind,
        key: newIdempotencyKey(),
        completed: false,
        payload:
          kind === 'update'
            ? {
                consumedAt: consumption.consumedAt,
                timezone: consumption.timezone,
                confirmedResult: { ...consumption.confirmedResult, items },
              }
            : undefined,
      };
    }
    const operation = pending.current;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (!operation.completed) {
        const common = {
          id: consumption.id,
          csrfToken,
          idempotencyKey: operation.key,
        };
        if (operation.kind === 'delete') await deleteFoodConsumption(common);
        else
          await updateFoodConsumption({
            ...common,
            payload: operation.payload!,
          });
        operation.completed = true;
      }
      await onChanged(
        operation.kind === 'delete' ? 'Запись удалена.' : 'Запись исправлена.',
      );
      pending.current = undefined;
      setEditing(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        onSessionExpired();
      else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить изменение.',
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <li>
      <time dateTime={consumption.consumedAt}>
        {new Intl.DateTimeFormat('ru-RU', {
          timeZone: consumption.timezone,
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(consumption.consumedAt))}{' '}
        ({consumption.timezone})
      </time>
      <strong>
        {consumption.confirmedResult.items.map((item) => item.name).join(', ')}
      </strong>
      <fieldset
        disabled={busy || Boolean(pending.current)}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {editing ? (
          <>
            <label>
              Исправленный состав блюда
              <textarea
                value={composition}
                onChange={(event) => setComposition(event.target.value)}
              />
            </label>
            <p>Дата и время употребления сохранятся.</p>
            <button type="button" onClick={() => void submit('update')}>
              Сохранить исправление
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(undefined);
              }}
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setComposition(
                  consumption.confirmedResult.items
                    .map((item) => item.name)
                    .join(', '),
                );
                setEditing(true);
              }}
            >
              Исправить запись
            </button>
            <button type="button" onClick={() => void submit('delete')}>
              Удалить запись
            </button>
          </>
        )}
      </fieldset>
      {busy && <p role="status">Сохраняем изменение…</p>}
      {error && <p role="alert">{error}</p>}
      {pending.current && !busy && (
        <button
          type="button"
          onClick={() => void submit(pending.current!.kind)}
        >
          Повторить изменение
        </button>
      )}
      {ownerScope && (
        <FoodDeletion
          analysisId={consumption.foodAnalysisId}
          ownerScope={ownerScope}
          csrfToken={csrfToken}
          onSessionExpired={onSessionExpired}
          onStatus={onDeletionStatus}
          disabled={busy || Boolean(pending.current)}
        />
      )}
    </li>
  );
}
