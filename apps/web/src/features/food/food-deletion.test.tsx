import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FoodDeletion } from './food-deletion';
import { FoodHistoryEntry } from './food-history-entry';

const consumption = {
  id: 'meal',
  foodAnalysisId: 'analysis',
  consumedAt: '2026-09-24T10:00:00Z',
  localDate: '2026-09-24',
  timezone: 'UTC',
  confirmedResult: { items: [{ name: 'рис' }] },
};
const status = {
  analysisId: 'analysis',
  photoStatus: 'available',
  analysisStatus: 'available',
  cancellationStatus: 'notCancelled',
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
function setup() {
  return render(
    <FoodHistoryEntry
      consumption={consumption}
      csrfToken="csrf"
      ownerScope="user-1"
      onChanged={async () => {}}
      onSessionExpired={() => {}}
    />,
  );
}
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
it('keeps confirmed food when separately deleting its photo then analysis, and reads cleanup completion', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(status))
    .mockResolvedValueOnce(response({ ...status, photoStatus: 'pending' }))
    .mockResolvedValueOnce(response({ ...status, photoStatus: 'deleted' }))
    .mockResolvedValueOnce(
      response({
        ...status,
        photoStatus: 'deleted',
        analysisStatus: 'deleted',
        cancellationStatus: 'notCancelled',
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить исходное фото'));
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await screen.findByText(
    'Фото скрыто. Удаление из хранилища ожидается в течение 24 часов.',
  );
  expect(screen.getByText('рис')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Проверить удаление фото'));
  await screen.findByText('Исходное фото удалено.');
  fireEvent.click(screen.getByText('Удалить результат анализа'));
  fireEvent.click(screen.getByText('Подтвердить удаление анализа'));
  await screen.findByText(
    'Результат анализа удалён. Подтверждённая запись о еде сохранена.',
  );
  expect(screen.getByText('рис')).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET']),
  ).toEqual([
    ['/api/v1/food-analyses/analysis/deletion-status', 'GET'],
    ['/api/v1/food-analyses/analysis/photo', 'DELETE'],
    ['/api/v1/food-analyses/analysis/deletion-status', 'GET'],
    ['/api/v1/food-analyses/analysis', 'DELETE'],
  ]);
});
it('replays a lost response with the same key after remount without sending a consumption deletion', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(status))
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(response(status))
    .mockResolvedValueOnce(response({ ...status, analysisStatus: 'deleted' }));
  vi.stubGlobal('fetch', fetchMock);
  const mounted = setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить результат анализа'));
  fireEvent.click(screen.getByText('Подтвердить удаление анализа'));
  await screen.findByText('Повторить запрос удаления');
  mounted.unmount();
  setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Повторить запрос удаления'));
  await screen.findByText(
    'Результат анализа удалён. Подтверждённая запись о еде сохранена.',
  );
  const deletions = fetchMock.mock.calls.filter(
    ([, init]) => init?.method === 'DELETE',
  );
  expect(deletions).toHaveLength(2);
  expect(deletions[1]).toEqual(deletions[0]);
  expect(sessionStorage.getItem('food-deletion:user-1:analysis')).toBeNull();
});
it('rejects nonterminal deletion without claiming completion or refund', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(status))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'FOOD_ANALYSIS_NOT_TERMINAL', message: 'pending' },
        }),
        { status: 409 },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить исходное фото'));
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Анализ ещё не завершён',
    ),
  );
  expect(screen.queryByText('Исходное фото удалено.')).not.toBeInTheDocument();
});

it('recovers an accepted deletion after a lost response by status without repeating the mutation', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(status))
    .mockRejectedValueOnce(new TypeError('lost'))
    .mockResolvedValueOnce(response({ ...status, photoStatus: 'pending' }));
  vi.stubGlobal('fetch', fetchMock);
  const mounted = setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить исходное фото'));
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await screen.findByText('Повторить запрос удаления');
  mounted.unmount();
  setup();
  fireEvent.click(screen.getByText('Фото и анализ'));
  await screen.findByText(
    'Фото скрыто. Удаление из хранилища ожидается в течение 24 часов.',
  );
  expect(
    screen.queryByText('Повторить запрос удаления'),
  ).not.toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
  ).toHaveLength(1);
  expect(sessionStorage.getItem('food-deletion:user-1:analysis')).toBeNull();
});

it.each(['photo', 'analysis'] as const)(
  'shows a full refund only after server-confirmed cancellation when deleting %s',
  async (kind) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(
        response({
          ...status,
          cancellationStatus: 'cancelledRefunded',
          ...(kind === 'photo'
            ? { photoStatus: 'pending' }
            : { analysisStatus: 'deleted' }),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FoodDeletion
        analysisId="analysis"
        ownerScope="user-1"
        csrfToken="csrf"
        mayCancel
        onSessionExpired={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Фото и анализ'));
    fireEvent.click(
      await screen.findByText(
        kind === 'photo'
          ? 'Отменить анализ и удалить исходное фото'
          : 'Отменить анализ и удалить результат',
      ),
    );
    expect(
      screen.queryByText(
        'Анализ отменён. Все зарезервированные токены возвращены.',
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText(
        kind === 'photo'
          ? 'Подтвердить удаление фото'
          : 'Подтвердить удаление анализа',
      ),
    );
    await screen.findByText(
      'Анализ отменён. Все зарезервированные токены возвращены.',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/v1/food-analyses/analysis${kind === 'photo' ? '/photo' : ''}`,
    );
  },
);
it('does not claim cancellation or refund when the request might already be submitted', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(status))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'FOOD_ANALYSIS_ALREADY_SUBMITTED' },
          }),
          { status: 409 },
        ),
      ),
  );
  render(
    <FoodDeletion
      analysisId="analysis"
      ownerScope="user-1"
      csrfToken="csrf"
      mayCancel
      onSessionExpired={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(
    await screen.findByText('Отменить анализ и удалить исходное фото'),
  );
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await screen.findByText(
    'Запрос уже мог быть отправлен провайдеру. Отмена с возвратом сейчас недоступна; дождитесь результата.',
  );
  expect(
    screen.queryByText(
      'Анализ отменён. Все зарезервированные токены возвращены.',
    ),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Исходное фото удалено.')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Повторить запрос удаления'),
  ).not.toBeInTheDocument();
});
