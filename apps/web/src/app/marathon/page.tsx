'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import { TeamLeaderboard } from '../../features/marathon/team-leaderboard';
import { YesterdayReport } from '../../features/marathon/yesterday-report';
import { CaptainTaskEditor } from '../../features/marathon/captain-task-editor';
import {
  MarathonLobby,
  type MarathonLobbyAction,
} from '../../features/marathon/marathon-lobby';
import { ProviderConsentNotice } from '../../features/ai-companion/provider-consent';
import {
  closeMarathonEnrollment,
  completeCaptainTask,
  joinMarathonEnrollment,
  loadMarathonCompletionScreen,
  loadMarathonLobbyScreen,
  loadMarathonScreen,
  openMarathonEnrollment,
  saveCaptainTask,
  saveWellnessReport,
  startMarathon,
} from '../../features/marathon/marathon-api';
import type {
  MarathonLobbyScreenData,
  MarathonCompletionScreenData,
  MarathonScreenData,
  WellnessValues,
} from '../../features/marathon/marathon-api';
import { ApiError, newIdempotencyKey } from '../../shared/api';

type ViewState = 'loading' | 'ready' | 'error' | 'onboarding' | 'notFound';
type Pending = { payload: string; key: string };
type PendingCompletion = Pending & { taskId: string; completed: boolean };
type PendingLobbyAction = Pending & { action: MarathonLobbyAction };

const habits: Array<{ id: keyof WellnessValues; label: string }> = [
  { id: 'morningShake', label: 'Утренний коктейль' },
  { id: 'physicalActivity', label: 'Физическая активность' },
  { id: 'waterTarget', label: 'Норма воды' },
  { id: 'secondShake', label: 'Второй коктейль' },
  { id: 'healthyDinner', label: 'Здоровый ужин' },
  { id: 'goodSleep', label: 'Хороший сон' },
  { id: 'noJunkFood', label: 'Никакой вредной еды' },
  { id: 'noSmoking', label: 'Никакого курения' },
];

