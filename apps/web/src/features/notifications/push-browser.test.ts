import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationServerKey, pushCapability } from './push-browser';

afterEach(() => vi.unstubAllGlobals());
describe('device capabilities', () => {
  it('requires HTTPS before considering browser APIs', () => {
    vi.stubGlobal('isSecureContext', false);
    expect(pushCapability()).toBe('insecure');
  });
  it('explains iPhone home screen install before asking permission', () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone' });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(pushCapability()).toBe('installRequired');
  });
  it('does not confuse missing browser APIs with permission granted', () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { userAgent: 'desktop', platform: 'Linux' });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(pushCapability()).toBe('unsupported');
  });
  it('decodes URL-safe VAPID key bytes', () => {
    expect([...applicationServerKey('-_8')]).toEqual([251, 255]);
  });
});

describe('account replacement', () => {
  it('unsubscribes before a new account can log in', async () => {
    const { clearPushBeforeLogin } = await import('./push-browser');
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ unsubscribe }),
          },
          getNotifications: vi.fn().mockResolvedValue([{ close }]),
        }),
      },
    });
    await clearPushBeforeLogin();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it('does not silently proceed if old delivery cannot be detached', async () => {
    const { clearPushBeforeLogin } = await import('./push-browser');
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              unsubscribe: vi.fn().mockResolvedValue(false),
            }),
          },
        }),
      },
    });
    await expect(clearPushBeforeLogin()).rejects.toThrow(
      'предыдущего аккаунта',
    );
  });
});
