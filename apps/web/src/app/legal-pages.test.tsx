import { render, screen } from '@testing-library/react';
import PrivacyPage from './privacy/page';
import TermsPage from './terms/page';

describe('legal draft pages', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the configured terms version and does not promise unavailable features', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'draft-terms-v1');

    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: 'Условия использования сервиса' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Версия: draft-terms-v1')).toBeInTheDocument();
    expect(screen.getByText(/не обещает функции/i)).toBeInTheDocument();
    expect(screen.getByText(/не опубликован/i)).toBeInTheDocument();
  });

  it('shows the configured privacy version and keeps external AI facts unresolved', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'draft-privacy-v1');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'Политика конфиденциальности' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Версия: draft-privacy-v1')).toBeInTheDocument();
    expect(screen.getByText(/пока не подтверждены/i)).toBeInTheDocument();
    expect(screen.getByText(/не реализованы/i)).toBeInTheDocument();
  });
});
