import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FoodPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('food screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    sessionStorage.clear();
  });
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
        if (url === `${api}/users/me`) return json({ userId: 'user-1' });
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
  it('removes a deleted consumption after refreshing confirmed history', async () => {
    sessionStorage.clear();
    let deleted = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me`) return json({ userId: 'user-1' });
        if (url === `${api}/users/me/onboarding`)
          return json({
            status: 'completed',
            csrfToken: 'csrf-token',
            profile: { timezone: 'UTC' },
          });
        if (url === `${api}/users/me/ai-provider-consent`)
          return json({ providerMode: 'fake' });
        if (url === `${api}/ai-action-prices/food-photo-analysis`)
          return json({
            actionType: 'foodPhotoAnalysis',
            tokenPrice: 3,
            priceVersion: 2,
          });
        if (
          url === `${api}/food-consumptions/meal-1` &&
          init?.method === 'DELETE'
        ) {
          deleted = true;
          return new Response(null, { status: 204 });
        }
        if (url === `${api}/food-consumptions`)
          return json({
            items: deleted
              ? []
              : [
                  {
                    id: 'meal-1',
                    foodAnalysisId: 'analysis-1',
                    consumedAt: '2026-09-24T02:30:00Z',
                    localDate: '2026-09-24',
                    timezone: 'UTC',
                    confirmedResult: { items: [{ name: 'гречка' }] },
                  },
                ],
          });
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<FoodPage />);
    await screen.findByText('гречка');
    fireEvent.click(screen.getByText('Удалить запись'));
    await screen.findByText('Запись удалена.');
    expect(screen.queryByText('гречка')).not.toBeInTheDocument();
    expect(
      screen.getByText('Здесь появится только подтверждённая еда.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
      ).toHaveLength(1),
    );
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
