import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import FoodPage from './page';
import { ApiError } from '../../shared/api';
import * as food from '../../features/food/food-api';
import { loadProviderConsent } from '../../features/ai-companion/provider-consent';
import type { FoodAnalysisResourceDto } from '@atlas/api-contracts';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../features/food/food-api', () => ({
  loadFoodScreen: vi.fn(),
  loadFoodDeletionStatus: vi.fn(),
  requestFoodDeletion: vi.fn(),
  prepareFoodImage: vi.fn(),
  createFoodAnalysis: vi.fn(),
  loadFoodAnalysis: vi.fn(),
  saveFoodCorrection: vi.fn(),
  confirmFoodConsumption: vi.fn(),
}));
vi.mock('../../features/ai-companion/provider-consent', () => ({
  loadProviderConsent: vi.fn(),
  ProviderConsentNotice: ({
    onAccepted,
  }: {
    onAccepted: () => Promise<void>;
  }) => <button onClick={() => void onAccepted()}>Обновить согласие</button>,
}));
vi.mock('../../features/food/food-photo-draft', () => ({
  FoodPhotoDraft: ({ onReady }: { onReady: (file: File) => void }) => (
    <button onClick={() => onReady(new File(['photo'], 'food.jpg'))}>
      Выбрать фото
    </button>
  ),
}));
const analyzed = {
  id: 'analysis-1',
  uploadedImageId: 'image-1',
  status: 'analyzed',
  runtimeAdapter: 'fake',
  consumptionStatus: 'notConfirmed',
  createdAt: '2026-09-24T00:00:00Z',
  recognizedResult: { items: [{ name: 'рис' }] },
} as FoodAnalysisResourceDto;
const price = {
  actionType: 'foodPhotoAnalysis' as const,
  tokenPrice: 3,
  priceVersion: 1,
};
function saved(value: unknown, user = 'user-1') {
  sessionStorage.setItem(`food-operation:${user}`, JSON.stringify(value));
}
async function ready() {
  await screen.findByText('Фото блюда');
}
async function tick(ms = 1000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  vi.mocked(loadProviderConsent).mockResolvedValue({
    providerMode: 'fake',
    foodProviderMode: 'fake',
    foodExternalProviderEnabled: false,
    externalProviderEnabled: false,
    accepted: false,
  } as Awaited<ReturnType<typeof loadProviderConsent>>);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ userId: 'user-1' }), { status: 200 }),
    ),
  );
  vi.mocked(food.loadFoodScreen).mockResolvedValue({
    csrfToken: 'secret',
    timezone: 'UTC',
    price,
    consumptions: [],
  });
  vi.mocked(food.prepareFoodImage).mockResolvedValue('image-1');
  vi.mocked(food.createFoodAnalysis).mockResolvedValue({
    id: 'analysis-1',
    status: 'queued',
  } as Awaited<ReturnType<typeof food.createFoodAnalysis>>);
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue(analyzed);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('retries a lost consumption response after reload with the same payload and no second correction', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.confirmFoodConsumption)
    .mockRejectedValueOnce(new Error('Ответ потерян'))
    .mockResolvedValueOnce({} as never);
  const first = render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Съели это?'));
  fireEvent.click(screen.getByText('Подтвердить употребление'));
  await screen.findByText('Ответ потерян');
  const original = vi.mocked(food.confirmFoodConsumption).mock.calls[0]![0];
  expect(food.saveFoodCorrection).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('food-operation:user-1')).not.toContain(
    'secret',
  );
  first.unmount();
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Повторить подтверждение'));
  await screen.findByText('Добавлено в дневник');
  expect(food.saveFoodCorrection).toHaveBeenCalledTimes(1);
  expect(vi.mocked(food.confirmFoodConsumption).mock.calls[1]![0]).toEqual(
    original,
  );
});

it('replays a paid submit after reload using the original image, key and price', async () => {
  vi.mocked(food.createFoodAnalysis).mockRejectedValueOnce(
    new Error('Ответ потерян'),
  );
  const first = render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Выбрать фото'));
  fireEvent.click(screen.getByText('Начать анализ'));
  await screen.findByText('Ответ потерян');
  const original = vi.mocked(food.createFoodAnalysis).mock.calls[0]![0];
  first.unmount();
  vi.mocked(food.loadFoodScreen).mockResolvedValue({
    csrfToken: 'secret',
    timezone: 'UTC',
    price: { ...price, tokenPrice: 9, priceVersion: 2 },
    consumptions: [],
  });
  render(<FoodPage />);
  await ready();
  expect(food.createFoodAnalysis).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Восстановить отправленный разбор'));
  await waitFor(() => expect(food.createFoodAnalysis).toHaveBeenCalledTimes(2));
  expect(vi.mocked(food.createFoodAnalysis).mock.calls[1]![0]).toEqual(
    original,
  );
  expect(food.prepareFoodImage).toHaveBeenCalledTimes(1);
});

