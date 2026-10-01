'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiRequest } from '../../shared/api';
import { PushPermissionCard } from '../../features/notifications/push-permission-card';
import {
  applicationServerKey,
  pushCapability,
  pushPlatform,
  pushRegistration,
} from '../../features/notifications/push-browser';
import {
  loadPushPreferences,
  isDeviceConnected,
  detachDevice,
  savePushPreferences,
  savePushSubscription,
} from '../../features/notifications/push-api';
import { MobileNavigation } from '../mobile-navigation';

export default function NotificationsPage() {
  const { replace } = useRouter();
  const [capability, setCapability] =
    useState<ReturnType<typeof pushCapability>>('unsupported');
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [csrfToken, setCsrfToken] = useState('');
  const [publicKey, setPublicKey] = useState<string>();
  const [enabled, setEnabled] = useState(false);
  const [localTime, setLocalTime] = useState('09:00');
  const [timezone, setTimezone] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.kind === 'session') {
      replace('/login');
      return;
    }
    setError(
      cause instanceof Error
        ? cause.message
        : 'Не удалось настроить уведомления. Попробуйте снова.',
    );
  }

  useEffect(() => {
    setCapability(pushCapability());
    const refresh = () =>
      setPermission(
        'Notification' in window ? Notification.permission : 'default',
      );
    refresh();
    window.addEventListener('focus', refresh);
    void (async () => {
      try {
        const onboarding = await apiRequest<{
          csrfToken: string;
          status: string;
        }>('/users/me/onboarding');
        if (onboarding.status !== 'completed') {
          replace('/onboarding');
          return;
        }
        setCsrfToken(onboarding.csrfToken);
        const prefs = await loadPushPreferences();
        setEnabled(prefs.enabled);
        setLocalTime(prefs.localTime ?? '09:00');
        setTimezone(
          prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        // Runtime public configuration and device state are loaded separately from account preferences.
        setPublicKey(
          prefs.available ? (prefs.vapidPublicKey ?? undefined) : undefined,
        );
        if (pushCapability() === 'supported') {
          const registration =
            await navigator.serviceWorker.getRegistration('/');
          const subscription =
            await registration?.pushManager.getSubscription();
          if (subscription)
            setConnected(
              await isDeviceConnected(
                onboarding.csrfToken,
                subscription.endpoint,
              ),
            );
        }
        setLoaded(true);
      } catch (cause) {
        fail(cause);
      }
    })();
    return () => window.removeEventListener('focus', refresh);
    // Router and startup state are stable for this page's lifetime.
  }, []);

  async function connect() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      // Must happen synchronously inside the user's click before any network await (iOS).
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted' || !publicKey) return;
      const registration = await pushRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        }));
      await savePushSubscription(csrfToken, subscription, pushPlatform());
      setConnected(true);
      setMessage(
        'Устройство подключено. Выберите время и сохраните расписание.',
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await detachDevice(csrfToken, subscription.endpoint);
        if (!(await subscription.unsubscribe()))
          throw new Error(
            'Подписка на сервере отключена. Повторите отключение в браузере.',
          );
      }
      setConnected(false);
      setMessage('Уведомления на этом устройстве отключены.');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await savePushPreferences(csrfToken, { enabled, localTime, timezone });
      setMessage(
        enabled
          ? 'Расписание сохранено.'
          : 'Напоминания отключены на всех ваших устройствах.',
      );
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <p className="section-label">Ваш дневник</p>
      <h1>Напоминания</h1>
      {capability === 'insecure' ? (
        <p>
          Для уведомлений откройте приложение по HTTPS с действующим
          сертификатом. На текущем HTTP-адресе подключить телефон нельзя.
        </p>
      ) : (
        <PushPermissionCard
          capability={capability}
          permission={permission}
          isRequesting={busy || !loaded}
          requestUnavailable={loaded && !publicKey}
          onRequestPermission={() => void connect()}
        />
      )}
      {loaded && !publicKey && (
        <p>Отправка уведомлений пока не настроена. Попробуйте позже.</p>
      )}
      {capability === 'supported' &&
        (permission === 'granted' || connected) && (
          <>
            <p>
              {connected
                ? 'Это устройство подключено.'
                : 'Это устройство не подключено к вашему аккаунту.'}
            </p>
            <button
              type="button"
              className="food-primary-action"
              disabled={busy || !loaded || (!connected && !publicKey)}
              onClick={() => void (connected ? disconnect() : connect())}
            >
              {connected
                ? 'Отключить это устройство'
                : 'Подключить это устройство'}
            </button>
          </>
        )}
      {loaded && (
        <form onSubmit={(event) => void save(event)} className="login-form">
          <label>
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(event) => setEnabled(event.target.checked)}
            />{' '}
            Ежедневные напоминания
          </label>
          <p>
            Расписание действует для всех подключённых устройств аккаунта.
            Разрешение браузера проверяется отдельно на каждом устройстве.
          </p>
          <label htmlFor="reminder-time">Местное время</label>
          <input
            id="reminder-time"
            type="time"
            value={localTime}
            required={enabled}
            onChange={(event) => setLocalTime(event.target.value)}
          />
          <label htmlFor="reminder-timezone">Часовой пояс</label>
          <input
            id="reminder-timezone"
            value={timezone}
            placeholder="Europe/Moscow"
            required={enabled}
            onChange={(event) => setTimezone(event.target.value)}
          />
          <button
            type="submit"
            className="food-primary-action"
            disabled={
              busy || (enabled && (!connected || permission !== 'granted'))
            }
          >
            Сохранить расписание
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <a href="/today">Вернуться к дневнику</a>
      <MobileNavigation active="notifications" />
    </main>
  );
}
