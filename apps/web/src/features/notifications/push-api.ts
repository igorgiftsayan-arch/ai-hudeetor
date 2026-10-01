import type {
  PushPreferenceResourceDto,
  PushSubscriptionLookupResourceDto,
  PushSubscriptionResourceDto,
  SavePushPreferenceDto,
} from '@atlas/api-contracts';
import {
  apiRequest,
  mutationHeaders,
  newIdempotencyKey,
} from '../../shared/api';

export type PushPreferences = PushPreferenceResourceDto;
export const pushPath = '/notification-preferences/push';
export const loadPushPreferences = () => apiRequest<PushPreferences>(pushPath);
export function savePushPreferences(
  csrfToken: string,
  preferences: SavePushPreferenceDto,
) {
  return apiRequest<PushPreferences>(pushPath, {
    method: 'PUT',
    headers: mutationHeaders(csrfToken, newIdempotencyKey()),
    body: JSON.stringify(preferences),
  });
}
export function savePushSubscription(
  csrfToken: string,
  subscription: PushSubscription,
  platform: string,
) {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth)
    throw new Error('Не удалось получить ключи уведомлений этого устройства.');
  return apiRequest<PushSubscriptionResourceDto>(`${pushPath}/subscriptions`, {
    method: 'POST',
    headers: mutationHeaders(csrfToken, newIdempotencyKey()),
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      ...keys,
      platform,
    }),
  });
}

export function detachDevice(csrfToken: string, endpoint: string) {
  return apiRequest<void>(`${pushPath}/subscription-revocations`, {
    method: 'POST',
    headers: mutationHeaders(csrfToken, newIdempotencyKey()),
    body: JSON.stringify({ endpoint }),
  });
}

export async function isDeviceConnected(csrfToken: string, endpoint: string) {
  const result = await apiRequest<PushSubscriptionLookupResourceDto>(
    `${pushPath}/subscription-lookups`,
    {
      method: 'POST',
      headers: mutationHeaders(csrfToken, newIdempotencyKey()),
      body: JSON.stringify({ endpoint }),
    },
  );
  return result.connected;
}
