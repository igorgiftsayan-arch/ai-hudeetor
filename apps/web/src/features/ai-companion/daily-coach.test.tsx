import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DailyCoach } from './daily-coach';

const api = '/api/v1';

describe('daily coach', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['notStarted', 'Начать день'],
    ['inProgress', 'Завершить день'],
    ['completed', 'На сегодня достаточно'],
  ] as const)('shows the calm %s state', (status, expected) => {
    render(
      <DailyCoach
        state={dailyState(status)}
        csrfToken="csrf-token"
        onStateChanged={vi.fn()}
        onSessionExpired={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('starts and completes the day through the generated API contract', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(init ?? {});
        const url = String(input);
        expect(url).toBe(`${api}/ai-daily-states/daily-state-1/transitions`);
        const body = JSON.parse(String(init?.body)) as {
          targetStatus: string;
        };
        if (
          body.targetStatus !== 'inProgress' &&
          body.targetStatus !== 'completed'
        ) {
          throw new Error('Unexpected target status');
        }
        return json(transition(body.targetStatus));
      }),
    );

    const { rerender } = render(
      <DailyCoach
        state={dailyState('notStarted')}
        csrfToken="csrf-token"
        onStateChanged={changed}
        onSessionExpired={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Начать день' }));

    expect(await screen.findByText('День начат')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.body).toBe(
      JSON.stringify({ targetStatus: 'inProgress' }),
    );
    expect(new Headers(requests[0]?.headers).get('X-CSRF-Token')).toBe(
      'csrf-token',
    );
    expect(new Headers(requests[0]?.headers).get('Idempotency-Key')).toMatch(
      /.+/,
    );

    rerender(
      <DailyCoach
        state={dailyState('inProgress')}
        csrfToken="csrf-token"
        onStateChanged={changed}
        onSessionExpired={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Завершить день' }));

    expect(await screen.findByText('День завершён')).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.body).toBe(
      JSON.stringify({ targetStatus: 'completed' }),
    );
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('reuses the idempotency key after a network error', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        attempts += 1;
        keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return json(transition('inProgress'));
      }),
    );

    render(
      <DailyCoach
        state={dailyState('notStarted')}
        csrfToken="csrf-token"
        onStateChanged={vi.fn()}
        onSessionExpired={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Начать день' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Не удалось сохранить состояние дня');
    await user.click(within(error).getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('День начат')).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('disables the transition while the server response is pending', async () => {
    const user = userEvent.setup();
    let finishTransition!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      finishTransition = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pendingResponse),
    );

    render(
      <DailyCoach
        state={dailyState('notStarted')}
        csrfToken="csrf-token"
        onStateChanged={vi.fn()}
        onSessionExpired={vi.fn()}
        onReload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Начать день' }));
    expect(screen.getByRole('button', { name: 'Начинаем…' })).toBeDisabled();
    finishTransition(json(transition('inProgress')));
    expect(await screen.findByText('День начат')).toBeInTheDocument();
  });

  it('redirects to login when the session expires', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => error('SESSION_INVALID', 401)),
    );

    render(
      <DailyCoach
        state={dailyState('notStarted')}
        csrfToken="csrf-token"
        onStateChanged={vi.fn()}
        onSessionExpired={onSessionExpired}
        onReload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Начать день' }));
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it.each([
    ['RESOURCE_NOT_FOUND', 404],
    ['DAILY_STATE_TRANSITION_INVALID', 409],
  ])('offers a reload after %s', async (code, status) => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => error(code, status)),
    );

    render(
      <DailyCoach
        state={dailyState('inProgress')}
        csrfToken="csrf-token"
        onStateChanged={vi.fn()}
        onSessionExpired={vi.fn()}
        onReload={onReload}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Завершить день' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Сценарий дня изменился');
    await user.click(within(alert).getByRole('button', { name: 'Обновить' }));
    expect(onReload).toHaveBeenCalledOnce();
  });
});

function dailyState(status: 'notStarted' | 'inProgress' | 'completed') {
  return {
    id: 'daily-state-1',
    localDate: '2026-08-21',
    status,
    startedAt: status === 'notStarted' ? null : '2026-08-21T01:00:00.000Z',
    completedAt: status === 'completed' ? '2026-08-21T20:00:00.000Z' : null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    context: {
      localDate: '2026-08-21',
      timezone: 'Asia/Irkutsk',
      profile: {},
      weight: {},
      memories: [],
    },
  };
}

function transition(status: 'inProgress' | 'completed') {
  return {
    id: 'daily-state-1',
    localDate: '2026-08-21',
    status,
    startedAt: '2026-08-21T01:00:00.000Z',
    completedAt: status === 'completed' ? '2026-08-21T20:00:00.000Z' : null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(code: string, status: number) {
  return json({ error: { code, message: 'Request failed' } }, status);
}