export default function MarathonPage() {
  const { replace } = useRouter();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [data, setData] = useState<MarathonScreenData>();
  const [lobbyData, setLobbyData] = useState<MarathonLobbyScreenData>();
  const [completionData, setCompletionData] = useState<MarathonCompletionScreenData>();
  const [lobbyError, setLobbyError] = useState<string>();
  const [pendingLobbyAction, setPendingLobbyAction] = useState<MarathonLobbyAction>();
  const [reportError, setReportError] = useState<string>();
  const [taskError, setTaskError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [saving, setSaving] = useState(false);
  const pendingReport = useRef<Pending | undefined>(undefined);
  const pendingTask = useRef<Pending | undefined>(undefined);
  const pendingCompletion = useRef<PendingCompletion | undefined>(undefined);
  const pendingLobby = useRef<PendingLobbyAction | undefined>(undefined);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const nextLobby = await loadMarathonLobbyScreen();
      const canOpenDailyScreen =
        nextLobby.lobby.marathon?.status === 'inProgress' &&
        Boolean(nextLobby.lobby.currentMembership);
      if (canOpenDailyScreen) {
        const next = await loadMarathonScreen();
        setData(next);
        setLobbyData(undefined);
        if (nextLobby.lobby.finale) {
          const nextCompletion = await loadMarathonCompletionScreen(
            nextLobby.csrfToken,
            nextLobby.lobby.finale.marathonId,
          );
          setCompletionData(
            isCompletionForFinale(nextCompletion, nextLobby.lobby.finale)
              ? nextCompletion
              : undefined,
          );
        } else {
          setCompletionData(undefined);
        }
      } else if (nextLobby.lobby.finale) {
        const nextCompletion = await loadMarathonCompletionScreen(
          nextLobby.csrfToken,
          nextLobby.lobby.finale.marathonId,
        );
        setData(undefined);
        setLobbyData(nextLobby);
        setCompletionData(
          isCompletionForFinale(nextCompletion, nextLobby.lobby.finale)
            ? nextCompletion
            : undefined,
        );
      } else {
        setData(undefined);
        setLobbyData(nextLobby);
        setCompletionData(undefined);
      }
      setViewState('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else if (cause instanceof ApiError && cause.kind === 'onboarding') setViewState('onboarding');
      else if (cause instanceof ApiError && cause.code === 'MARATHON_NOT_FOUND') setViewState('notFound');
      else setViewState('error');
    }
  }, [replace]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const recoverDate = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', recoverDate);
    return () => window.removeEventListener('focus', recoverDate);
  }, [load]);

  async function saveReport(
    screen: Pick<MarathonScreenData, 'csrfToken' | 'current'>,
    selectedIds: string[],
    marathonId?: string,
  ) {
    const values = habits.reduce<WellnessValues>((result, habit) => {
      result[habit.id] = selectedIds.includes(habit.id);
      return result;
    }, {
      morningShake: false,
      physicalActivity: false,
      waterTarget: false,
      secondShake: false,
      healthyDinner: false,
      goodSleep: false,
      noJunkFood: false,
      noSmoking: false,
    });
    const payload = JSON.stringify({ reportDate: screen.current.reportDate, values });
    if (pendingReport.current?.payload !== payload) {
      pendingReport.current = { payload, key: newIdempotencyKey() };
    }
    setSaving(true);
    setReportError(undefined);
    setSaved(undefined);
    try {
      await saveWellnessReport({
        reportDate: screen.current.reportDate,
        values,
        csrfToken: screen.csrfToken,
        idempotencyKey: pendingReport.current.key,
        marathonId,
      });
      pendingReport.current = undefined;
      setSaved('Отчёт за вчера обновлён');
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else if (cause instanceof ApiError && cause.code === 'MARATHON_REPORT_DATE_INVALID') {
        pendingReport.current = undefined;
        await load();
        setReportError('Дата отчёта изменилась. Проверьте отметки и отправьте ещё раз.');
      } else setReportError(cause instanceof Error ? cause.message : 'Не удалось сохранить отчёт.');
    } finally {
      setSaving(false);
    }
  }

  async function markCaptainTask(completed: boolean) {
    if (!data?.team.captainTask) return;
    const payload = JSON.stringify({
      taskId: data.team.captainTask.id,
      completed,
    });
    if (pendingCompletion.current?.payload !== payload) {
      pendingCompletion.current = {
        payload,
        key: newIdempotencyKey(),
        taskId: data.team.captainTask.id,
        completed,
      };
    }
    setSaving(true);
    setTaskError(undefined);
    try {
      await completeCaptainTask({
        taskId: data.team.captainTask.id,
        completed,
        csrfToken: data.csrfToken,
        idempotencyKey: pendingCompletion.current.key,
      });
      pendingCompletion.current = undefined;
      setSaved('Отметка задания обновлена');
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else if (
        cause instanceof ApiError &&
        (cause.code === 'MARATHON_TASK_DATE_INVALID' ||
          cause.code === 'MARATHON_NOT_FOUND')
      ) {
        pendingCompletion.current = undefined;
        await load();
        setTaskError('Дата задания изменилась. Экран обновлён — можно продолжить.');
      }
      else setTaskError(cause instanceof Error ? cause.message : 'Не удалось обновить отметку.');
    } finally {
      setSaving(false);
    }
  }

  function retryCaptainTask() {
    if (!data?.team.captainTask || !pendingCompletion.current) return;
    const pending = pendingCompletion.current;
    if (pending.taskId !== data.team.captainTask.id) {
      pendingCompletion.current = undefined;
      setTaskError('Задание обновилось. Проверьте отметку ещё раз.');
      void load();
      return;
    }
    void markCaptainTask(pending.completed);
  }

  async function saveTask(task: { title: string; description: string }) {
    if (!data) return;
    const payload = JSON.stringify({ taskDate: data.current.displayDate, ...task });
    if (pendingTask.current?.payload !== payload) {
      pendingTask.current = { payload, key: newIdempotencyKey() };
    }
    setSaving(true);
    setTaskError(undefined);
    try {
      await saveCaptainTask({
        taskDate: data.current.displayDate,
        ...task,
        csrfToken: data.csrfToken,
        idempotencyKey: pendingTask.current.key,
      });
      pendingTask.current = undefined;
      setSaved('Задание капитана обновлено');
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else if (
        cause instanceof ApiError &&
        cause.code === 'VALIDATION_ERROR' &&
        cause.message === 'Task date must be the current marathon date'
      ) {
        pendingTask.current = undefined;
        await load();
        setTaskError('Дата задания изменилась. Экран обновлён — можно продолжить.');
      }
      else setTaskError(cause instanceof Error ? cause.message : 'Не удалось сохранить задание.');
    } finally {
      setSaving(false);
    }
  }

  async function runLobbyAction(
    action: MarathonLobbyAction,
    payload: string,
    request: (idempotencyKey: string) => Promise<unknown>,
  ) {
    if (!lobbyData) return;
    if (
      pendingLobby.current?.action !== action ||
      pendingLobby.current.payload !== payload
    ) {
      pendingLobby.current = { action, payload, key: newIdempotencyKey() };
    }
    setPendingLobbyAction(action);
    setLobbyError(undefined);
    try {
      await request(pendingLobby.current.key);
      pendingLobby.current = undefined;
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
        return;
      }
      setLobbyError(formatLobbyActionError(cause));
    } finally {
      setPendingLobbyAction(undefined);
    }
  }

  function joinLobbyEnrollment() {
    const marathonId = lobbyData?.lobby.marathon?.id;
    if (!lobbyData || !marathonId) return;
    void runLobbyAction('join', JSON.stringify({ marathonId }), (idempotencyKey) =>
      joinMarathonEnrollment({
        marathonId,
        csrfToken: lobbyData.csrfToken,
        idempotencyKey,
      }),
    );
  }

  function openLobbyEnrollment(durationDays: number) {
    if (!lobbyData) return;
    void runLobbyAction(
      'openEnrollment',
      JSON.stringify({ durationDays }),
      (idempotencyKey) =>
        openMarathonEnrollment({
          durationDays,
          csrfToken: lobbyData.csrfToken,
          idempotencyKey,
        }),
    );
  }

  function closeLobbyEnrollment() {
    const marathonId = lobbyData?.lobby.marathon?.id;
    if (!lobbyData || !marathonId) return;
    void runLobbyAction(
      'closeEnrollment',
      JSON.stringify({ marathonId }),
      (idempotencyKey) =>
        closeMarathonEnrollment({
          marathonId,
          csrfToken: lobbyData.csrfToken,
          idempotencyKey,
        }),
    );
  }

  function startLobbyMarathon() {
    const marathonId = lobbyData?.lobby.marathon?.id;
    if (!lobbyData || !marathonId) return;
    void runLobbyAction('start', JSON.stringify({ marathonId }), (idempotencyKey) =>
      startMarathon({
        marathonId,
        csrfToken: lobbyData.csrfToken,
        idempotencyKey,
      }),
    );
  }

  if (viewState !== 'ready') {
    return <MarathonBoundary state={viewState} onRetry={load} />;
  }

  if (lobbyData) {
    return (
      <main className="app-shell marathon-shell">
        <div className="app-page">
          <a className="marathon-brand" href="/today">↗ Герби-Марафон</a>
          <MarathonLobby
            lobby={lobbyData.lobby}
            pendingAction={pendingLobbyAction}
            error={lobbyError}
            onJoin={joinLobbyEnrollment}
            onOpenEnrollment={openLobbyEnrollment}
            onCloseEnrollment={closeLobbyEnrollment}
            onStart={startLobbyMarathon}
          />
          {completionData && (
            <MarathonCompletion
              data={completionData}
              isSaving={saving}
              error={reportError}
              onSave={(selectedIds) => void saveReport(
                completionData,
                selectedIds,
                completionData.current.marathon.id,
              )}
            />
          )}
          {saved && <p className="save-confirmation" aria-live="polite">{saved}</p>}
        </div>
        <MobileNavigation active="marathon" />
      </main>
    );
  }

  if (!data) {
    return <MarathonBoundary state="loading" onRetry={load} />;
  }

  const reportValues = data.report.status === 'reported' ? data.report.report ?? undefined : undefined;
  const captainTask = data.team.captainTask;
  const currentTaskStatus = captainTask?.currentUserCompletion.status;

  return (
    <main className="app-shell marathon-shell">
      <div className="app-page">
        <a className="marathon-brand" href="/today">↗ Герби-Марафон</a>
        <TeamLeaderboard
          teamName={data.team.team.name}
          dayLabel={formatDay(data.current.displayDate, data.current.marathon)}
          metrics={[
            {
              id: 'weight',
              label: 'Отвес, %',
              legend: 'Разница между вчерашним и сегодняшним весом.',
              kind: 'numeric',
              podiums: data.team.podiums.weight.map((podium) => ({
                place: podium.place,
                value: formatPercent(podium.value),
                members: podium.members.map((member) => ({
                  id: member.membershipId,
                  name: member.displayName ?? 'Участник',
                  isCurrentUser: member.isCurrentUser,
                })),
              })),
            },
            {
              id: 'wellness',
              label: 'Веллнес',
              legend: 'Отметки из вчерашнего отчёта: до 8.',
              kind: 'numeric',
              podiums: data.team.podiums.wellness.map((podium) => ({
                place: podium.place,
                value: String(podium.value),
                members: podium.members.map((member) => ({
                  id: member.membershipId,
                  name: member.displayName ?? 'Участник',
                  isCurrentUser: member.isCurrentUser,
                })),
              })),
            },
            {
              id: 'tasks',
              label: 'Задания',
              legend: 'Кто выполнил сегодняшнее задание капитана.',
              kind: 'binary',
              podiums: data.team.podiums.captainTask.map((podium) => ({
                place: podium.place,
                value: 'Выполнено' as const,
                members: podium.members.map((member) => ({
                  id: member.membershipId,
                  name: member.displayName ?? 'Участник',
                  isCurrentUser: member.isCurrentUser,
                })),
              })),
            },
          ]}
          captainTask={captainTask ? {
            title: captainTask.title,
            description: captainTask.description,
            completionLabel: currentTaskStatus === 'completed' ? 'Отменить выполнение' : 'Отметить выполнение',
            onComplete: () => void markCaptainTask(currentTaskStatus !== 'completed'),
            isCompleting: saving,
            error: taskError,
            onRetry: retryCaptainTask,
          } : undefined}
        />

        {data.team.currentMembership.role === 'captain' && (
          <CaptainTaskEditor
            task={captainTask ? { title: captainTask.title, description: captainTask.description } : undefined}
            isSaving={saving}
            error={taskError}
            onSave={(task) => void saveTask(task)}
            onRetry={() => {
              if (!pendingTask.current) return;
              void saveTask(JSON.parse(pendingTask.current.payload) as { title: string; description: string });
            }}
          />
        )}

        <div className="marathon-spacer" />
        {data.report.status === 'notApplicable' ? (
          <section className="marathon-report" aria-label="Отчёт за вчера недоступен">
            <p className="marathon-kicker">Отчёт за вчера</p>
            <h2>Пока недоступен</h2>
            <p className="marathon-report-intro">Этот отчёт станет доступен, когда для него наступит дата в периоде марафона.</p>
          </section>
        ) : (
          <YesterdayReport
            dateLabel={formatReportDate(data.current.reportDate)}
            mode={data.report.status === 'reported' ? 'update' : 'create'}
            isSaving={saving}
            error={reportError}
            onSave={(selectedIds) => void saveReport(data, selectedIds)}
            items={habits.map((habit) => ({
              id: habit.id,
              label: habit.label,
              checked: reportValues?.[habit.id] ?? false,
            }))}
          />
        )}
        {data.report.status === 'unknown' && <p className="marathon-unknown-note">Пока нет отчёта за вчера.</p>}
        {completionData && (
          <MarathonCompletion
            data={completionData}
            isSaving={saving}
            error={reportError}
            onSave={(selectedIds) => void saveReport(
              completionData,
              selectedIds,
              completionData.current.marathon.id,
            )}
          />
        )}
        {saved && <p className="save-confirmation" aria-live="polite">{saved}</p>}
        <ProviderConsentNotice consent={data.consent} csrfToken={data.csrfToken} onAccepted={load} onSessionExpired={() => replace('/login')} />
        <a href="/quick-reply" className="ai-secondary-action"><span>Поговорить с AI</span><span aria-hidden="true">→</span></a>
      </div>
      <MobileNavigation active="marathon" />
    </main>
  );
}

