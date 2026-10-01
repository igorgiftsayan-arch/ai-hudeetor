import { render, screen } from '@testing-library/react';
import TermsPage from './page';

describe('terms page', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('describes the current email and external-AI boundaries', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'terms-2026-10-01-v2');

    render(<TermsPage />);

    expect(screen.getByText('Версия: terms-2026-10-01-v2')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Подтверждение email и восстановление доступа' }),
    ).toBeVisible();
    expect(screen.getByText(/24 часа/i)).toBeVisible();
    expect(screen.getByText(/30 минут/i)).toBeVisible();
    expect(screen.getByText(/без подтверждённого email/i)).toBeVisible();
    expect(screen.getByText(/GenAPI/i)).toBeVisible();
    expect(screen.queryByText(/тестовые ответы/i)).not.toBeInTheDocument();
  });
});
