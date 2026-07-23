'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiRequest } from '../../shared/api';

type SessionResource = {
  userId: string;
  expiresAt: string;
  onboardingStatus: string;
  csrfToken: string;
};

type OnboardingResource = { status: string };

export default function LoginPage() {
  const { replace } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      await apiRequest<SessionResource>(
        '/sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        },
        { unauthorizedKind: 'request' },
      );
      const onboarding = await apiRequest<OnboardingResource>(
        '/users/me/onboarding',
      );
      replace(onboarding.status === 'completed' ? '/today' : '/onboarding');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'AUTHENTICATION_FAILED') {
        setError('Неверный email или пароль.');
      } else {
        setError(
          cause instanceof Error
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
        <h1 id="login-title">С возвращением</h1>
        <p className="login-intro">
          Войдите, чтобы спокойно продолжить с сегодняшней записи.
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
            autoComplete="current-password"
            required
          />

          <button
            className="primary-action"
            type="submit"
            disabled={loading || !email.trim() || !password}
          >
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