function MarathonCompletion({
  data,
  isSaving,
  error,
  onSave,
}: {
  data: MarathonCompletionScreenData;
  isSaving: boolean;
  error?: string;
  onSave: (selectedIds: string[]) => void;
}) {
  const reportValues =
    data.report.status === 'reported' ? data.report.report ?? undefined : undefined;
  return (
    <section className="marathon-completion" aria-labelledby="marathon-completion-title">
      <div className="marathon-completion-heading">
        <p className="marathon-kicker">Герби-Марафон</p>
        <h1 id="marathon-completion-title">Марафон завершён</h1>
        <p>Сохраните финальный отчёт за последний день.</p>
      </div>
      <YesterdayReport
        dateLabel={formatReportDate(data.current.reportDate)}
        mode={data.report.status === 'reported' ? 'update' : 'create'}
        isSaving={isSaving}
        error={error}
        onSave={onSave}
        items={habits.map((habit) => ({
          id: habit.id,
          label: habit.label,
          checked: reportValues?.[habit.id] ?? false,
        }))}
      />
      {data.report.status === 'unknown' && (
        <p className="marathon-unknown-note">Пока нет отчёта за последний день.</p>
      )}
    </section>
  );
}

function MarathonBoundary({ state, onRetry }: { state: Exclude<ViewState, 'ready'>; onRetry: () => Promise<void> }) {
  if (state === 'loading') return <main className="app-shell"><div className="app-page loading-state" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><p>Загружаем марафон…</p></div></main>;
  const message = state === 'onboarding'
    ? ['Завершите настройку', 'После настройки можно открыть марафон.']
    : state === 'notFound'
      ? ['Марафон не найден', 'Обновите экран и попробуйте снова.']
      : ['Не удалось загрузить марафон', 'Данные не пропали. Попробуйте ещё раз.'];
  return <main className="app-shell"><div className="app-page boundary-page"><div className="boundary-message" role={state === 'error' ? 'alert' : undefined}><p className="section-label">Герби-Марафон</p><h1>{message[0]}</h1><p>{message[1]}</p>{state === 'onboarding' ? <a href="/onboarding" className="primary-link">Продолжить настройку</a> : <button type="button" className="primary-action" onClick={() => void onRetry()}>Попробовать снова</button>}</div></div><MobileNavigation active="marathon" /></main>;
}

