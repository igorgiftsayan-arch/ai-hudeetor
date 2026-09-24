'use client';

import { useRef, useState } from 'react';
import type { AiDailyState, AiDailyStateTransition } from './daily-coach-api';
import { transitionDailyState } from './daily-coach-api';
import { ApiError, newIdempotencyKey } from '../../shared/api';

type PendingTransition = {
  idempotencyKey: string;
  payload: string;
};

type DailyCoachProps = {
  state: AiDailyState;
  csrfToken: string;
  onStateChanged: (state: AiDailyState) => void;
  onSessionExpired: () => void;
  onReload: () => void;
};

export function DailyCoach({
  state,
  csrfToken,
  onStateChanged,
  onSessionExpired,
  onReload,
}: DailyCoachProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<'retry' | 'reload' | undefined>(undefined);
  const pending = useRef<PendingTransition | undefined>(undefined);

  const action = actionFor(state.status);

  async function submit(targetStatus: 'inProgress' | 'completed') {
    const payload = JSON.stringify({ targetStatus });
    if (pending.current?.payload !== payload) {
      pending.current = { idempotencyKey: newIdempotencyKey(), payload };
    }

    setSubmitting(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const result = await transitionDailyState({
        stateId: state.id,
        csrfToken,
        idempotencyKey: pending.current.idempotencyKey,
        targetStatus,
      });
      pending.current = undefined;
      onStateChanged(withTransition(state, result));
      setNotice(targetStatus === 'inProgress' ? 'День начат' : 'День завершён');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        onSessionExpired();
      } else if (
        cause instanceof ApiError &&
        (cause.code === 'RESOURCE_NOT_FOUND' ||
          cause.code === 'DAILY_STATE_TRANSITION_INVALID')
      ) {
        setError('reload');
      } else {
        setError('retry');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="daily-coach" aria-labelledby="daily-coach-title">
      <p className="section-label">На сегодня</p>
      <div className="daily-coach-row">
        <div>
          <h2 id="daily-coach-title">{action.title}</h2>
          <p>{action.description}</p>
        </div>
        {action.targetStatus && (
          <button
            className="coach-action"
            type="button"
            onClick={() => void submit(action.targetStatus!)}
            disabled={submitting}
          >
            {submitting ? action.loadingLabel : action.buttonLabel}
          </button>
        )}
      </div>
      {error === 'retry' && (
        <div className="inline-error" role="alert">
          <p>Не удалось сохранить состояние дня. Попробуйте снова.</p>
          <button
            className="text-action"
            type="button"
            onClick={() =>
              action.targetStatus && void submit(action.targetStatus)
            }
            disabled={submitting || !action.targetStatus}
          >
            Повторить
          </button>
        </div>
      )}
      {error === 'reload' && (
        <div className="inline-error" role="alert">
          <p>Сценарий дня изменился. Обновите экран и продолжите.</p>
          <button className="text-action" type="button" onClick={onReload}>
            Обновить
          </button>
        </div>
      )}
      {notice && (
        <p className="save-confirmation" aria-live="polite">
          {notice}
        </p>
      )}
    </section>
  );
}

function actionFor(status: AiDailyState['status']) {
  if (status === 'notStarted') {
    return {
      title: 'Спокойный старт',
      description: 'Можно начать день, когда вам удобно.',
      targetStatus: 'inProgress' as const,
      buttonLabel: 'Начать день',
      loadingLabel: 'Начинаем…',
    };
  }

  if (status === 'inProgress') {
    return {
      title: 'День идёт',
      description: 'Когда будете готовы, можно спокойно завершить его.',
      targetStatus: 'completed' as const,
      buttonLabel: 'Завершить день',
      loadingLabel: 'Завершаем…',
    };
  }

  return {
    title: 'На сегодня достаточно',
    description: 'Дневной сценарий завершён.',
    targetStatus: undefined,
    buttonLabel: '',
    loadingLabel: '',
  };
}

function withTransition(
  state: AiDailyState,
  transition: AiDailyStateTransition,
): AiDailyState {
  return { ...state, ...transition, context: state.context };
}
