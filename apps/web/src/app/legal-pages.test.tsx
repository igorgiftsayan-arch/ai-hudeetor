import { render, screen } from '@testing-library/react';
import PrivacyPage from './privacy/page';
import TermsPage from './terms/page';

describe('legal pages', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the configured terms version and current AI access boundary', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'draft-terms-v1');

    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: 'Условия использования сервиса' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Версия: draft-terms-v1')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Подтверждение email и восстановление доступа',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/grok-4-5/i)).toBeInTheDocument();
    expect(screen.getByText(/24 часа/i)).toBeInTheDocument();
    expect(screen.getByText(/30 минут/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'help@rebody38.ru' }),
    ).toHaveAttribute('href', 'mailto:help@rebody38.ru');
    expect(
      screen.getByRole('link', { name: 'levnaohote@yandex.ru' }),
    ).toHaveAttribute('href', 'mailto:levnaohote@yandex.ru');
  });

  it('shows the configured privacy version and external AI disclosure', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'draft-privacy-v1');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'Политика конфиденциальности' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Версия: draft-privacy-v1')).toBeInTheDocument();
    expect(screen.getByText(/GenAPI.*grok-4-5/i)).toBeInTheDocument();
    expect(screen.getByText(/до пяти подтверждённых/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'оферте GenAPI' }),
    ).toHaveAttribute('href', 'https://gen-api.ru/ru/documents');
    expect(
      screen.getByRole('link', { name: 'levnaohote@yandex.ru' }),
    ).toHaveAttribute('href', 'mailto:levnaohote@yandex.ru');
  });

  it('discloses the limited marathon and food-processing boundaries', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'draft-privacy-v1');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: 'Герби-Марафон' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/разрешённое displayName и дневные производные/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Фото еды и внешний AI' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/оригинальные байты выбранного изображения/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/явно подтвердит.*съеденным/i),
    ).toBeInTheDocument();
  });

  it('states the five-minute token-return boundary without calling it medical advice', () => {
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'draft-terms-v1');

    render(<TermsPage />);

    expect(screen.getByText(/пяти минут.*вернёт полный резерв/i)).toBeInTheDocument();
    expect(screen.getByText(/не является медицинской консультацией/i)).toBeInTheDocument();
  });
});
