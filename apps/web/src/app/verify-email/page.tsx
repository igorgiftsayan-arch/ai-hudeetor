'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiRequest } from '../../shared/api';

type OnboardingContext = { status: string; csrfToken: string };

export default function VerifyEmailPage() {
  const { replace } = useRouter();
  const [token, setToken] = useState('');
  const [onboarding, setOnboarding] = useState<OnboardingContext>();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [nextRoute, setNextRoute] = useState('/login');

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    setToken(value?.trim() ?? '');
    setNextRoute(readSafeNextRoute());
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
    void loadOnboarding();
  }, []);

  async function loadOnboarding(): Promise<OnboardingContext | undefined> {
    try {
      const context = await apiRequest<OnboardingContext>(
        '/users/me/onboarding',
      );
      setOnboarding(context);
      return context;
    } catch {
      return undefined;
    }
  }

  async function resend() {
    if (!onboarding?.csrfToken) {
      replace('/login');
      return;
    }
    setSending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await apiRequest<{ accepted: true }>('/email-verification-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': onboarding.csrfToken,
        },
      });
      setNotice('Если адрес доступен, письмо уже отправлено.');
    } catch (cause) {
      setError(readResendError(cause));
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (!token) return;
    setVerifying(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await apiRequest<{ emailVerified: true }>('/email-verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const current = await apiRequest<{
        emailVerified: boolean;
        onboardingStatus: string;
      }>('/users/me');
      if (!current.emailVerified) {
        setError('Не удалось обновить статус email. Попробуйте войти ещё раз.');
        return;
      }
      replace(
        nextRoute === '/login'
          ? current.onboardingStatus === 'completed'
            ? '/today'
            : '/onboarding'
          : nextRoute,
      );
    } catch (cause) {
      setError(readVerificationError(cause));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-panel" aria-labelledby="verify-email-title">
        <p className="section-label">Безопасность аккаунта</p>
        <h1 id="verify-email-title">Подтвердите email</h1>
        <p className="login-intro">
          Мы используем email, чтобы вы могли безопасно вернуться к своему
          дневнику и восстановить доступ.
        </p>
        {token ? (
          <button
            className="primary-action"
            type="button"
            onClick={() => void verify()}
            disabled={verifying}
          >
            {verifying ? 'Подтверждаем…' : 'Подтвердить email'}
          </button>
        ) : (
          <>
            <p className="field-hint">
              Откройте ссылку из письма в этом браузере. Если письма нет,
              отправьте его ещё раз.
            </p>
            <button
              className="primary-action"
              type="button"
              onClick={() => void resend()}
              disabled={sending || !onboarding}
            >
              {sending ? 'Отправляем…' : 'Отправить письмо ещё раз'}
            </button>
          </>
        )}
        {notice && (
          <p className="login-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {nextRoute !== '/login' && (
          <button
            type="button"
            className="text-action login-link"
            onClick={() => replace(nextRoute)}
          >
            Продолжить без AI
          </button>
        )}
        <a className="text-action login-link" href="/login">
          Вернуться ко входу
        </a>
      </section>
    </main>
  );
}

function readSafeNextRoute(): '/today' | '/onboarding' | '/login' {
  const next = new URLSearchParams(window.location.search).get('next');
  return next === '/today' || next === '/onboarding' ? next : '/login';
}

function readVerificationError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'EMAIL_VERIFICATION_TOKEN_INVALID')
      return 'Ссылка недействительна или устарела. Запросите новое письмо.';
    if (cause.code === 'RATE_LIMITED')
      return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (cause.kind === 'network')
      return 'Не удалось подтвердить email. Проверьте связь и попробуйте снова.';
  }
  return 'Не удалось подтвердить email. Попробуйте снова.';
}

function readResendError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'RATE_LIMITED')
    return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (cause instanceof ApiError && cause.kind === 'network')
    return 'Не удалось отправить письмо. Проверьте связь и попробуйте снова.';
  return 'Не удалось отправить письмо. Попробуйте снова.';
}
