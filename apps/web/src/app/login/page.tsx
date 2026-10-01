'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CreateSessionRequestDto,
  CurrentUserResourceDto,
  RegistrationRequestDto,
  RegistrationResourceDto,
  SessionResourceDto,
} from '@atlas/api-contracts';
import { ApiError, apiRequest, newIdempotencyKey } from '../../shared/api';

type PendingRegistration = {
  payload: string;
  idempotencyKey: string;
};

export default function LoginPage() {
  const { replace } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const pendingRegistration = useRef<PendingRegistration | null>(null);
  const termsVersion = process.env.NEXT_PUBLIC_IDENTITY_TERMS_VERSION;
  const privacyVersion = process.env.NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION;
  const canRegister = Boolean(termsVersion && privacyVersion);

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(undefined);
    pendingRegistration.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const registered = mode === 'register';
      const registrationPayload = registered
        ? buildRegistrationPayload({
            email: email.trim(),
            password,
            termsVersion,
            privacyVersion,
          })
        : undefined;
      if (registered && !registrationPayload) {
        setError(
          'Регистрация временно недоступна: версии документов не настроены.',
        );
        return;
      }
      const payload: RegistrationRequestDto | CreateSessionRequestDto =
        registrationPayload ?? { email: email.trim(), password };
      const serializedPayload = JSON.stringify(payload);
      if (
        registered &&
        pendingRegistration.current?.payload !== serializedPayload
      ) {
        pendingRegistration.current = {
          payload: serializedPayload,
          idempotencyKey: newIdempotencyKey(),
        };
      }
      const session = await apiRequest<
        RegistrationResourceDto | SessionResourceDto
      >(
        registered ? '/registrations' : '/sessions',
        {
          method: 'POST',
          headers: registered
            ? {
                'Content-Type': 'application/json',
                'Idempotency-Key': pendingRegistration.current!.idempotencyKey,
              }
            : { 'Content-Type': 'application/json' },
          body: serializedPayload,
        },
        { unauthorizedKind: 'request' },
      );
      if (registered) {
        replace('/verify-email?next=/onboarding');
      } else {
        const current = await apiRequest<CurrentUserResourceDto>('/users/me');
        if (current.emailVerified === false) {
          replace(
            session.onboardingStatus === 'completed'
              ? '/verify-email?next=/today'
              : '/verify-email?next=/onboarding',
          );
          return;
        }
        const onboarding = await apiRequest<{ status: string }>(
          '/users/me/onboarding',
        );
        replace(onboarding.status === 'completed' ? '/today' : '/onboarding');
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'AUTHENTICATION_FAILED') {
        setError('Неверный email или пароль.');
      } else {
        setError(
          cause instanceof ApiError && cause.code === 'EMAIL_ALREADY_REGISTERED'
            ? 'Этот email уже зарегистрирован. Попробуйте войти.'
            : cause instanceof ApiError &&
                cause.code === 'CONSENT_VERSION_OUTDATED'
              ? 'Версия условий изменилась. Обновите страницу и ознакомьтесь с актуальными документами.'
              : cause instanceof Error
                ? cause.message
                : 'Не удалось войти. Попробуйте снова.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="section-label">Ваш дневник</p>
        <h1 id="login-title">
          {mode === 'login' ? 'С возвращением' : 'Начнём спокойно'}
        </h1>
        <p className="login-intro">
          {mode === 'login'
            ? 'Войдите, чтобы спокойно продолжить с сегодняшней записи.'
            : 'Создайте аккаунт, чтобы начать свой дневник.'}
        </p>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="login-password">Пароль</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            minLength={mode === 'register' ? 12 : undefined}
            maxLength={128}
            required
          />

          {mode === 'register' && (
            <p className="field-hint">
              Не менее 12 символов, с буквой и цифрой.
            </p>
          )}

          {mode === 'register' && (
            <>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
                />
                Мне уже есть 18 лет
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                />
                <span>
                  Принимаю{' '}
                  <a href="/terms" target="_blank" rel="noreferrer">
                    условия сервиса
                  </a>
                </span>
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                />
                <span>
                  Согласен с{' '}
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    политикой конфиденциальности
                  </a>
                </span>
              </label>
            </>
          )}

          <button
            className="primary-action"
            type="submit"
            disabled={
              loading ||
              !email.trim() ||
              !password ||
              (mode === 'register' &&
                (!canRegister ||
                  !ageConfirmed ||
                  !termsAccepted ||
                  !privacyAccepted))
            }
          >
            {loading
              ? mode === 'login'
                ? 'Входим…'
                : 'Создаём аккаунт…'
              : mode === 'login'
                ? 'Войти'
                : 'Создать аккаунт'}
          </button>
        </form>

        {mode === 'login' && (
          <a className="text-action login-link" href="/forgot-password">
            Забыли пароль?
          </a>
        )}

        <button type="button" className="text-action" onClick={switchMode}>
          {mode === 'login' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}
        </button>
        {mode === 'register' && !canRegister && (
          <p className="login-error" role="alert">
            Регистрация временно недоступна: версии документов не настроены.
          </p>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function buildRegistrationPayload(input: {
  email: string;
  password: string;
  termsVersion: string | undefined;
  privacyVersion: string | undefined;
}): RegistrationRequestDto | undefined {
  if (!input.termsVersion || !input.privacyVersion) return undefined;
  return {
    email: input.email,
    password: input.password,
    ageConfirmed: true,
    consents: [
      {
        consentType: 'terms',
        documentVersion: input.termsVersion,
        accepted: true,
      },
      {
        consentType: 'privacy',
        documentVersion: input.privacyVersion,
        accepted: true,
      },
    ],
  };
}
