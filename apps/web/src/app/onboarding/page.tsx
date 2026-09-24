'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AiPreferenceRequestDto, UserProfileResourceDto, OnboardingResourceDto, UpdateProfileRequestDto } from '../../../../../packages/api-contracts/generated/client';
import { ApiError, apiRequest, mutationHeaders, newIdempotencyKey } from '../../shared/api';

const personas = [
  ['gentleFriend', 'Бережный друг'],
  ['strictCoach', 'Строгий тренер'],
  ['russianLuli', 'Русские люли'],
  ['glamorousFriend', 'Гламурная подруга'],
  ['analyst', 'Аналитик'],
] as const;

export default function OnboardingPage() {
  const { replace } = useRouter();
  const [timezone, setTimezone] = useState('Asia/Irkutsk');
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [state, setState] = useState<OnboardingResourceDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [readRevision, setReadRevision] = useState(0);
  const busy = useRef(false);
  const completionKey = useRef<string | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    let current = true;
    setLoading(true);
    setError(undefined);
    void apiRequest<OnboardingResourceDto>('/users/me/onboarding')
      .then((onboarding) => {
        if (!current) return;
        if (onboarding.status === 'completed') replace('/today');
        setState(onboarding);
        if (onboarding.profile) setTimezone(onboarding.profile.timezone);
      })
      .catch((cause: unknown) => {
        if (current) handleError(cause);
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; active.current = false; };
  }, [replace, readRevision]);

  function handleError(cause: unknown) {
    if (cause instanceof ApiError && cause.kind === 'session') {
      replace('/login');
      return;
    }
    setError(cause instanceof Error ? cause.message : 'Не удалось сохранить настройку. Попробуйте снова.');
  }

  async function mutate(path: string, method: string, body: unknown, nextStatus: OnboardingResourceDto['status']) {
    if (!state || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(undefined);
    try {
      // Keep completion retries on the same server receipt, including a lost response.
      if (nextStatus === 'completed') completionKey.current ??= newIdempotencyKey();
      const result = await apiRequest<Pick<UserProfileResourceDto, 'onboardingStatus'>>(path, {
        method,
        headers: mutationHeaders(state.csrfToken, completionKey.current ?? newIdempotencyKey()),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!active.current) return;
      if (result.onboardingStatus !== nextStatus) throw new Error('Сохранение настройки не подтверждено. Попробуйте снова.');
      if (nextStatus === 'completed') {
        replace('/today');
      }
      setState({ ...state, status: nextStatus });
    } catch (cause) {
      if (active.current) handleError(cause);
    } finally {
      busy.current = false;
      if (active.current) setLoading(false);
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noticeAccepted || !timezone || !state) return;
    const body: UpdateProfileRequestDto = {
      timezone,
      consents: [{ consentType: 'aiWellnessNotice', documentVersion: state.aiWellnessNoticeVersion, accepted: true }],
    };
    void mutate('/users/me/profile', 'PATCH', body, 'profileReady');
  }

  function savePersona(personaId: AiPreferenceRequestDto['personaId']) {
    const body: AiPreferenceRequestDto = { personaId };
    void mutate('/users/me/ai-preference', 'PUT', body, 'personaReady');
  }

  return (
    <main>
      <section aria-labelledby="onboarding-title">
        <p className="eyebrow">Onboarding</p>
        <h1 id="onboarding-title">Настроим вашего AI-друга</h1>
        {error && <p role="alert">{error}</p>}
        {!state ? (
          loading ? <p role="status">Загружаем настройку…</p> : <button onClick={() => setReadRevision((value) => value + 1)}>Повторить загрузку</button>
        ) : state.status === 'registered' ? (
          <form onSubmit={saveProfile} className="onboarding-form">
            <label htmlFor="timezone">Часовой пояс</label>
            <input
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
            />
            <label className="consent">
              <input
                type="checkbox"
                checked={noticeAccepted}
                onChange={(event) => setNoticeAccepted(event.target.checked)}
              />
              Я понимаю, что сервис не заменяет медицинскую помощь.
            </label>
            <button type="submit" disabled={loading || !noticeAccepted}>Продолжить</button>
          </form>
        ) : state.status === 'profileReady' ? (
          <div aria-label="Выбор характера AI" className="persona-grid">
            <h2>Выберите характер</h2>
            {personas.map(([id, label]) => (
              <button key={id} type="button" disabled={loading} onClick={() => savePersona(id)}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div aria-live="polite">
            <h2>Базовая настройка готова</h2>
            <p>Профиль и характер сохранены. Завершите настройку, чтобы открыть дневник.</p>
            <button disabled={loading || state.status === 'completed'} onClick={() => void mutate('/users/me/onboarding-completions', 'POST', undefined, 'completed')}>
              {loading ? 'Завершаем настройку…' : 'Открыть дневник'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
