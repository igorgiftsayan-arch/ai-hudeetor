type MobileNavigationProps = {
  active: 'today' | 'ai';
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
    </nav>
  );
}
