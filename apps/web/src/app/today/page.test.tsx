import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodayPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('today weight screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    vi.setSystemTime(new Date('2026-07-22T04:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the latest weight, change, recent history and AI navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries`)
          return json({
            items: [
              entry('weight-3', '98.4', '2026-07-22T01:00:00.000Z'),
              entry('weight-2', '99.0', '2026-07-20T01:00:00.000Z'),
              entry('weight-1', '98.8', '2026-07-18T01:00:00.000Z'),
            ],
            nextCursor: null,
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);

    expect(await screen.findByText('Сегодня, 22 июля')).toBeInTheDocument();
    const summary = screen.getByTestId('weight-summary');
    expect(within(summary).getByText('98,4 кг')).toBeInTheDocument();
    expect(
      within(summary).getByText('−0,6 кг с прошлой записи'),
    ).toBeInTheDocument();

    const history = screen.getByLabelText('Недавняя история веса');
    expect(within(history).getAllByRole('listitem')).toHaveLength(3);
    expect(within(history).getByText('+0,2 кг')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'График изменения веса' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Поговорить с AI' }),
    ).toHaveAttribute('href', '/quick-reply');
  });

  it('renders a stable chart for a single entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries`)
          return json({
            items: [entry('weight-1', '98.45', '2026-07-22T01:00:00.000Z')],
            nextCursor: null,
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);

    const chart = await screen.findByRole('img', {
      name: 'График изменения веса',
    });
    expect(within(chart).getAllByTestId('weight-chart-point')).toHaveLength(1);
    expect(chart.innerHTML).not.toContain('NaN');
  });

  it('keeps several entries from the same day visible on the chart', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries`)
          return json({
            items: [
              entry('weight-3', '98.2', '2026-07-22T15:00:00.000Z'),
              entry('weight-2', '98.5', '2026-07-22T09:00:00.000Z'),
              entry('weight-1', '98.8', '2026-07-22T02:00:00.000Z'),
            ],
            nextCursor: null,
          });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);

    const chart = await screen.findByRole('img', {
      name: 'График изменения веса',
    });
    expect(within(chart).getAllByTestId('weight-chart-point')).toHaveLength(3);
    expect(chart.innerHTML).not.toContain('NaN');
  });

  it('creates a weight entry through the existing API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries` && !init?.method)
          return json({ items: [], nextCursor: null });
        if (url === `${api}/weight-entries` && init?.method === 'POST') {
          expect(init.body).toBe(JSON.stringify({ weightKg: 98.4 }));
          expect(new Headers(init.headers).get('X-CSRF-Token')).toBe(
            'csrf-token',
          );
          expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(
            /.+/,
          );
          return json(
            entry('weight-1', '98.4', '2026-07-22T04:00:00.000Z'),
            201,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TodayPage />);
    await screen.findByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Вес сегодня' }),
      '98,4',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить вес' }));

    expect(await screen.findByText('Записано')).toBeInTheDocument();
    expect(screen.getByTestId('weight-summary')).toHaveTextContent('98,4 кг');
  });

  it('retries a network failure with the same idempotency key', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    let saves = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries` && !init?.method)
          return json({ items: [], nextCursor: null });
        if (url === `${api}/weight-entries` && init?.method === 'POST') {
          keys.push(new Headers(init.headers).get('Idempotency-Key') ?? '');
          saves += 1;
          if (saves === 1) throw new TypeError('Failed to fetch');
          return json(
            entry('weight-1', '98.4', '2026-07-22T04:00:00.000Z'),
            201,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);
    await screen.findByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Вес сегодня' }),
      '98,4',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить вес' }));
    await user.click(
      await screen.findByRole('button', { name: 'Повторить сохранение' }),
    );

    expect(await screen.findByText('Записано')).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('disables the action while a save is in progress', async () => {
    const user = userEvent.setup();
    let finishSave!: (response: Response) => void;
    const pendingSave = new Promise<Response>((resolve) => {
      finishSave = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries` && !init?.method)
          return json({ items: [], nextCursor: null });
        if (url === `${api}/weight-entries` && init?.method === 'POST')
          return pendingSave;
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);
    await screen.findByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Вес сегодня' }),
      '98,4',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить вес' }));

    expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
    finishSave(
      json(entry('weight-1', '98.4', '2026-07-22T04:00:00.000Z'), 201),
    );
    expect(await screen.findByText('Записано')).toBeInTheDocument();
  });

  it('submits a two-decimal weight through the existing API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/weight-entries` && !init?.method)
          return json({ items: [], nextCursor: null });
        if (url === `${api}/weight-entries` && init?.method === 'POST') {
          expect(init.body).toBe(JSON.stringify({ weightKg: 98.45 }));
          return json(
            entry('weight-1', '98.45', '2026-07-22T04:00:00.000Z'),
            201,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TodayPage />);
    await screen.findByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Вес сегодня' }),
      '98,45',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить вес' }));

    expect(await screen.findByText('Записано')).toBeInTheDocument();
    expect(screen.getByTestId('weight-summary')).toHaveTextContent('98,45 кг');
  });

  it('rejects more than two fractional digits before sending', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return onboarding();
      if (url === `${api}/weight-entries`)
        return json({ items: [], nextCursor: null });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TodayPage />);
    await screen.findByText(
      'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Вес сегодня' }),
      '98,456',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить вес' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Используйте не больше двух знаков после запятой.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows loading and can retry an initial network error', async () => {
    const user = userEvent.setup();
    let onboardingReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) {
          onboardingReads += 1;
          if (onboardingReads === 1) throw new TypeError('Failed to fetch');
          return onboarding();
        }
        if (url === `${api}/weight-entries`)
          return json({ items: [], nextCursor: null });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<TodayPage />);
    expect(screen.getByText('Загружаем ваши записи…')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: 'Попробовать снова' }),
    );

    expect(
      await screen.findByText(
        'Здесь появятся ваши изменения. Начните с сегодняшнего веса.',
      ),
    ).toBeInTheDocument();
  });

  it('redirects an expired session to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: {
              code: 'SESSION_EXPIRED',
              message: 'Session expired',
              details: {},
              request_id: 'request-1',
            },
          },
          401,
        ),
      ),
    );

    render(<TodayPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });
});

function onboarding(): Response {
  return json({
    status: 'completed',
    completedSteps: ['profile', 'persona', 'completion'],
    requiredSteps: [],
    canComplete: false,
    aiWellnessNoticeVersion: 'v1',
    csrfToken: 'csrf-token',
    profile: {
      userId: 'user-1',
      timezone: 'Asia/Irkutsk',
      onboardingStatus: 'completed',
    },
  });
}

function entry(id: string, weightKg: string, recordedAt: string) {
  return { id, weightKg, recordedAt, source: 'manual' };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
