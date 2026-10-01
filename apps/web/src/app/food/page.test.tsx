import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
            foodProviderMode: 'fake',
            foodExternalProviderEnabled: false,
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
  it('shows real food consent with fake chat and only enables explicit start after accepting', async () => {
    let accepted = false;
    let releaseRefresh!: () => void;
    const refreshPending = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:food'),
      revokeObjectURL: vi.fn(),
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me`) return json({ userId: 'user-1' });
        if (url === `${api}/users/me/onboarding`) {
          if (accepted) await refreshPending;
          return json({
            status: 'completed',
            csrfToken: 'csrf',
            profile: { timezone: 'UTC' },
          });
        }
        if (url === `${api}/ai-action-prices/food-photo-analysis`)
          return json({
            actionType: 'foodPhotoAnalysis',
            tokenPrice: 3,
            priceVersion: 1,
          });
        if (url === `${api}/food-consumptions`) return json({ items: [] });
        if (url === `${api}/users/me/ai-provider-consent`) {
          if (init?.method === 'PUT') {
            expect(JSON.parse(String(init.body))).toEqual({
              accepted: true,
              documentVersion: 'food-v1',
            });
            accepted = true;
          }
          return json({
            providerMode: 'fake',
            externalProviderEnabled: false,
            foodProviderMode: 'genapi',
            foodExternalProviderEnabled: true,
            documentVersion: 'food-v1',
            disclosure: 'External processing',
            accepted,
            acceptedAt: accepted ? '2026-09-25T00:00:00Z' : null,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<FoodPage />);
    await screen.findByRole('heading', { name: 'Фото блюда' });
    fireEvent.change(screen.getByLabelText('Выбрать фото блюда'), {
      target: {
        files: [new File(['photo'], 'food.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.click(screen.getByText('Продолжить'));
    expect(screen.getByText('Начать анализ')).toBeDisabled();
    expect(
      screen.getByText(
        'Фото блюда и необходимый контекст будут переданы внешнему сервису GenAPI для разбора.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('AI сейчас работает в тестовом режиме.'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Разрешить обработку'));
    await waitFor(() => expect(accepted).toBe(true));
    expect(screen.getByText('Начать анализ')).toBeDisabled();
    expect(screen.getByText('food.jpg')).toBeInTheDocument();
    await act(async () => releaseRefresh());
    await waitFor(() =>
      expect(screen.getByText('Начать анализ')).not.toBeDisabled(),
    );
    expect(screen.getByText('food.jpg')).toBeInTheDocument();
    expect(screen.getByAltText('Предпросмотр выбранного фото')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        /food-images|\/food-analyses/.test(String(url)),
      ),
    ).toBe(false);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
