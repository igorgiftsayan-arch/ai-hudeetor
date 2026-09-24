import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationsPage from './page';
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  capability: vi.fn(),
  prefs: vi.fn(),
  connected: vi.fn(),
  detach: vi.fn(),
  save: vi.fn(),
  subscribe: vi.fn(),
  register: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('../../features/notifications/push-browser', () => ({
  pushCapability: mocks.capability,
  applicationServerKey: () => new Uint8Array([1]),
  pushPlatform: () => 'iosPwa',
  pushRegistration: mocks.register,
}));
vi.mock('../../features/notifications/push-api', () => ({
  loadPushPreferences: mocks.prefs,
  isDeviceConnected: mocks.connected,
  detachDevice: mocks.detach,
  savePushPreferences: mocks.save,
  savePushSubscription: mocks.subscribe,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capability.mockReturnValue('supported');
  mocks.prefs.mockResolvedValue({
    available: true,
    vapidPublicKey: 'a-key',
    enabled: true,
    localTime: '09:00',
    timezone: 'Europe/Moscow',
    subscriptionState: 'active',
    activeSubscriptionCount: 3,
  });
  mocks.connected.mockResolvedValue(false);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'completed', csrfToken: 'csrf' }),
        ),
      ),
  );
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
  });
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('notifications page', () => {
  it('shows settled unavailable state without pretending a permission request is running', async () => {
    mocks.prefs.mockResolvedValue({ available: false, vapidPublicKey: null, enabled: false, localTime: '09:00', timezone: 'Asia/Irkutsk' });
    const user = userEvent.setup();
    render(<NotificationsPage />);
    await screen.findByText('Отправка уведомлений пока не настроена. Попробуйте позже.');
    expect(screen.queryByText('Запрашиваем…')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Уведомления недоступны' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it('does not treat other account devices as browser permission and never prompts on load', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn(),
    });
    render(<NotificationsPage />);
    await screen.findByLabelText('Местное время');
    expect(
      screen.getByText('Уведомления отключены в настройках браузера.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Подключить это устройство' }),
    ).not.toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Сохранить расписание' }),
    ).toBeDisabled();
  });
  it('supports disabling account reminders even on an unsupported browser', async () => {
    mocks.capability.mockReturnValue('unsupported');
    const user = userEvent.setup();
    render(<NotificationsPage />);
    await screen.findByLabelText('Местное время');
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Сохранить расписание' }),
    );
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith('csrf', {
        enabled: false,
        localTime: '09:00',
        timezone: 'Europe/Moscow',
      }),
    );
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
  it('requests permission only on click and registers only this device', async () => {
    const subscription = { endpoint: 'https://push.example/id' };
    mocks.register.mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue(subscription),
      },
    });
    const user = userEvent.setup();
    render(<NotificationsPage />);
    await screen.findByLabelText('Местное время');
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Разрешить уведомления' }),
    );
    await waitFor(() =>
      expect(mocks.subscribe).toHaveBeenCalledWith(
        'csrf',
        subscription,
        'iosPwa',
      ),
    );
    expect(screen.getByText('Это устройство подключено.')).toBeVisible();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('looks up this device without re-subscribing and detaches only it', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example/this-device',
      unsubscribe,
    };
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi
          .fn()
          .mockResolvedValue({
            pushManager: {
              getSubscription: vi.fn().mockResolvedValue(subscription),
            },
          }),
      },
    });
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(),
    });
    mocks.connected.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<NotificationsPage />);
    await screen.findByText('Это устройство подключено.');
    expect(mocks.connected).toHaveBeenCalledWith('csrf', subscription.endpoint);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Отключить это устройство' }),
    );
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(mocks.detach).toHaveBeenCalledWith('csrf', subscription.endpoint);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('explains the HTTP blocker without calling browser permission APIs', async () => {
    mocks.capability.mockReturnValue('insecure');
    render(<NotificationsPage />);
    await screen.findByLabelText('Местное время');
    expect(screen.getByText(/действующим сертификатом/)).toBeVisible();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});
