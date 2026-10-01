'use client';

import { useState, type ReactNode } from 'react';

export type MarathonLobbyMarathon = {
  id: string;
  name: string;
  status: 'enrollmentOpen' | 'enrollmentClosed' | 'inProgress' | 'completed';
  durationDays: number;
  timezone: string;
  startsOn: string | null;
  endsOn: string | null;
  enrollmentOpenedAt: string;
  enrollmentClosedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type MarathonLobbyData = {
  marathon: MarathonLobbyMarathon | null;
  enrollment: { isOpen: boolean; memberCount: number } | null;
  currentMembership: { id: string; role: 'captain' | 'participant' } | null;
  canManage: boolean;
  canOpenEnrollment: boolean;
};

export type MarathonLobbyAction = 'join' | 'openEnrollment' | 'closeEnrollment' | 'start';

export function MarathonLobby({
  lobby,
  pendingAction,
  error,
  onJoin,
  onOpenEnrollment,
  onCloseEnrollment,
  onStart,
}: {
  lobby: MarathonLobbyData;
  pendingAction?: MarathonLobbyAction;
  error?: string;
  onJoin?: () => void;
  onOpenEnrollment?: (durationDays: number) => void;
  onCloseEnrollment?: () => void;
  onStart?: () => void;
}) {
  const marathon = lobby.marathon;

  if (marathon?.status === 'inProgress') return null;

  if (!marathon) {
    return (
      <LobbyShell error={error}>
        {lobby.canOpenEnrollment ? (
          <EnrollmentSetup
            actionLabel="Открыть набор"
            isPending={pendingAction === 'openEnrollment'}
            onOpen={onOpenEnrollment}
          />
        ) : (
          <WaitingForEnrollment />
        )}
      </LobbyShell>
    );
  }

  if (marathon.status === 'enrollmentOpen') {
    return (
      <LobbyShell error={error}>
        <MarathonSummary marathon={marathon} memberCount={lobby.enrollment?.memberCount} />
        {lobby.currentMembership ? (
          <p className="marathon-lobby-copy">Вы уже в марафоне. Набор ещё открыт.</p>
        ) : (
          <button
            type="button"
            className="primary-action"
            disabled={!onJoin || pendingAction === 'join'}
            onClick={onJoin}
          >
            {pendingAction === 'join' ? 'Вступаем…' : 'Вступить в марафон'}
          </button>
        )}
        {lobby.canManage && (
          <button
            type="button"
            className="marathon-lobby-secondary-action"
            disabled={!onCloseEnrollment || pendingAction === 'closeEnrollment'}
            onClick={onCloseEnrollment}
          >
            {pendingAction === 'closeEnrollment' ? 'Завершаем набор…' : 'Завершить набор'}
          </button>
        )}
      </LobbyShell>
    );
  }

  if (marathon.status === 'enrollmentClosed') {
    return (
      <LobbyShell error={error}>
        <MarathonSummary marathon={marathon} memberCount={lobby.enrollment?.memberCount} />
        <h1>Набор завершён</h1>
        <p className="marathon-lobby-copy">
          Первый день начнётся, когда капитан его запустит.
        </p>
        {lobby.canManage && (
          <button
            type="button"
            className="primary-action"
            disabled={!onStart || pendingAction === 'start'}
            onClick={onStart}
          >
            {pendingAction === 'start' ? 'Запускаем…' : 'Начать первый день'}
          </button>
        )}
      </LobbyShell>
    );
  }

  return (
    <LobbyShell error={error}>
      <MarathonSummary marathon={marathon} memberCount={lobby.enrollment?.memberCount} />
      <h1>Марафон завершён</h1>
      <p className="marathon-lobby-copy">
        Дневные результаты сохранены в истории этого марафона.
      </p>
      {lobby.canOpenEnrollment && (
        <EnrollmentSetup
          actionLabel="Открыть новый набор"
          isPending={pendingAction === 'openEnrollment'}
          onOpen={onOpenEnrollment}
        />
      )}
    </LobbyShell>
  );
}

function LobbyShell({ children, error }: { children: ReactNode; error?: string }) {
  return (
    <section className="marathon-lobby" aria-labelledby="marathon-lobby-title">
      <p className="marathon-kicker">Герби-Марафон</p>
      {children}
      {error && <p className="marathon-task-error" role="alert">{error}</p>}
    </section>
  );
}

function WaitingForEnrollment() {
  return (
    <>
      <h1 id="marathon-lobby-title">Набор ещё не открыт</h1>
      <p className="marathon-lobby-copy">
        Здесь появится кнопка вступления, когда капитан откроет набор.
      </p>
    </>
  );
}

function EnrollmentSetup({
  actionLabel,
  isPending,
  onOpen,
}: {
  actionLabel: string;
  isPending: boolean;
  onOpen?: (durationDays: number) => void;
}) {
  const [duration, setDuration] = useState('21');
  const [validationError, setValidationError] = useState<string>();

  function submit() {
    const durationDays = Number(duration);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      setValidationError('Укажите длительность от 1 до 365 дней.');
      return;
    }
    setValidationError(undefined);
    onOpen?.(durationDays);
  }

  return (
    <div className="marathon-lobby-setup">
      <h1 id="marathon-lobby-title">Откройте набор</h1>
      <p className="marathon-lobby-copy">
        Выберите длительность. Первый день начнётся отдельно после закрытия набора.
      </p>
      <label>
        <span>Длительность, дней</span>
        <input
          type="number"
          min="1"
          max="365"
          inputMode="numeric"
          value={duration}
          disabled={isPending}
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="primary-action"
        disabled={!onOpen || isPending}
        onClick={submit}
      >
        {isPending ? 'Открываем набор…' : actionLabel}
      </button>
      {validationError && <p className="marathon-task-error" role="alert">{validationError}</p>}
    </div>
  );
}

function MarathonSummary({
  marathon,
  memberCount,
}: {
  marathon: MarathonLobbyMarathon;
  memberCount?: number;
}) {
  return (
    <div className="marathon-lobby-summary">
      <h1 id="marathon-lobby-title">{marathon.name}</h1>
      <dl>
        <div>
          <dt>Длительность</dt>
          <dd>{formatDays(marathon.durationDays)}</dd>
        </div>
        {typeof memberCount === 'number' && (
          <div>
            <dt>Участники</dt>
            <dd>{formatMembers(memberCount)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function formatDays(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${value} дней`;
  if (mod10 === 1) return `${value} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} дня`;
  return `${value} дней`;
}

function formatMembers(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${value} участников`;
  if (mod10 === 1) return `${value} участник`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} участника`;
  return `${value} участников`;
}