function formatDay(date: string, marathon: { startsOn: string; endsOn: string }) {
  // These are calendar dates already resolved in the marathon's timezone by
  // the server. UTC arithmetic avoids the device timezone and DST offsets.
  const start = Date.parse(`${marathon.startsOn}T00:00:00Z`);
  const end = Date.parse(`${marathon.endsOn}T00:00:00Z`);
  const today = Date.parse(`${date}T00:00:00Z`);
  const duration = (end - start) / 86_400_000 + 1;
  const day = (today - start) / 86_400_000 + 1;
  if (!Number.isInteger(day) || !Number.isInteger(duration) || day < 1 || day > duration) {
    return `Сегодня · ${date}`;
  }
  return `День ${day} из ${duration} · ${date}`;
}

function isCompletionForFinale(
  completion: MarathonCompletionScreenData,
  finale: NonNullable<MarathonLobbyScreenData['lobby']['finale']>,
) {
  return (
    completion.current.marathon.id === finale.marathonId &&
    completion.current.marathon.endsOn === finale.endsOn &&
    completion.current.membership.id === finale.membershipId &&
    completion.current.membership.role === finale.role &&
    completion.current.reportDate === finale.endsOn
  );
}
function formatReportDate(date: string) { return `Вчера · ${date}`; }
function formatPercent(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} %`; }

function formatLobbyActionError(cause: unknown) {
  if (!(cause instanceof ApiError)) {
    return 'Не удалось обновить набор. Попробуйте снова.';
  }
  if (cause.code === 'MARATHON_ENROLLMENT_CLOSED') return 'Набор уже завершён. Экран обновлён — можно продолжить.';
  if (cause.code === 'MARATHON_START_REQUIRES_CLOSED_ENROLLMENT') return 'Сначала завершите набор.';
  if (cause.code === 'MARATHON_ACTIVE_EXISTS') return 'У вас уже есть незавершённый марафон.';
  if (cause.code === 'MARATHON_TIMEZONE_REQUIRED') return 'Укажите часовой пояс в профиле, чтобы открыть набор.';
  if (cause.code === 'MARATHON_CAPTAIN_REQUIRED' || cause.code === 'MARATHON_BOOTSTRAP_FORBIDDEN') {
    return 'Это действие доступно только капитану с разрешением на набор.';
  }
  return cause.message;
}