it('does not restore another user operation', async () => {
  saved({ analysisId: 'someone-elses-analysis' }, 'user-2');
  render(<FoodPage />);
  await ready();
  expect(food.loadFoodAnalysis).not.toHaveBeenCalled();
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
});

it('ignores a pending status response after a new photo is selected', async () => {
  saved({ analysisId: 'analysis-1' });
  let resolve!: (value: FoodAnalysisResourceDto) => void;
  vi.mocked(food.loadFoodAnalysis)
    .mockResolvedValueOnce({ ...analyzed, status: 'processing' })
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  render(<FoodPage />);
  await ready();
  await waitFor(() => expect(food.loadFoodAnalysis).toHaveBeenCalledTimes(2), {
    timeout: 2000,
  });
  fireEvent.click(screen.getByText('Выбрать фото'));
  await act(async () => resolve(analyzed));
  expect(screen.getByText('Начать анализ')).toBeInTheDocument();
  expect(screen.queryByText('Что на фото')).not.toBeInTheDocument();
});

it('bounds unknown-outcome polling and can recover a later result on explicit status check', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
    ...analyzed,
    status: 'outcomeUnknown',
  });
  vi.useFakeTimers();
  render(<FoodPage />);
  await tick(0);
  await tick(61_000);
  expect(food.loadFoodAnalysis).toHaveBeenCalledTimes(31);
  expect(screen.getByText('Проверить статус')).toBeInTheDocument();
  await tick(100_000);
  expect(food.loadFoodAnalysis).toHaveBeenCalledTimes(31);
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue(analyzed);
  fireEvent.click(screen.getByText('Проверить статус'));
  await tick();
  expect(screen.getByText('Что на фото')).toBeInTheDocument();
  await tick(60_000);
  expect(food.loadFoodAnalysis).toHaveBeenCalledTimes(32);
});

it('unlocks a consumed analysis recovered after reload without repeating any mutation', async () => {
  saved({
    analysisId: 'analysis-1',
    confirmation: {
      analysisId: 'analysis-1',
      idempotencyKey: 'original',
      consumedAt: '2026-09-24T00:00:00Z',
      timezone: 'UTC',
    },
  });
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
    ...analyzed,
    consumptionStatus: 'consumed',
  });
  render(<FoodPage />);
  await ready();
  expect(screen.getByText('Добавлено в дневник')).toBeInTheDocument();
  expect(screen.getByText('Выбрать фото')).not.toBeDisabled();
  expect(food.confirmFoodConsumption).not.toHaveBeenCalled();
  expect(food.saveFoodCorrection).not.toHaveBeenCalled();
});

it('does not present saved corrections with the original suitability or start another paid analysis', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
    ...analyzed,
    consumptionStatus: 'consumed',
    userCorrection: { items: [{ name: 'рыба' }] },
    suitabilityResult: {
      status: 'matches',
      source: 'profile',
      observations: ['Рис соответствует вашим предпочтениям.'],
      missingData: [],
    },
  });
  render(<FoodPage />);
  await ready();
  expect(screen.getByText('рыба')).toBeInTheDocument();
  expect(screen.queryByText(/Рис соответствует/)).not.toBeInTheDocument();
  expect(
    screen.getByText(/Исправленный состав пока не оценён/),
  ).toBeInTheDocument();
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  expect(food.saveFoodCorrection).not.toHaveBeenCalled();
});

it.each([
  ['matches', 'Соответствует'],
  ['doesNotMatch', 'Не соответствует'],
  ['mixed', 'Частично соответствует'],
  ['insufficientData', 'Недостаточно данных'],
] as const)(
  'renders API suitability %s and its exact missing-data details',
  async (status, label) => {
    saved({ analysisId: 'analysis-1' });
    const missingData = [
      'Не указан размер порции.',
      'Неизвестен состав соуса.',
    ];
    vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
      ...analyzed,
      suitabilityResult: {
        status,
        source: 'profile',
        observations: ['Распознан рис.'],
        missingData,
      },
    });
    render(<FoodPage />);
    await ready();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.getByText(/Оценка основана на сохранённом профиле/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Распознан рис/)).toBeInTheDocument();
    const list = screen.getByRole('list', {
      name: 'Недостающие данные для оценки блюда',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(missingData);
    expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  },
);

