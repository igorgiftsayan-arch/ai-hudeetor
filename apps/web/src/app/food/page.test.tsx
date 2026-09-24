import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FoodPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('food screen', () => {
  beforeEach(() => replaceMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('shows the managed analysis price and only confirmed meal history', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:meal-preview'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`)
          return json({
            status: 'completed',
            csrfToken: 'csrf-token',
            profile: { timezone: 'Asia/Irkutsk' },
          });
        if (url === `${api}/ai-action-prices/food-photo-analysis`)
          return json({
            actionType: 'foodPhotoAnalysis',
            tokenPrice: 3,
            priceVersion: 2,
          });
        if (url === `${api}/food-consumptions`)
          return json({
            items: [
              {
                id: 'consumption-1',
                foodAnalysisId: 'analysis-1',
                consumedAt: '2026-09-24T02:30:00.000Z',
                localDate: '2026-09-24',
                timezone: 'Asia/Irkutsk',
                confirmedResult: { items: [{ name: 'гречка' }] },
              },
            ],
          });
        if (url === `${api}/users/me/ai-provider-consent`)
          return json({
            providerMode: 'fake',
            externalProviderEnabled: false,
            accepted: false,
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FoodPage />);

    expect(
      await screen.findByRole('heading', { name: 'Фото блюда' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Выбрать фото блюда'), {
      target: {
        files: [new File(['photo'], 'lunch.jpg', { type: 'image/jpeg' })],
      },
    });
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByText(/Стоимость: 3 токена/)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Подтверждённые записи питания'),
    ).toHaveTextContent('гречка');
    expect(
      screen.getByText('Проверьте фото перед анализом'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Еда' })).toHaveAttribute(
      'href',
      '/food',
    );
    expect(screen.getByRole('link', { name: 'Еда' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
