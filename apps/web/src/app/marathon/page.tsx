'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileNavigation } from '../mobile-navigation';
import { TeamLeaderboard } from '../../features/marathon/team-leaderboard';
import { YesterdayReport } from '../../features/marathon/yesterday-report';
import { CaptainTaskEditor } from '../../features/marathon/captain-task-editor';
import { ProviderConsentNotice } from '../../features/ai-companion/provider-consent';
import {
  completeCaptainTask,
  joinMarathonTeam,
  loadMarathonScreen,
  saveCaptainTask,
  saveWellnessReport,
} from '../../features/marathon/marathon-api';
import type { MarathonScreenData, WellnessValues } from '../../features/marathon/marathon-api';
import { ApiError, apiRequest, newIdempotencyKey } from '../../shared/api';
import type { OnboardingResourceDto } from '@atlas/api-contracts';

type ViewState = 'loading' | 'ready' | 'error' | 'onboarding' | 'notFound' | 'noMembership' | 'notActive';
type Pending = { payload: string; key: string };

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
  const [reportError, setReportError] = useState<string>();
  const [taskError, setTaskError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [saving, setSaving] = useState(false);
  const pendingReport = useRef<Pending | undefined>(undefined);
  const pendingTask = useRef<Pending | undefined>(undefined);
  const pendingCompletion = useRef<Pending | undefined>(undefined);

  const load = useCallback(async () => {
    setViewState('loading');
    try {
      const next = await loadMarathonScreen();
      setData(next);
      setViewState('ready');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else if (cause instanceof ApiError && cause.kind === 'onboarding') setViewState('onboarding');
      else if (cause instanceof ApiError && cause.code === 'MARATHON_NOT_FOUND') setViewState('notFound');
      else if (cause instanceof ApiError && cause.code === 'MARATHON_MEMBERSHIP_REQUIRED') setViewState('noMembership');
      else if (cause instanceof ApiError && cause.code === 'MARATHON_NOT_ACTIVE') setViewState('notActive');
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

  async function saveReport(selectedIds: string[]) {
    if (!data) return;
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
    const payload = JSON.stringify({ reportDate: data.current.reportDate, values });
    if (pendingReport.current?.payload !== payload) {
      pendingReport.current = { payload, key: newIdempotencyKey() };
    }
    setSaving(true);
    setReportError(undefined);
    setSaved(undefined);
    try {
      await saveWellnessReport({
        reportDate: data.current.reportDate,
        values,
        csrfToken: data.csrfToken,
        idempotencyKey: pendingReport.current.key,
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

  async function markCaptainTask() {
    if (!data?.team.captainTask) return;
    const payload = JSON.stringify({ taskId: data.team.captainTask.id, completed: true });
    if (pendingCompletion.current?.payload !== payload) {
      pendingCompletion.current = { payload, key: newIdempotencyKey() };
    }
    setSaving(true);
    setTaskError(undefined);
    try {
      await completeCaptainTask({
        taskId: data.team.captainTask.id,
        csrfToken: data.csrfToken,
        idempotencyKey: pendingCompletion.current.key,
      });
      pendingCompletion.current = undefined;
      setSaved('Отметка задания обновлена');
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      else setTaskError(cause instanceof Error ? cause.message : 'Не удалось обновить отметку.');
    } finally {
      setSaving(false);
    }
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
      else setTaskError(cause instanceof Error ? cause.message : 'Не удалось сохранить задание.');
    } finally {
      setSaving(false);
    }
  }

  async function joinTeam(joinCode: string) {
    try {
      const onboarding = await apiRequest<OnboardingResourceDto>('/users/me/onboarding');
      await joinMarathonTeam({
        joinCode,
        csrfToken: onboarding.csrfToken,
        idempotencyKey: newIdempotencyKey(),
      });
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') replace('/login');
      throw cause;
    }
  }

  if (viewState !== 'ready' || !data) {
    return <MarathonBoundary state={viewState === 'ready' ? 'loading' : viewState} onRetry={load} onJoin={joinTeam} />;
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
          dayLabel={formatDay(data.current.displayDate)}
          metrics={[
            {
              id: 'weight',
              label: 'Отвес, %',
              legend: 'Дневная формула пока не утверждена.',
              kind: 'numeric',
              entries: data.team.members.map((member) => ({
                id: member.membershipId,
                name: member.displayName ?? 'Участник',
                value: member.weight.dailyPercent == null ? null : formatPercent(member.weight.dailyPercent),
                isCurrentUser: member.isCurrentUser,
              })),
            },
            {
              id: 'wellness',
              label: 'Веллнес',
              legend: 'Количество отметок в отчёте за вчера.',
              kind: 'numeric',
              entries: data.team.members.map((member) => ({
                id: member.membershipId,
                name: member.displayName ?? 'Участник',
                value: member.wellness.markedCount == null ? null : String(member.wellness.markedCount),
                isCurrentUser: member.isCurrentUser,
              })),
            },
            {
              id: 'tasks',
              label: 'Задания',
              legend: 'Отметки выполнения задания на сегодня.',
              kind: 'binary',
              entries: data.team.members.map((member) => ({
                id: member.membershipId,
                name: member.displayName ?? 'Участник',
                status: member.captainTask.status,
                isCurrentUser: member.isCurrentUser,
              })),
            },
          ]}
          captainTask={captainTask ? {
            title: captainTask.title,
            description: captainTask.description,
            completionLabel: currentTaskStatus === 'completed' ? 'Выполнено' : 'Отметить выполнение',
            onComplete: currentTaskStatus === 'completed' ? undefined : () => void markCaptainTask(),
            isCompleting: saving,
            error: taskError,
            onRetry: () => void markCaptainTask(),
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
            onSave={saveReport}
            items={habits.map((habit) => ({
              id: habit.id,
              label: habit.label,
              checked: reportValues?.[habit.id] ?? false,
            }))}
          />
        )}
        {data.report.status === 'unknown' && <p className="marathon-unknown-note">Пока нет отчёта за вчера.</p>}
        {saved && <p className="save-confirmation" aria-live="polite">{saved}</p>}
        <ProviderConsentNotice consent={data.consent} csrfToken={data.csrfToken} onAccepted={load} onSessionExpired={() => replace('/login')} />
        <a href="/quick-reply" className="ai-secondary-action"><span>Поговорить с AI</span><span aria-hidden="true">→</span></a>
      </div>
      <MobileNavigation active="marathon" />
    </main>
  );
}

function MarathonBoundary({ state, onRetry, onJoin }: { state: Exclude<ViewState, 'ready'>; onRetry: () => Promise<void>; onJoin: (joinCode: string) => Promise<void> }) {
  if (state === 'loading') return <main className="app-shell"><div className="app-page loading-state" aria-live="polite"><span className="loading-orbit" aria-hidden="true" /><p>Загружаем марафон…</p></div></main>;
  const canJoin = state === 'notFound' || state === 'noMembership';
  const message = canJoin ? ['Присоединитесь к команде', 'Введите код приглашения от капитана.'] : state === 'onboarding' ? ['Завершите настройку', 'После настройки можно присоединиться к марафону.'] : state === 'notActive' ? ['Марафон сейчас не активен', 'Дневной маршрут появится, когда период будет активен.'] : ['Не удалось загрузить марафон', 'Данные не пропали. Попробуйте ещё раз.'];
  return <main className="app-shell"><div className="app-page boundary-page"><div className="boundary-message" role={state === 'error' ? 'alert' : undefined}><p className="section-label">Герби-Марафон</p><h1>{message[0]}</h1><p>{message[1]}</p>{state === 'onboarding' ? <a href="/onboarding" className="primary-link">Продолжить настройку</a> : canJoin ? <JoinMarathon onJoin={onJoin} /> : <button type="button" className="primary-action" onClick={() => void onRetry()}>Попробовать снова</button>}</div></div></main>;
}

function JoinMarathon({ onJoin }: { onJoin: (joinCode: string) => Promise<void> }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState(false);
  async function submit() {
    if (!joinCode.trim()) return setError('Введите код приглашения.');
    setJoining(true);
    setError(undefined);
    try { await onJoin(joinCode.trim()); }
    catch (cause) { setError(cause instanceof ApiError && cause.code === 'MARATHON_TIMEZONE_MISMATCH' ? 'Для участия timezone профиля должен совпадать с timezone марафона. Изменение timezone выполняется отдельно в профиле.' : cause instanceof Error ? cause.message : 'Не удалось присоединиться к команде.'); }
    finally { setJoining(false); }
  }
  return <div className="marathon-join"><label>Код приглашения<input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} disabled={joining} /></label><button type="button" className="primary-action" onClick={() => void submit()} disabled={joining}>{joining ? 'Присоединяем…' : 'Присоединиться'}</button>{error && <p role="alert">{error}</p>}</div>;
}

function formatDay(date: string) { return `Сегодня · ${date}`; }
function formatReportDate(date: string) { return `Вчера · ${date}`; }
function formatPercent(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} %`; }
