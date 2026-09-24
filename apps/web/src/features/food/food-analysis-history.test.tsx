import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import FoodPage from '../../app/food/page';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
const deletion = {
  analysisId: 'old-1',
  photoStatus: 'available',
  analysisStatus: 'available',
  cancellationStatus: 'notCancelled',
};
const item = (id: string) => ({
  id,
  uploadedImageId: `image-${id}`,
  status: 'analyzed',
  runtimeAdapter: 'fake',
  createdAt: '2026-09-20T10:00:00Z',
  consumptionStatus: 'notConfirmed',
  dishName: `Блюдо ${id}`,
  deletionStatus: { ...deletion, analysisId: id },
});
function baseResponse(url: string) {
  if (url.endsWith('/users/me')) return json({ userId: 'user-1' });
  if (url.endsWith('/users/me/onboarding'))
    return json({
      status: 'completed',
      csrfToken: 'csrf',
      profile: { timezone: 'UTC' },
    });
  if (url.endsWith('/users/me/ai-provider-consent'))
    return json({
      providerMode: 'fake',
      externalProviderEnabled: false,
      accepted: false,
    });
  if (url.endsWith('/ai-action-prices/food-photo-analysis'))
    return json({
      actionType: 'foodPhotoAnalysis',
      tokenPrice: 3,
      priceVersion: 1,
    });
  if (url.endsWith('/food-consumptions'))
    return json({
      items: [
        {
          id: 'meal',
          foodAnalysisId: 'confirmed',
          consumedAt: '2026-09-24T10:00:00Z',
          localDate: '2026-09-24',
          timezone: 'UTC',
          confirmedResult: { items: [{ name: 'Подтверждённый рис' }] },
        },
      ],
    });
  throw new Error(`Unexpected URL: ${url}`);
}
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
it('finds old unconfirmed analyses and retries the same next cursor without duplicating diary entries', async () => {
  let nextAttempts = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/food-analyses?')) {
      const query = new URL(url, 'https://local.test').searchParams;
      expect(query.get('consumptionStatus')).toBe('notConfirmed');
      expect(query.get('limit')).toBe('20');
      if (!query.get('cursor'))
        return json({ items: [item('old-1')], nextCursor: 'opaque+/=' });
      expect(query.get('cursor')).toBe('opaque+/=');
      if (++nextAttempts === 1) throw new TypeError('offline');
      return json({
        items: [{ ...item('old-2'), status: 'technicalError', dishName: null }],
        nextCursor: null,
      });
    }
    return baseResponse(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<FoodPage />);
  await screen.findByRole('heading', { name: 'Фото блюда', level: 1 });
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).includes('/food-analyses?'),
    ),
  ).toBe(false);
  fireEvent.click(screen.getByText('Показать прошлые разборы'));
  await screen.findByText('Блюдо old-1');
  expect(screen.getAllByText('Подтверждённый рис')).toHaveLength(1);
  fireEvent.click(screen.getByText('Показать ещё разборы'));
  fireEvent.click(await screen.findByText('Повторить загрузку разборов'));
  await screen.findByText('Разбор завершился ошибкой');
  expect(screen.getAllByText('Блюдо old-1')).toHaveLength(1);
  expect(screen.queryByText('Показать ещё разборы')).not.toBeInTheDocument();
  expect(nextAttempts).toBe(2);
  expect(sessionStorage.length).toBe(0);
});
it('keeps a deleted analysis discoverable so its remaining photo can be deleted separately', async () => {
  const state = { ...deletion, analysisStatus: 'deleted' };
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/food-analyses?'))
        return json({
          items: [
            {
              ...item('old-1'),
              status: 'deleted',
              dishName: null,
              deletionStatus: state,
            },
          ],
          nextCursor: null,
        });
      if (url.endsWith('/food-analyses/old-1/deletion-status'))
        return json(state);
      if (
        url.endsWith('/food-analyses/old-1/photo') &&
        init?.method === 'DELETE'
      )
        return json({ ...state, photoStatus: 'pending' });
      return baseResponse(url);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<FoodPage />);
  await screen.findByRole('heading', { name: 'Фото блюда', level: 1 });
  fireEvent.click(screen.getByText('Показать прошлые разборы'));
  const list = await screen.findByRole('list', { name: 'Прошлые разборы' });
  const row = within(list).getAllByRole('listitem')[0]!;
  fireEvent.click(row.querySelector('button')!);
  fireEvent.click(await screen.findByText('Удалить исходное фото'));
  expect(
    screen.queryByText('Удалить результат анализа'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await screen.findByText(
    'Фото скрыто. Удаление из хранилища ожидается в течение 24 часов.',
  );
  expect(screen.getByText('Подтверждённый рис')).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
  ).toHaveLength(1);
});

it('ignores an old owner list response after logout and loading another account', async () => {
  let owner = 'user-1';
  let release!: (response: Response) => void;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/users/me')) return json({ userId: owner });
    if (url.includes('/food-analyses?')) {
      if (owner === 'user-1')
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return json({ items: [item('own-new')], nextCursor: null });
    }
    return baseResponse(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  const oldPage = render(<FoodPage />);
  await screen.findByRole('heading', { name: 'Фото блюда', level: 1 });
  fireEvent.click(screen.getByText('Показать прошлые разборы'));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/food-analyses?'),
      ),
    ).toBe(true),
  );
  oldPage.unmount();
  owner = 'user-2';
  render(<FoodPage />);
  await screen.findByRole('heading', { name: 'Фото блюда', level: 1 });
  fireEvent.click(screen.getByText('Показать прошлые разборы'));
  await screen.findByText('Блюдо own-new');
  await act(async () =>
    release(json({ items: [item('private-old')], nextCursor: 'old-cursor' })),
  );
  expect(screen.queryByText('Блюдо private-old')).not.toBeInTheDocument();
  expect(screen.queryByText('Показать ещё разборы')).not.toBeInTheDocument();
  expect(sessionStorage.length).toBe(0);
});
