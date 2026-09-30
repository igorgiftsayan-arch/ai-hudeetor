'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AiPreferenceRequestDto,
  AiPreferenceResourceDto,
  OnboardingResourceDto,
  UpdateProfileRequestDto,
  UserProfileResourceDto,
} from '@atlas/api-contracts';
import {
  ApiError,
  apiRequest,
  mutationHeaders,
  newIdempotencyKey,
} from '../../shared/api';

const personas = [
  ['gentleFriend', 'Бережный друг'],
  ['strictCoach', 'Строгий тренер'],
  ['russianLuli', 'Русские люли'],
  ['glamorousFriend', 'Гламурная подруга'],
  ['analyst', 'Аналитик'],
] as const;

type OnboardingResource = OnboardingResourceDto;

type ViewState = 'loading' | 'ready' | 'error';

export default function OnboardingPage() {
  const { replace } = useRouter();
  const [state, setState] = useState<ViewState>('loading');
  const [onboarding, setOnboarding] = useState<OnboardingResource>();
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const profileKey = useRef<string | null>(null);
  const personaKey = useRef<string | null>(null);
  const completionKey = useRef<string | null>(null);

  useEffect(() => {
    void loadOnboarding();
    // The first authoritative read establishes the entire route state.
  }, []);

  async function loadOnboarding() {
    setState('loading');
    setError(undefined);
    try {
      const next = await apiRequest<OnboardingResource>('/users/me/onboarding');
      if (next.status === 'completed') {
        replace('/today');
        return;
      }
      setOnboarding(next);
      if (next.profile?.timezone) setTimezone(next.profile.timezone);
      if (next.status !== 'registered') setNoticeAccepted(true);
      setState('ready');
    } catch (cause) {
      handleError(cause, 'Не удалось загрузить настройку. Попробуйте снова.');
      setState('error');
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onboarding || !noticeAccepted || !timezone.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload: UpdateProfileRequestDto = {
        timezone: timezone.trim(),
        consents: [
          {
            consentType: 'aiWellnessNotice',
            documentVersion: onboarding.aiWellnessNoticeVersion,
            accepted: true,
          },
        ],
      };
      const profile = await apiRequest<UserProfileResourceDto>(
        '/users/me/profile',
        {
          method: 'PATCH',
          headers: mutationHeaders(
            onboarding.csrfToken,
            profileKey.current ?? (profileKey.current = newIdempotencyKey()),
          ),
          body: JSON.stringify(payload),
        },
      );
      setOnboarding({ ...onboarding, status: profile.onboardingStatus });
      profileKey.current = null;
    } catch (cause) {
      handleError(cause, 'Не удалось сохранить настройки. Попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  async function savePersona(personaId: AiPreferenceRequestDto['personaId']) {
    if (!onboarding) return;
    setBusy(true);
    setError(undefined);
    try {
      const payload: AiPreferenceRequestDto = { personaId };
      const preference = await apiRequest<AiPreferenceResourceDto>(
        '/users/me/ai-preference',
        {
          method: 'PUT',
          headers: mutationHeaders(
            onboarding.csrfToken,
            personaKey.current ?? (personaKey.current = newIdempotencyKey()),
          ),
          body: JSON.stringify(payload),
        },
      );
      setOnboarding({ ...onboarding, status: preference.onboardingStatus });
      personaKey.current = null;
    } catch (cause) {
      handleError(cause, 'Не удалось сохранить выбор. Попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  async function completeOnboarding() {
    if (!onboarding) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiRequest('/users/me/onboarding-completions', {
        method: 'POST',
        headers: mutationHeaders(
          onboarding.csrfToken,
          completionKey.current ??
            (completionKey.current = newIdempotencyKey()),
        ),
      });
      replace('/today');
    } catch (cause) {
      handleError(cause, 'Не удалось завершить настройку. Попробуйте снова.');
    } finally {
      setBusy(false);
    }
  }

  function handleError(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.kind === 'session') {
      replace('/login');
      return;
    }
    setError(cause instanceof Error ? cause.message : fallback);
  }

  if (state === 'loading') {
    return (
      <main className="app-shell onboarding-shell">
        <section className="onboarding-panel" aria-live="polite">
          <p className="section-label">Настройка</p>
          <p>Загружаем вашу настройку…</p>
        </section>
      </main>
    );
  }

  if (state === 'error' || !onboarding) {
    return (
      <main className="app-shell onboarding-shell">
        <section className="onboarding-panel">
          <p className="section-label">Настройка</p>
          <h1>Не удалось продолжить</h1>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-action"
            type="button"
            onClick={loadOnboarding}
          >
            Повторить
          </button>
        </section>
      </main>
    );
  }

  const needsProfile = onboarding.status === 'registered';
  const needsPersona = onboarding.status === 'profileReady';

  return (
    <main className="app-shell onboarding-shell">
      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <p className="section-label">Настройка</p>
        <h1 id="onboarding-title">
          {needsProfile
            ? 'Начнём с пары важных деталей'
            : needsPersona
              ? 'Как вам удобнее разговаривать?'
              : 'Всё готово'}
        </h1>

        {needsProfile && (
          <form onSubmit={saveProfile} className="onboarding-form">
            <p className="onboarding-copy">
              Часовой пояс нужен, чтобы записи попадали в ваш сегодняшний день.
            </p>
            <label htmlFor="timezone">Часовой пояс</label>
            <input
              id="timezone"
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              autoComplete="off"
              required
            />
            <label className="consent">
              <input
                type="checkbox"
                checked={noticeAccepted}
                onChange={(event) => setNoticeAccepted(event.target.checked)}
              />
              Я понимаю, что сервис не заменяет медицинскую помощь, а AI может
              ошибаться.
            </label>
            <button
              className="primary-action"
              type="submit"
              disabled={busy || !noticeAccepted || !timezone.trim()}
            >
              {busy ? 'Сохраняем…' : 'Продолжить'}
            </button>
          </form>
        )}

        {needsPersona && (
          <div aria-label="Выбор характера AI" className="persona-grid">
            <p className="onboarding-copy">
              Это можно будет поменять позже. Сейчас выберите самый комфортный
              тон.
            </p>
            {personas.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => void savePersona(id)}
                disabled={busy}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {!needsProfile && !needsPersona && (
          <div className="onboarding-completion">
            <p className="onboarding-copy">
              Личные настройки сохранены. После этого откроется сегодняшний
              экран.
            </p>
            <button
              className="primary-action"
              type="button"
              onClick={() => void completeOnboarding()}
              disabled={busy}
            >
              {busy ? 'Завершаем…' : 'Завершить настройку'}
            </button>
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Irkutsk';
  } catch {
    return 'Asia/Irkutsk';
  }
}
