'use client';

import { useState } from 'react';

export type MarathonNumericEntry = {
  id: string;
  name: string;
  value: string;
  place?: number;
  isCurrentUser?: boolean;
};

export type MarathonTaskEntry = {
  id: string;
  name: string;
  status: 'completed' | 'pending';
  isCurrentUser?: boolean;
};

export type MarathonMetric =
  | {
      id: string;
      label: string;
      legend: string;
      kind: 'numeric';
      entries: MarathonNumericEntry[];
    }
  | {
      id: string;
      label: string;
      legend: string;
      kind: 'binary';
      entries: MarathonTaskEntry[];
    };

export type CaptainTask = {
  title: string;
  description: string;
  completionLabel: string;
  onComplete?: () => void;
  isCompleting?: boolean;
  error?: string;
};

export function TeamLeaderboard({
  teamName,
  metrics,
  dayLabel,
  captainTask,
}: {
  teamName: string;
  metrics: MarathonMetric[];
  dayLabel?: string;
  captainTask?: CaptainTask;
}) {
  const [activeMetricId, setActiveMetricId] = useState(metrics[0]?.id);
  const activeMetric =
    metrics.find((metric) => metric.id === activeMetricId) ?? metrics[0];

  if (!activeMetric) return null;

  const numericEntries =
    activeMetric.kind === 'numeric' ? activeMetric.entries : [];
  const podium = numericEntries.filter(
    (entry): entry is MarathonNumericEntry & { place: 1 | 2 | 3 } =>
      entry.place === 1 || entry.place === 2 || entry.place === 3,
  );
  const podiumByPlace = new Map(podium.map((entry) => [entry.place, entry]));
  const hasPodium = activeMetric.kind === 'numeric' && podiumByPlace.size === 3;

  return (
    <section className="marathon-team" aria-labelledby="marathon-team-title">
      <header className="marathon-team-hero">
        <div>
          <p className="marathon-kicker">{teamName}</p>
          <h1 id="marathon-team-title">Сегодня на пьедестале.</h1>
          <p className="marathon-team-subtitle">
            Результаты только за сегодняшний день.
          </p>
        </div>
        {dayLabel && <span className="marathon-day-label">{dayLabel}</span>}
      </header>

      <div className="marathon-section-heading">
        <h2>Лидеры дня</h2>
        <span>Сегодня</span>
      </div>

      <div
        className="marathon-tabs"
        role="tablist"
        aria-label="Показатель команды"
      >
        {metrics.map((metric) => {
          const isActive = metric.id === activeMetric.id;
          return (
            <button
              key={metric.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`marathon-panel-${metric.id}`}
              id={`marathon-tab-${metric.id}`}
              onClick={() => setActiveMetricId(metric.id)}
            >
              {metric.label}
            </button>
          );
        })}
      </div>

      <p className="marathon-legend">{activeMetric.legend}</p>

      <div
        id={`marathon-panel-${activeMetric.id}`}
        role="tabpanel"
        aria-labelledby={`marathon-tab-${activeMetric.id}`}
      >
        {activeMetric.kind === 'numeric' && (
          <NumericLeaders
            entries={numericEntries}
            hasPodium={hasPodium}
            podiumByPlace={podiumByPlace}
          />
        )}
        {activeMetric.kind === 'binary' && (
          <TaskLeaders entries={activeMetric.entries} />
        )}
      </div>

      <aside className="marathon-mystery" aria-label="Общий итог скрыт">
        <span aria-hidden="true">?</span>
        <div>
          <strong>Финал хранит интригу</strong>
          <p>Общий результат марафона пока под замком.</p>
        </div>
      </aside>

      {captainTask && <CaptainTaskCard task={captainTask} />}
    </section>
  );
}

function NumericLeaders({
  entries,
  hasPodium,
  podiumByPlace,
}: {
  entries: MarathonNumericEntry[];
  hasPodium: boolean;
  podiumByPlace: Map<1 | 2 | 3, MarathonNumericEntry>;
}) {
  if (entries.length === 0) return <EmptyDailyResults />;

  const remaining = hasPodium
    ? entries.filter((entry) => entry.place === undefined || entry.place > 3)
    : entries;

  return (
    <>
      {hasPodium && (
        <ol className="marathon-podium" aria-label="Три лидера дня">
          {([2, 1, 3] as const).map((place) => {
            const entry = podiumByPlace.get(place)!;
            return (
              <li
                key={entry.id}
                className={`marathon-podium-place place-${place}`}
                data-testid="marathon-podium-place"
              >
                {place === 1 && <span className="marathon-crown">♛</span>}
                <Initials name={entry.name} />
                <strong>{entry.name}</strong>
                <span className="marathon-entry-value">{entry.value}</span>
                <span className="marathon-step">{place}</span>
              </li>
            );
          })}
        </ol>
      )}
      <LeaderList entries={remaining} />
    </>
  );
}

function TaskLeaders({ entries }: { entries: MarathonTaskEntry[] }) {
  if (entries.length === 0) return <EmptyDailyResults />;

  return (
    <ol className="marathon-leader-list" aria-label="Отметки заданий команды">
      {entries.map((entry) => (
        <li key={entry.id}>
          <Initials name={entry.name} />
          <span className="marathon-entry-name">
            {entry.name}
            {entry.isCurrentUser && <small>вы</small>}
          </span>
          <strong className="marathon-task-state">
            {entry.status === 'completed' ? 'Выполнено' : 'Пока нет отметки'}
          </strong>
        </li>
      ))}
    </ol>
  );
}

function LeaderList({ entries }: { entries: MarathonNumericEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <ol className="marathon-leader-list" aria-label="Остальные участники">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="marathon-rank">{entry.place ?? '—'}</span>
          <Initials name={entry.name} />
          <span className="marathon-entry-name">
            {entry.name}
            {entry.isCurrentUser && <small>вы</small>}
          </span>
          <strong className="marathon-entry-value">{entry.value}</strong>
        </li>
      ))}
    </ol>
  );
}

function CaptainTaskCard({ task }: { task: CaptainTask }) {
  return (
    <section className="marathon-captain-task" aria-labelledby="captain-task-title">
      <p className="marathon-kicker">Задание капитана</p>
      <h2 id="captain-task-title">{task.title}</h2>
      <p>{task.description}</p>
      <button
        type="button"
        onClick={task.onComplete}
        disabled={!task.onComplete || task.isCompleting}
      >
        {task.isCompleting ? 'Сохраняем…' : task.completionLabel}
      </button>
      {task.error && <p className="marathon-task-error" role="alert">{task.error}</p>}
    </section>
  );
}

function EmptyDailyResults() {
  return (
    <p className="marathon-empty-results">
      Сегодня пока нет результатов. Они появятся после отметок участников.
    </p>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('ru-RU');

  return <span className="marathon-avatar" aria-hidden="true">{initials}</span>;
}
