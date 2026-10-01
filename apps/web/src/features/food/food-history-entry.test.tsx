import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { FoodHistoryEntry } from './food-history-entry';

const consumption = {
  id: 'meal-1',
  foodAnalysisId: 'analysis-1',
  consumedAt: '2026-09-23T22:17:32.123Z',
  timezone: 'Asia/Irkutsk',
  localDate: '2026-09-24',
  confirmedResult: {
    dishName: 'Завтрак',
    note: 'Сохранённая заметка',
    items: [{ name: 'рис' }],
  },
};
const changed = vi.fn();
const expired = vi.fn();
function setup() {
  render(
    <FoodHistoryEntry
      consumption={consumption}
      csrfToken="csrf-token"
      onChanged={changed}
      onSessionExpired={expired}
    />,
  );
}
function edit() {
  fireEvent.click(screen.getByText('Исправить запись'));
  fireEvent.change(screen.getByLabelText('Исправленный состав блюда'), {
    target: { value: 'гречка, яйцо' },
  });
  fireEvent.click(screen.getByText('Сохранить исправление'));
}
beforeEach(() => {
  vi.resetAllMocks();
  changed.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it('retries a lost PATCH response with the same key/payload, preserving known time and result metadata', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(consumption), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  setup();
  edit();
  await screen.findByText('Повторить изменение');
  expect(screen.getByLabelText('Исправленный состав блюда')).toBeDisabled();
  fireEvent.click(screen.getByText('Повторить изменение'));
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith('Запись исправлена.'),
  );
  const first = fetchMock.mock.calls[0]!;
  const second = fetchMock.mock.calls[1]!;
  expect(first[0]).toBe('/api/v1/food-consumptions/meal-1');
  expect(first[1]).toEqual(second[1]);
  expect(first[1].method).toBe('PATCH');
  expect(first[1].credentials).toBe('include');
  expect(new Headers(first[1].headers).get('X-CSRF-Token')).toBe('csrf-token');
  expect(new Headers(first[1].headers).get('Idempotency-Key')).toBeTruthy();
  expect(JSON.parse(first[1].body)).toEqual({
    consumedAt: consumption.consumedAt,
    timezone: consumption.timezone,
    confirmedResult: {
      ...consumption.confirmedResult,
      items: [{ name: 'гречка' }, { name: 'яйцо' }],
    },
  });
});

it('retries DELETE after a lost response and accepts the empty 204 contract', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Lost response'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(screen.getByText('Удалить запись'));
  await screen.findByText('Повторить изменение');
  fireEvent.click(screen.getByText('Повторить изменение'));
  await waitFor(() => expect(changed).toHaveBeenCalledWith('Запись удалена.'));
  expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/food-consumptions/meal-1');
  expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
  expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
});

it('retries only history refresh after the mutation already succeeded', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  changed
    .mockRejectedValueOnce(new Error('История недоступна'))
    .mockResolvedValueOnce(undefined);
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(screen.getByText('Удалить запись'));
  await screen.findByText('История недоступна');
  fireEvent.click(screen.getByText('Повторить изменение'));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not issue concurrent mutations or report success for an owner-scoped 404', async () => {
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(screen.getByText('Удалить запись'));
  fireEvent.click(screen.getByText('Удалить запись'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () =>
    finish(
      new Response(
        JSON.stringify({
          error: {
            code: 'FOOD_CONSUMPTION_NOT_FOUND',
            message: 'Запись недоступна',
          },
        }),
        { status: 404 },
      ),
    ),
  );
  expect(screen.getByText('Запись недоступна')).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});
