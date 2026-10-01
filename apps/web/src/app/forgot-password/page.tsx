'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, apiRequest } from '../../shared/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await apiRequest<{ accepted: true }>('/password-reset-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setNotice(
        'Если такой адрес зарегистрирован, мы отправили ссылку для смены пароля.',
      );
    } catch (cause) {
      setError(readRequestError(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-panel" aria-labelledby="forgot-password-title">
        <p className="section-label">Восстановление доступа</p>
        <h1 id="forgot-password-title">Забыли пароль?</h1>
        <p className="login-intro">
          Укажите email. Если он есть в аккаунте, мы отправим ссылку для смены
          пароля.
        </p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="reset-request-email">Email</label>
          <input
            id="reset-request-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
          <button
            className="primary-action"
            type="submit"
            disabled={loading || !email.trim()}
          >
            {loading ? 'Отправляем…' : 'Отправить ссылку'}
          </button>
        </form>
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
        <a className="text-action login-link" href="/login">
          Вернуться ко входу
        </a>
      </section>
    </main>
  );
}

function readRequestError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === 'RATE_LIMITED')
    return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (cause instanceof ApiError && cause.kind === 'network')
    return 'Не удалось отправить ссылку. Проверьте связь и попробуйте снова.';
  return 'Не удалось отправить ссылку. Попробуйте снова.';
}
