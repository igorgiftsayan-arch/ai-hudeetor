import { render, screen } from '@testing-library/react';
import PrivacyPage from './page';

describe('privacy page', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('discloses the actual external-AI recipient and bounded context', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'privacy-2026-10-01-v2');

    render(<PrivacyPage />);

    expect(screen.getByText('Версия: privacy-2026-10-01-v2')).toBeVisible();
    expect(screen.getByText(/GenAPI.*grok-4-5/i)).toBeVisible();
    expect(screen.getByText(/до пяти подтверждённых/i)).toBeVisible();
    expect(
      screen.getByText(/историю текущего диалога, часовой пояс/i),
    ).toBeVisible();
    expect(screen.getByText(/не более 24 часов/i)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'оферте GenAPI' }),
    ).toHaveAttribute('href', 'https://gen-api.ru/ru/documents');
    expect(screen.getByText(/после подтверждения email/i)).toBeVisible();
    expect(screen.queryByText(/тестовые ответы/i)).not.toBeInTheDocument();
  });
});
