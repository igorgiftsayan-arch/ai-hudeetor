'use client';

export type PushCapability = 'supported' | 'unsupported' | 'installRequired';
export type PushPermission = 'default' | 'denied' | 'granted';

/**
 * Browser permission is intentionally delegated to an explicit click handler.
 * Subscription and server preferences remain outside this UI boundary.
 */
export function PushPermissionCard({
  capability,
  permission,
  isRequesting = false,
  onRequestPermission,
}: {
  capability: PushCapability;
  permission: PushPermission;
  isRequesting?: boolean;
  onRequestPermission: () => void;
}) {
  if (capability === 'unsupported') {
    return (
      <section
        className="push-permission-card"
        aria-labelledby="push-permission-title"
      >
        <p className="marathon-kicker">Напоминания</p>
        <h2 id="push-permission-title">Уведомления на телефон</h2>
        <p>На этом устройстве уведомления пока недоступны.</p>
      </section>
    );
  }

  if (capability === 'installRequired') {
    return (
      <section
        className="push-permission-card"
        aria-labelledby="push-permission-title"
      >
        <p className="marathon-kicker">Напоминания</p>
        <h2 id="push-permission-title">Уведомления на телефон</h2>
        <p>
          Установите приложение на экран «Домой», чтобы включить уведомления на
          этом устройстве. В Safari нажмите «Поделиться» → «На экран Домой»,
          затем откройте приложение с экрана «Домой».
        </p>
      </section>
    );
  }

  return (
    <section
      className="push-permission-card"
      aria-labelledby="push-permission-title"
    >
      <p className="marathon-kicker">Напоминания</p>
      <h2 id="push-permission-title">Уведомления на телефон</h2>
      {permission === 'granted' && (
        <p>
          Разрешение браузера получено. Подключите это устройство и сохраните
          расписание.
        </p>
      )}
      {permission === 'denied' && (
        <p>Уведомления отключены в настройках браузера.</p>
      )}
      {permission === 'default' && (
        <>
          <p>Разрешение запрашивается только после вашего действия.</p>
          <button
            type="button"
            className="food-primary-action"
            disabled={isRequesting}
            onClick={onRequestPermission}
          >
            {isRequesting ? 'Запрашиваем…' : 'Разрешить уведомления'}
          </button>
        </>
      )}
    </section>
  );
}
