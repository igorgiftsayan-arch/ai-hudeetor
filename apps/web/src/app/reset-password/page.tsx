'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  PasswordResetResourceDto,
  ResetPasswordRequestDto,
} from '@atlas/api-contracts';
import { ApiError, apiRequest } from '../../shared/api';

export default function ResetPasswordPage() {
  const { replace } = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    setToken(value?.trim() ?? '');
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(undefined);
    try {
      const payload: ResetPasswordRequestDto = { token, newPassword: password };
      await apiRequest<PasswordResetResourceDto>('/password-resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      replace('/login');
    } catch (cause) {
      setError(readResetError(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-panel" aria-labelledby="reset-password-title">
        <p className="section-label">Восстановление доступа</p>
        <h1 id="reset-password-title">Новый пароль</h1>
        {token ? (
          <form className="login-form" onSubmit={submit}>
            <label htmlFor="new-password">Новый пароль</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <p className="field-hint">
              Не менее 12 символов, с буквой и цифрой.
            </p>
            <button
              className="primary-action"
              type="submit"
              disabled={loading || !password}
            >
              {loading ? 'Сохраняем…' : 'Сохранить новый пароль'}
            </button>
          </form>
        ) : (
          <p className="login-intro">
            Ссылка недействительна или устарела. Запросите новую ссылку для
            смены пароля.
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <a
          className="text-action login-link"
          href={token ? '/login' : '/forgot-password'}
        >
          {token ? 'Вернуться ко входу' : 'Запросить новую ссылку'}
        </a>
      </section>
    </main>
  );
}

function readResetError(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === 'PASSWORD_RESET_TOKEN_INVALID')
      return 'Ссылка недействительна или устарела. Запросите новую ссылку.';
    if (cause.code === 'RATE_LIMITED')
      return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (cause.kind === 'network')
      return 'Не удалось изменить пароль. Проверьте связь и попробуйте снова.';
  }
  return 'Не удалось изменить пароль. Попробуйте снова.';
}
