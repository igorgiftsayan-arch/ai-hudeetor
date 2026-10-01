import { afterEach, expect, it, vi } from 'vitest';
import { detachDevice, savePushSubscription } from './push-api';
afterEach(() => vi.unstubAllGlobals());
it('revokes only the supplied device endpoint through an authenticated mutation', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  await detachDevice('csrf', 'https://push.example/this-device');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/notification-preferences/push/subscription-revocations',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }),
      body: JSON.stringify({ endpoint: 'https://push.example/this-device' }),
    }),
  );
});
it('does not send a malformed browser subscription', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect(() =>
    savePushSubscription(
      'csrf',
      { toJSON: () => ({ keys: {} }) } as PushSubscription,
      'iosPwa',
    ),
  ).toThrow('ключи');
  expect(fetchMock).not.toHaveBeenCalled();
});
