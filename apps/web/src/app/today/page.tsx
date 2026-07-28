'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import {
  createWeightEntry,
  loadTodayData,
} from '../../features/tracking/tracking-api';
import type { WeightEntry } from '../../features/tracking/tracking-api';
import { WeightChart } from '../../features/tracking/weight-chart';
import {
  formatDelta,
  formatEntryDate,
  formatToday,
  formatWeight,
  newestFirst,
  validateWeight,
} from '../../features/tracking/weight-format';
import { ApiError, newIdempotencyKey } from '../../shared/api';

type ViewState = 'loading' | 'ready' | 'error' | 'onboarding';
type PendingSubmission = { idempotencyKey: string; payload: string };

export default function TodayPage() {
  const { replace } = useRouter();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [csrfToken, setCsrfToken] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [weightInput, setWeightInput] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [saving, setSaving] = useState(false);
  const pendingSubmission = useRef<PendingSubmission | undefined>(undefined);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const data = await loadTodayData();
      setEntries(newestFirst(data.entries));
      setCsrfToken(data.csrfToken);
      setTimezone(data.timezone);
      const todayEntry = data.entries.find((entry) =>
        isTodayEntry(entry, data.timezone),
      );
      if (todayEntry) setWeightInput(weightInputValue(todayEntry.weightKg));
      setViewState('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else if (cause instanceof ApiError && cause.kind === 'onboarding') {
        setViewState('onboarding');
      } else {
        setViewState('error');
      }
    }
  }, [replace]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateWeight(value: string) {
    setWeightInput(value);
    setValidationError(undefined);
    setSaveError(undefined);
    setSaved(undefined);
  }

  async function saveWeight(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const validation = validateWeight(weightInput);
    if (!validation.ok) {
      setValidationError(validation.message);
      return;
    }

    if (pendingSubmission.current?.payload !== validation.payload) {
      pendingSubmission.current = {
        idempotencyKey: newIdempotencyKey(),
        payload: validation.payload,
      };
    }

    setSaving(true);
    setSaveError(undefined);
    setSaved(undefined);
    try {
      const savedEntry = await createWeightEntry({
        csrfToken,
        idempotencyKey: pendingSubmission.current.idempotencyKey,
        weightKg: validation.value,
      });
      setEntries((current) => {
        const updatedEntries =
          savedEntry.result === 'updated'
            ? current.map((entry) =>
                entry.id === savedEntry.id ? savedEntry : entry,
              )
            : [savedEntry, ...current];
        return newestFirst(updatedEntries).slice(0, 10);
      });
      pendingSubmission.current = undefined;
      setWeightInput(weightInputValue(savedEntry.weightKg));
      setSaved(
        savedEntry.result === 'created'
          ? 'Вес за сегодня записан'
          : 'Вес за сегодня обновлён',
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else {
        setSaveError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить вес. Попробуйте снова.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (viewState !== 'ready') {
    return <TodayBoundary state={viewState} onRetry={load} />;
  }

  const latest = entries[0];
  const previous = entries[1];
  const todayEntry = entries.find((entry) => isTodayEntry(entry, timezone));

  return (
    <main className="app-shell today-shell">
      <div className="app-page">
        <header className="today-header">
          <p className="quiet-greeting">Здравствуйте</p>
          <h1>{formatToday(new Date(), timezone)}</h1>
        </header>

        <section
          className="weight-summary"
          data-testid="weight-summary"
          aria-label="Последний вес"
        >
          <p className="section-label">Последний вес</p>
          {latest ? (
            <>
              <p className="latest-weight">{formatWeight(latest.weightKg)}</p>
              <p className="weight-change">
                {previous
                  ? formatDelta(latest, previous, true)
                  : 'Это ваша первая запись'}
              </p>
            </>
          ) : (
            <>
              <p className="latest-weight latest-weight-empty">—</p>
              <p className="weight-change">Пока без записей</p>
            </>
          )}
        </section>

        <section
          className="weight-entry-panel"
          aria-labelledby="weight-entry-title"
        >
          <div className="section-heading">
            <div>
              <p className="section-label">Быстрая запись</p>
              <h2 id="weight-entry-title">Вес сегодня</h2>
            </div>
            <span aria-hidden="true" className="soft-dot" />
          </div>
          <form onSubmit={saveWeight} noValidate>
            {todayEntry && (
              <p className="today-recorded" aria-live="polite">
                Сегодня уже записано: {formatWeight(todayEntry.weightKg)}
              </p>
            )}
            <label htmlFor="today-weight" className="sr-only">
              Вес сегодня
            </label>
            <div className="weight-input-wrap">
              <input
                id="today-weight"
                value={weightInput}
                onChange={(event) => updateWeight(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="98,4"
                aria-describedby="weight-input-hint"
                aria-invalid={Boolean(validationError)}
              />
              <span>кг</span>
            </div>
            <p id="weight-input-hint" className="input-hint">
              Можно указать до двух знаков после запятой
            </p>
            <button
              className="primary-action"
              type="submit"
              disabled={saving || !weightInput.trim()}
            >
              {saving
                ? 'Сохраняем…'
                : todayEntry
                  ? 'Обновить вес'
                  : 'Записать вес'}
            </button>
          </form>
          {validationError && (
            <p role="alert" className="form-error">
              {validationError}
            </p>
          )}
          {saveError && (
            <div className="inline-error" role="alert">
              <p>{saveError}</p>
              <button
                type="button"
                className="text-action"
                onClick={() => void saveWeight()}
                disabled={saving}
              >
                Повторить сохранение
              </button>
            </div>
          )}
          {saved && (
            <p className="save-confirmation" aria-live="polite">
              {saved}
            </p>
          )}
        </section>

        <section className="history-section" aria-labelledby="history-title">
          <div className="history-title-row">
            <div>
              <p className="section-label">Динамика</p>
              <h2 id="history-title">Недавние записи</h2>
            </div>
            <span>{entries.length > 0 ? `${entries.length} из 10` : ''}</span>
          </div>
          {entries.length === 0 ? (
            <p className="empty-history">
              Здесь появятся ваши изменения. Начните с сегодняшнего веса.
            </p>
          ) : (
            <>
              <WeightChart entries={entries} timezone={timezone} />
              <ol className="weight-history" aria-label="Недавняя история веса">
                {entries.map((entry, index) => (
                  <li key={entry.id}>
                    <time dateTime={entry.recordedAt}>
                      {formatEntryDate(entry.recordedAt, timezone)}
                    </time>
                    <strong>{formatWeight(entry.weightKg)}</strong>
                    <span className="history-delta">
                      {entries[index + 1]
                        ? formatDelta(entry, entries[index + 1]!)
                        : 'первая запись'}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        <a href="/quick-reply" className="ai-secondary-action">
          <span>Поговорить с AI</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
      <MobileNavigation active="today" />
    </main>
  );
}

function isTodayEntry(entry: WeightEntry, timezone: string) {
  return (
    localCalendarDate(entry.recordedAt, timezone) ===
    localCalendarDate(new Date(), timezone)
  );
}

function localCalendarDate(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function weightInputValue(weightKg: string) {
  return Number(weightKg).toFixed(2);
}

function TodayBoundary({
  state,
  onRetry,
}: {
  state: Exclude<ViewState, 'ready'>;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="app-shell today-shell">
      <div className="app-page boundary-page">
        {state === 'loading' && (
          <div className="loading-state" aria-live="polite">
            <span className="loading-orbit" aria-hidden="true" />
            <p>Загружаем ваши записи…</p>
          </div>
        )}
        {state === 'error' && (
          <div className="boundary-message" role="alert">
            <p className="section-label">Связь прервалась</p>
            <h1>Не удалось загрузить записи</h1>
            <p>Ваши данные никуда не пропали. Попробуйте ещё раз.</p>
            <button
              type="button"
              className="primary-action"
              onClick={() => void onRetry()}
            >
              Попробовать снова
            </button>
          </div>
        )}
        {state === 'onboarding' && (
          <div className="boundary-message">
            <p className="section-label">Остался один шаг</p>
            <h1>Завершите настройку</h1>
            <p>После настройки здесь появится ваш дневник веса.</p>
            <a href="/onboarding" className="primary-link">
              Продолжить настройку
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
