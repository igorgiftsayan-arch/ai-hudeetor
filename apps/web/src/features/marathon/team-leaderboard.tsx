'use client';

import { useState } from 'react';

export type MarathonPodiumMember = {
  id: string;
  name: string;
  isCurrentUser?: boolean;
};

export type MarathonNumericPodium = {
  place: number;
  value: string;
  members: MarathonPodiumMember[];
};

export type MarathonTaskPodium = {
  place: number;
  value: 'Выполнено';
  members: MarathonPodiumMember[];
};

export type MarathonMetric =
  | {
      id: string;
      label: string;
      legend: string;
      kind: 'numeric';
      podiums: MarathonNumericPodium[];
    }
  | {
      id: string;
      label: string;
      legend: string;
      kind: 'binary';
      podiums: MarathonTaskPodium[];
    };

export type CaptainTask = {
  title: string;
  description: string;
  completionLabel: string;
  onComplete?: () => void;
  onRetry?: () => void;
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
            label={activeMetric.label}
            podiums={activeMetric.podiums}
          />
        )}
        {activeMetric.kind === 'binary' && (
          <TaskLeaders label={activeMetric.label} podiums={activeMetric.podiums} />
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

function NumericLeaders({ label, podiums }: { label: string; podiums: MarathonNumericPodium[] }) {
  if (podiums.length === 0) return <EmptyDailyResults />;

  const podiumByPlace = new Map(podiums.map((podium) => [podium.place, podium]));
  const isClassicPodium =
    podiums.length === 3 &&
    ([1, 2, 3] as const).every(
      (place) => podiumByPlace.get(place)?.members.length === 1,
    );

  if (!isClassicPodium) {
    return <PodiumGroups ariaLabel={`Лидеры дня: ${label}`} podiums={podiums} />;
  }

  return (
    <ol className="marathon-podium" aria-label="Три лидера дня">
      {([2, 1, 3] as const).map((place) => {
            const podium = podiumByPlace.get(place)!;
            const member = podium.members[0]!;
            return (
              <li
                key={member.id}
                className={`marathon-podium-place place-${place}`}
                data-testid="marathon-podium-place"
              >
                {place === 1 && <span className="marathon-crown">♛</span>}
                <Initials name={member.name} />
                <strong>{member.name}</strong>
                <span className="marathon-entry-value">{podium.value}</span>
                <span className="marathon-step">{place}</span>
              </li>
            );
          })}
    </ol>
  );
}

function TaskLeaders({ label, podiums }: { label: string; podiums: MarathonTaskPodium[] }) {
  return <PodiumGroups ariaLabel={`Лидеры дня: ${label}`} podiums={podiums} />;
}

function PodiumGroups({
  ariaLabel,
  podiums,
}: {
  ariaLabel: string;
  podiums: Array<MarathonNumericPodium | MarathonTaskPodium>;
}) {
  if (podiums.length === 0) return <EmptyDailyResults />;

  return (
    <ol className="marathon-leader-list" aria-label={ariaLabel}>
      {podiums.map((podium) => (
        <li key={podium.place}>
          <span className="marathon-rank">{podium.place}</span>
          <span className="marathon-podium-members">
            {podium.members.map((member) => (
              <span className="marathon-podium-member" key={member.id}>
                <Initials name={member.name} />
                <span className="marathon-entry-name">
                  {member.name}
                  {member.isCurrentUser && <small>вы</small>}
                </span>
              </span>
            ))}
          </span>
          <strong className="marathon-entry-value">{podium.value}</strong>
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
      {task.error && task.onRetry && <button type="button" onClick={task.onRetry}>Повторить</button>}
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
