'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiRequest } from '../../shared/api';

export function LogoutButton({ csrfToken }: { csrfToken: string }) {
  const { replace } = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function logout() {
    if (!csrfToken) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiRequest<void>('/sessions/current', {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      replace('/login');
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') {
        replace('/login');
      } else {
        setError('Не удалось выйти. Попробуйте снова.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logout-control">
      <button
        type="button"
        className="logout-action"
        onClick={() => void logout()}
        disabled={busy}
      >
        {busy ? 'Выходим…' : 'Выйти'}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
