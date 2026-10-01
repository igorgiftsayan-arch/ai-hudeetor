'use client';

import { useState } from 'react';
import { ApiError, apiRequest } from '../../shared/api';
import type {
  AcceptAiProviderConsentRequestDto,
  AiProviderConsentResourceDto,
} from '@atlas/api-contracts';

export type ProviderConsent = AiProviderConsentResourceDto;

export function loadProviderConsent() {
  return apiRequest<ProviderConsent>('/users/me/ai-provider-consent');
}

export function ProviderConsentNotice({
  consent,
  csrfToken,
  disclosure,
  onAccepted,
  onSessionExpired,
}: {
  consent: ProviderConsent;
  csrfToken: string;
  disclosure?: string;
  onAccepted: () => Promise<void> | void;
  onSessionExpired: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (consent.accepted) return null;

  async function accept() {
    setSaving(true);
    setError(undefined);
    try {
      const payload: AcceptAiProviderConsentRequestDto = {
        accepted: true,
        documentVersion: consent.currentVersion,
      };
      await apiRequest<AiProviderConsentResourceDto>(
        '/users/me/ai-provider-consent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify(payload),
        },
      );
      await onAccepted();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session')
        onSessionExpired();
      else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Не удалось сохранить согласие.',
        );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="marathon-consent-card">
      <p className="marathon-kicker">Перед внешним AI</p>
      <p>{disclosure ?? consent.disclosure}</p>
      <button type="button" onClick={() => void accept()} disabled={saving}>
        {saving ? 'Сохраняем…' : 'Разрешить обработку'}
      </button>
      {error && (
        <p className="marathon-task-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void accept()}>
            Повторить
          </button>
        </p>
      )}
    </section>
  );
}
