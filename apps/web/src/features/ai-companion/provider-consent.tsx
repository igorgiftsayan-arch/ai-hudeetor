'use client';

import { useRef, useState } from 'react';
import { ApiError, apiRequest, mutationHeaders, newIdempotencyKey } from '../../shared/api';
import type { ProviderConsentMetadataDto } from '@atlas/api-contracts';

export type ProviderConsent = ProviderConsentMetadataDto;

const genapiDisclosure =
  'Сообщения и необходимый контекст будут переданы внешнему сервису GenAPI для формирования ответа.';

export function loadProviderConsent() {
  return apiRequest<ProviderConsent>('/users/me/ai-provider-consent');
}

export function ProviderConsentNotice({
  consent,
  csrfToken,
  onAccepted,
  onSessionExpired,
}: {
  consent: ProviderConsent;
  csrfToken: string;
  onAccepted: () => Promise<void> | void;
  onSessionExpired: () => void;
}) {
  const pendingKey = useRef<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (consent.providerMode === 'fake' || !consent.externalProviderEnabled) {
    return <p className="marathon-consent-notice">AI сейчас работает в тестовом режиме.</p>;
  }
  if (consent.accepted) return null;

  async function accept() {
    const idempotencyKey = pendingKey.current ?? newIdempotencyKey();
    pendingKey.current = idempotencyKey;
    setSaving(true);
    setError(undefined);
    try {
      await apiRequest('/users/me/ai-provider-consent', {
        method: 'PUT',
        headers: mutationHeaders(csrfToken, idempotencyKey),
        body: JSON.stringify({ accepted: true, documentVersion: consent.documentVersion }),
      });
      pendingKey.current = undefined;
      await onAccepted();
    } catch (cause) {
      if (cause instanceof ApiError && cause.kind === 'session') onSessionExpired();
      else setError(cause instanceof Error ? cause.message : 'Не удалось сохранить согласие.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="marathon-consent-card">
      <p className="marathon-kicker">Перед внешним AI</p>
      <p>{consent.providerMode === 'genapi' ? genapiDisclosure : consent.disclosure}</p>
      <button type="button" onClick={() => void accept()} disabled={saving}>
        {saving ? 'Сохраняем…' : 'Разрешить обработку'}
      </button>
      {error && <p className="marathon-task-error" role="alert">{error} <button type="button" onClick={() => void accept()}>Повторить</button></p>}
    </section>
  );
}
