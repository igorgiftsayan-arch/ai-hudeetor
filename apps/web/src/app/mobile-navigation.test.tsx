import { render, screen, within } from '@testing-library/react';
import { MobileNavigation } from './mobile-navigation';

describe('mobile navigation', () => {
  it('keeps five labelled links in vertically separated navigation items', () => {
    render(<MobileNavigation active="marathon" />);

    const navigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(navigation).toHaveClass('mobile-navigation--five-items');

    const links = [
      ['/today', 'Сегодня'],
      ['/quick-reply', 'AI'],
      ['/food', 'Еда'],
      ['/marathon', 'Марафон'],
      ['/notifications', 'Напоминания'],
    ] as const;

    expect(within(navigation).getAllByRole('link')).toHaveLength(5);
    for (const [href, label] of links) {
      const link = within(navigation).getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', href);
      expect(within(link).getByText(label)).toHaveClass('nav-label');
    }

    expect(within(navigation).getByRole('link', { name: 'Марафон' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
