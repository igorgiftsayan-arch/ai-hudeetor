type MobileNavigationProps = {
  active: 'today' | 'ai' | 'marathon';
};

export function MobileNavigation({ active }: MobileNavigationProps) {
  return (
    <nav className="mobile-navigation" aria-label="Основная навигация">
      <a
        href="/today"
        className={active === 'today' ? 'is-active' : undefined}
        aria-current={active === 'today' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ○
        </span>
        Сегодня
      </a>
      <a
        href="/quick-reply"
        className={active === 'ai' ? 'is-active' : undefined}
        aria-current={active === 'ai' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">
          ✦
        </span>
        AI
      </a>
      <a
        href="/marathon"
        className={active === 'marathon' ? 'is-active' : undefined}
        aria-current={active === 'marathon' ? 'page' : undefined}
      >
        <span aria-hidden="true" className="nav-mark">↗</span>
        Марафон
      </a>
    </nav>
  );
}
