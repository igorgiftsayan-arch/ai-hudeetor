import type { PushCapability } from './push-permission-card';

export function pushCapability(): PushCapability | 'insecure' {
  if (!window.isSecureContext) return 'insecure';
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return 'installRequired';
  return 'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
    ? 'supported'
    : 'unsupported';
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function pushRegistration() {
  // register() rejects on invalid TLS certificates; never wait indefinitely for ready.
  const registration = await navigator.serviceWorker.register('/sw.js');
  if (registration.active) return registration;
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Не удалось подготовить уведомления. Обновите страницу и попробуйте снова.',
            ),
          ),
        10000,
      ),
    ),
  ]);
  return registration;
}

export function pushPlatform() {
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
    return 'iosPwa';
  return /Android/.test(navigator.userAgent) ? 'androidPwa' : 'desktopPwa';
}

/** A browser subscription must not survive account replacement, including expired sessions. */
export async function clearPushBeforeLogin() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription && !(await subscription.unsubscribe())) {
    throw new Error(
      'Не удалось отключить уведомления предыдущего аккаунта на этом устройстве. Повторите вход.',
    );
  }
  const notifications = await registration?.getNotifications?.();
  notifications?.forEach((notification) => notification.close());
}
