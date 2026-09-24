// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  type WorkerEvent = { waitUntil: (value: Promise<void>) => void };
  const handlers: Record<string, (event: WorkerEvent) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue(undefined);
  const focus = vi.fn().mockResolvedValue(undefined);
  const seen = new Set<string>();
  const code = readFileSync(
    new URL('../../../public/sw.js', import.meta.url),
    'utf8',
  );
  runInNewContext(
    code +
      '\nreceiveOnce = async (id) => { if (seen.has(id)) return false; seen.add(id); return true; };',
    {
      self: {
        addEventListener: (
          name: string,
          handler: (event: WorkerEvent) => void,
        ) => {
          handlers[name] = handler;
        },
        location: { origin: 'https://app.example' },
        skipWaiting: vi.fn(),
        registration: { showNotification },
        clients: {
          matchAll: vi
            .fn()
            .mockResolvedValue([
              { url: 'https://app.example/today', navigate, focus },
            ]),
        },
      },
      URL,
      seen,
    },
  );
  async function dispatch(name: string, input: Record<string, unknown>) {
    let pending: Promise<void> | undefined;
    handlers[name]!({
      ...input,
      waitUntil: (value: Promise<void>) => {
        pending = value;
      },
    });
    await pending;
  }
  return { dispatch, showNotification, navigate, focus };
}
describe('push service worker', () => {
  it('deduplicates delivery IDs and replaces private payload text with generic reminder', async () => {
    const w = worker();
    const input = {
      data: {
        json: () => ({
          deliveryId: 'delivery-1',
          body: 'private weight',
          url: 'https://evil.example',
        }),
      },
    };
    await w.dispatch('push', input);
    await w.dispatch('push', input);
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    expect(w.showNotification.mock.calls[0]?.[1]).toMatchObject({
      body: 'Пора ненадолго заглянуть в приложение.',
      tag: 'atlas-reminder-delivery-1',
      data: { url: '/marathon' },
    });
  });
  it('ignores malformed messages', async () => {
    const w = worker();
    await w.dispatch('push', {
      data: {
        json: () => {
          throw new Error();
        },
      },
    });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it('opens the allowed app route in an existing window', async () => {
    const w = worker();
    const close = vi.fn();
    await w.dispatch('notificationclick', {
      notification: { close, data: { url: '/marathon' } },
    });
    expect(close).toHaveBeenCalled();
    expect(w.navigate).toHaveBeenCalledWith('https://app.example/marathon');
    expect(w.focus).toHaveBeenCalled();
  });
});
