type MobileNavigationProps = {
  active: 'today' | 'ai' | 'food' | 'marathon' | 'notifications';
};

export function MobileNavigation({ active }: MobileNavigationProps) {
  return (
    <nav
      className="mobile-navigation mobile-navigation--five-items"
      aria-label="Основная навигация"
    >
      <a
        href="/today"
        className={active === 'today' ? 'is-active' : undefined}
        aria-current={active === 'today' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ○
        </span>
        <span className="nav-label">Сегодня</span>
      </a>
      <a
        href="/quick-reply"
        className={active === 'ai' ? 'is-active' : undefined}
        aria-current={active === 'ai' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ✦
        </span>
        <span className="nav-label">AI</span>
      </a>
      <a
        href="/food"
        className={active === 'food' ? 'is-active' : undefined}
        aria-current={active === 'food' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ◌
        </span>
        <span className="nav-label">Еда</span>
      </a>
      <a
        href="/marathon"
        className={active === 'marathon' ? 'is-active' : undefined}
        aria-current={active === 'marathon' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ↗
        </span>
        <span className="nav-label">Марафон</span>
      </a>
      <a
        href="/notifications"
        className={active === 'notifications' ? 'is-active' : undefined}
        aria-current={active === 'notifications' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ◔
        </span>
        <span className="nav-label">Напоминания</span>
      </a>
    </nav>
  );
}