it('hides the previous API status and missing data while editing composition', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
    ...analyzed,
    suitabilityResult: {
      status: 'mixed',
      source: 'profile',
      observations: [],
      missingData: ['Неизвестен состав соуса.'],
    },
  });
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Исправить состав'));
  fireEvent.change(screen.getByLabelText('Состав блюда'), {
    target: { value: 'рыба' },
  });
  expect(screen.queryByText('Частично соответствует')).not.toBeInTheDocument();
  expect(
    screen.queryByText('Неизвестен состав соуса.'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Исправленный состав пока не оценён/),
  ).toBeInTheDocument();
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
});

it('clears a previous account pending submit when consent refresh changes the owner', async () => {
  vi.mocked(food.createFoodAnalysis).mockRejectedValueOnce(
    new Error('Ответ потерян'),
  );
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Выбрать фото'));
  fireEvent.click(screen.getByText('Начать анализ'));
  await screen.findByText('Ответ потерян');
  const originalRecovery = sessionStorage.getItem('food-operation:user-1');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ userId: 'user-2' }), { status: 200 }),
    ),
  );
  fireEvent.click(screen.getByText('Обновить согласие'));
  await ready();
  expect(
    screen.queryByText('Восстановить отправленный разбор'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Начать анализ')).not.toBeInTheDocument();
  expect(screen.getByText('Выбрать фото')).not.toBeDisabled();
  expect(food.createFoodAnalysis).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('food-operation:user-2')).toBeNull();
  expect(sessionStorage.getItem('food-operation:user-1')).toBe(
    originalRecovery,
  );
});

it('does not submit or persist a previous account upload completing after an owner change', async () => {
  let finishUpload!: (imageId: string) => void;
  vi.mocked(food.prepareFoodImage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
  );
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Выбрать фото'));
  fireEvent.click(screen.getByText('Начать анализ'));
  await waitFor(() => expect(food.prepareFoodImage).toHaveBeenCalledTimes(1));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ userId: 'user-2' }), { status: 200 }),
    ),
  );
  fireEvent.click(screen.getByText('Обновить согласие'));
  await ready();
  await act(async () => finishUpload('image-owned-by-user-1'));
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('food-operation:user-2')).toBeNull();
  expect(screen.queryByText('Начать анализ')).not.toBeInTheDocument();
});

it('requires completed upload after a failed upload retry before sending the paid analysis request', async () => {
  let finishUpload!: (imageId: string) => void;
  vi.mocked(food.prepareFoodImage)
    .mockRejectedValueOnce(new Error('Фото не загружено'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Выбрать фото'));
  fireEvent.click(screen.getByText('Начать анализ'));
  await screen.findByText('Фото не загружено');
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Начать анализ'));
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  await act(async () => finishUpload('completed-image'));
  expect(food.createFoodAnalysis).toHaveBeenCalledTimes(1);
  expect(food.createFoodAnalysis).toHaveBeenCalledWith(
    expect.objectContaining({ uploadedImageId: 'completed-image' }),
  );
});

it('waits for accepted external-provider consent and another explicit start before any upload', async () => {
  const consent = {
    providerMode: 'genapi',
    foodProviderMode: 'genapi',
    foodExternalProviderEnabled: true,
    externalProviderEnabled: true,
    accepted: false,
  } as Awaited<ReturnType<typeof loadProviderConsent>>;
  vi.mocked(loadProviderConsent).mockResolvedValue(consent);
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Выбрать фото'));
  expect(screen.getByText('Начать анализ')).toBeDisabled();
  fireEvent.click(screen.getByText('Начать анализ'));
  expect(food.prepareFoodImage).not.toHaveBeenCalled();
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
  vi.mocked(loadProviderConsent).mockResolvedValue({
    ...consent,
    accepted: true,
  });
  fireEvent.click(screen.getByText('Обновить согласие'));
  await ready();
  expect(screen.getByText('Начать анализ')).not.toBeDisabled();
  expect(food.prepareFoodImage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Начать анализ'));
  await waitFor(() => expect(food.createFoodAnalysis).toHaveBeenCalledTimes(1));
});

it('hides a deleted current analysis immediately and restores its deletion controls after reload', async () => {
  saved({ analysisId: 'analysis-1' });
  const available = {
    analysisId: 'analysis-1',
    photoStatus: 'available',
    analysisStatus: 'available',
    cancellationStatus: 'notCancelled',
  } as const;
  const deleted = { ...available, analysisStatus: 'deleted' } as const;
  vi.mocked(food.loadFoodDeletionStatus).mockResolvedValue(available);
  vi.mocked(food.requestFoodDeletion).mockResolvedValue(deleted);
  const page = render(<FoodPage />);
  await ready();
  expect(screen.getByText('Съели это?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить результат анализа'));
  fireEvent.click(screen.getByText('Подтвердить удаление анализа'));
  await screen.findByText(
    'Результат анализа удалён. Подтверждённая запись о еде сохранена.',
  );
  expect(screen.queryByText('Съели это?')).not.toBeInTheDocument();
  page.unmount();
  vi.mocked(food.loadFoodAnalysis).mockRejectedValue(
    new ApiError('request', 'Deleted', 'FOOD_ANALYSIS_NOT_FOUND', 404),
  );
  vi.mocked(food.loadFoodDeletionStatus).mockResolvedValue(deleted);
  render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Фото и анализ'));
  await screen.findByText('Удалить исходное фото');
  expect(screen.queryByText('Съели это?')).not.toBeInTheDocument();
  expect(food.requestFoodDeletion).toHaveBeenCalledTimes(1);
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
});
it('does not apply a late deletion response from a previous account to the active screen', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.loadFoodDeletionStatus).mockResolvedValue({
    analysisId: 'analysis-1',
    photoStatus: 'available',
    analysisStatus: 'available',
    cancellationStatus: 'notCancelled',
  });
  let finish!: (value: food.FoodDeletionStatus) => void;
  vi.mocked(food.requestFoodDeletion).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const mounted = render(<FoodPage />);
  await ready();
  fireEvent.click(screen.getByText('Фото и анализ'));
  fireEvent.click(await screen.findByText('Удалить результат анализа'));
  fireEvent.click(screen.getByText('Подтвердить удаление анализа'));
  await waitFor(() =>
    expect(food.requestFoodDeletion).toHaveBeenCalledTimes(1),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ userId: 'user-2' }), { status: 200 }),
    ),
  );
  mounted.unmount();
  render(<FoodPage />);
  await ready();
  await act(async () =>
    finish({
      analysisId: 'analysis-1',
      photoStatus: 'available',
      analysisStatus: 'deleted',
      cancellationStatus: 'notCancelled',
    }),
  );
  expect(screen.queryByText('Фото и анализ')).not.toBeInTheDocument();
  expect(screen.queryByText('Съели это?')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('food-operation:user-2')).toBeNull();
});

it('stops showing a pending analysis once the server confirms cancellation and a full refund', async () => {
  saved({ analysisId: 'analysis-1' });
  vi.mocked(food.loadFoodAnalysis).mockResolvedValue({
    ...analyzed,
    status: 'queued',
    recognizedResult: undefined,
  });
  vi.mocked(food.loadFoodDeletionStatus).mockResolvedValue({
    analysisId: 'analysis-1',
    photoStatus: 'available',
    analysisStatus: 'available',
    cancellationStatus: 'notCancelled',
  });
  vi.mocked(food.requestFoodDeletion).mockResolvedValue({
    analysisId: 'analysis-1',
    photoStatus: 'pending',
    analysisStatus: 'available',
    cancellationStatus: 'cancelledRefunded',
  });
  vi.useFakeTimers();
  render(<FoodPage />);
  await tick(0);
  fireEvent.click(screen.getByText('Фото и анализ'));
  await tick(0);
  fireEvent.click(screen.getByText('Отменить анализ и удалить исходное фото'));
  fireEvent.click(screen.getByText('Подтвердить удаление фото'));
  await tick(0);
  expect(
    screen.getByText(
      'Анализ отменён. Все зарезервированные токены возвращены.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('Проверяем изображение и готовим результат…'),
  ).not.toBeInTheDocument();
  await tick(60_000);
  expect(food.loadFoodAnalysis).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByText('Отменить анализ и удалить исходное фото'),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Съели это?')).not.toBeInTheDocument();
  expect(food.createFoodAnalysis).not.toHaveBeenCalled();
});

it.each([
  ['fake', 'genapi', true],
  ['genapi', 'fake', false],
  ['fake', 'fake', false],
] as const)(
  'uses the food capability for chat=%s food=%s before allowing upload',
  async (providerMode, foodProviderMode, requiresConsent) => {
    vi.mocked(loadProviderConsent).mockResolvedValue({
      providerMode,
      externalProviderEnabled: providerMode === 'genapi',
      foodProviderMode,
      foodExternalProviderEnabled: foodProviderMode === 'genapi',
      accepted: false,
    } as Awaited<ReturnType<typeof loadProviderConsent>>);
    render(<FoodPage />);
    await ready();
    fireEvent.click(screen.getByText('Выбрать фото'));
    const start = screen.getByText('Начать анализ');
    if (requiresConsent) expect(start).toBeDisabled();
    else expect(start).not.toBeDisabled();
    expect(food.prepareFoodImage).not.toHaveBeenCalled();
  },
);
