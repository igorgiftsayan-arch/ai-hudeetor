import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MarathonLobbyDto } from '@atlas/api-contracts';
import MarathonPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('marathon page', () => {
  beforeEach(() => replaceMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['2026-09-28', 'День 1 из 14 · 2026-09-28'],
    ['2026-09-29', 'День 2 из 14 · 2026-09-29'],
    ['2026-10-11', 'День 14 из 14 · 2026-10-11'],
  ])('shows the marathon day from server calendar dates on %s', async (displayDate, label) => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input) === `${api}/marathons/current`) {
        return json({ ...current(), displayDate });
      }
      return responseFor(input);
    }));
    render(<MarathonPage />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('renders server-provided daily podium groups without deriving ranks in the client', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => responseFor(input)));

    render(<MarathonPage />);

    expect(await screen.findByText('Команда Антонины')).toBeInTheDocument();
    expect(screen.getByText('Пока нет отчёта за вчера.')).toBeInTheDocument();
    const leaders = screen.getByLabelText('Лидеры дня: Отвес, %');
    expect(leaders).toHaveTextContent('Игорь');
    expect(leaders).toHaveTextContent('1 %');
    expect(screen.getByRole('link', { name: 'Поговорить с AI' })).toHaveAttribute(
      'href',
      '/quick-reply',
    );
  });

  it('loads the lobby and joins an open enrollment without an invitation code', async () => {
    const user = userEvent.setup();
    let joined = false;
    let joinAttempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return json(onboarding());
      if (url === `${api}/marathons/lobby`) {
        return json(lobby({
          currentMembership: joined ? { id: 'membership-1', role: 'participant' } : null,
        }));
      }
      if (url === `${api}/marathons/marathon-1/memberships` && init?.method === 'POST') {
        joinAttempts += 1;
        if (joinAttempts === 1) {
          return json({ error: { code: 'TEMPORARY', message: 'Временная ошибка.' } }, 500);
        }
        joined = true;
        return json({ membershipId: 'membership-1', marathonId: 'marathon-1', role: 'participant', createdAt: '2026-10-01T00:00:00.000Z' }, 201);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    await user.click(await screen.findByRole('button', { name: 'Вступить в марафон' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Временная ошибка.');
    await user.click(screen.getByRole('button', { name: 'Вступить в марафон' }));
    expect(await screen.findByText('Вы уже в марафоне. Набор ещё открыт.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/код приглашения/i)).not.toBeInTheDocument();

    const join = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `${api}/marathons/marathon-1/memberships` &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(join?.[1]?.body).toBe(JSON.stringify({}));
    const joinCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url) === `${api}/marathons/marathon-1/memberships` &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(joinCalls).toHaveLength(2);
    expect((joinCalls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      (joinCalls[1]?.[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
  });

  it('lets an allowed captain open, close and start an enrollment before loading the legacy daily screen', async () => {
    const user = userEvent.setup();
    let status: 'empty' | 'enrollmentOpen' | 'enrollmentClosed' | 'inProgress' = 'empty';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return json(onboarding());
      if (url === `${api}/marathons/lobby`) {
        if (status === 'empty') {
          return json({ marathon: null, enrollment: null, currentMembership: null, canManage: false, canOpenEnrollment: true });
        }
        return json(lobby({
          marathon: {
            ...marathon(),
            status,
            startsOn: status === 'inProgress' ? '2026-10-01' : null,
            endsOn: status === 'inProgress' ? '2026-10-21' : null,
            startedAt: status === 'inProgress' ? '2026-10-01T00:00:00.000Z' : null,
            enrollmentClosedAt: status === 'enrollmentOpen' ? null : '2026-10-01T00:00:00.000Z',
          },
          enrollment: { isOpen: status === 'enrollmentOpen', memberCount: 1 },
          currentMembership: { id: 'captain-1', role: 'captain' },
          canManage: status !== 'inProgress',
          canOpenEnrollment: false,
        }));
      }
      if (url === `${api}/marathons/enrollment` && init?.method === 'POST') {
        status = 'enrollmentOpen';
        return json({ marathonId: 'marathon-1', status: 'enrollmentOpen', durationDays: 28, timezone: 'Asia/Irkutsk', membershipId: 'captain-1', role: 'captain' }, 201);
      }
      if (url === `${api}/marathons/marathon-1/enrollment-close` && init?.method === 'POST') {
        status = 'enrollmentClosed';
        return json({ marathonId: 'marathon-1', status: 'enrollmentClosed', enrollmentClosedAt: '2026-10-01T00:00:00.000Z' });
      }
      if (url === `${api}/marathons/marathon-1/start` && init?.method === 'POST') {
        status = 'inProgress';
        return json({ marathonId: 'marathon-1', status: 'inProgress', startsOn: '2026-10-01', endsOn: '2026-10-21', startedAt: '2026-10-01T00:00:00.000Z' });
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    const duration = await screen.findByLabelText('Длительность, дней');
    await user.clear(duration);
    await user.type(duration, '28');
    await user.click(screen.getByRole('button', { name: 'Открыть набор' }));
    await user.click(await screen.findByRole('button', { name: 'Завершить набор' }));
    await user.click(await screen.findByRole('button', { name: 'Начать первый день' }));
    expect(await screen.findByText('Команда Антонины')).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.find(
        ([url, init]) => String(url) === `${api}/marathons/enrollment` && (init as RequestInit | undefined)?.method === 'POST',
      )?.[1]?.body,
    ).toBe(JSON.stringify({ durationDays: 28 }));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url) === `${api}/marathons/marathon-1/enrollment-close` && (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url) === `${api}/marathons/marathon-1/start` && (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('does not load the legacy daily APIs for a late user without membership', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${api}/marathons/lobby`) {
        return json(lobby({
          marathon: {
            ...marathon(),
            status: 'inProgress',
            startsOn: '2026-10-01',
            endsOn: '2026-10-21',
            startedAt: '2026-10-01T00:00:00.000Z',
          },
          enrollment: { isOpen: false, memberCount: 12 },
          currentMembership: null,
        }));
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    expect(await screen.findByText('Набор завершён, вступить уже нельзя.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/marathons/current`),
    ).toBe(false);
  });

  it('shows the final one-day report beside the next enrollment without opening daily controls', async () => {
    const user = userEvent.setup();
    let saved = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return json(onboarding());
      if (url === `${api}/marathons/lobby`) {
        return json({
          ...lobby({
            marathon: {
              ...marathon(),
              id: 'next-marathon',
              name: 'Следующий набор',
              status: 'enrollmentOpen',
              startsOn: null,
              endsOn: null,
            },
            enrollment: { isOpen: true, memberCount: 12 },
            currentMembership: null,
          }),
          finale: {
            marathonId: 'completed-marathon',
            endsOn: '2026-10-01',
            membershipId: 'completed-membership',
            role: 'participant',
          },
        });
      }
      if (url === `${api}/marathons/current?marathonId=completed-marathon`) {
        return json({
          ...current(),
          marathon: {
            ...current().marathon,
            id: 'completed-marathon',
            startsOn: '2026-10-01',
            endsOn: '2026-10-01',
          },
          membership: { id: 'completed-membership', role: 'participant', isCurrentUser: true },
          displayDate: '2026-10-02',
          reportDate: '2026-10-01',
        });
      }
      if (url === `${api}/marathon-wellness-reports/2026-10-01?marathonId=completed-marathon`) {
        if (init?.method === 'PUT') {
          saved = true;
          return json({
            status: 'reported',
            reportDate: '2026-10-01',
            morningShake: false,
            physicalActivity: false,
            waterTarget: true,
            secondShake: false,
            healthyDinner: false,
            goodSleep: false,
            noJunkFood: false,
            noSmoking: false,
            markedCount: 1,
            updatedAt: '2026-10-02T00:00:00.000Z',
          });
        }
        return json(
          saved
            ? {
                status: 'reported',
                reportDate: '2026-10-01',
                report: {
                  morningShake: false,
                  physicalActivity: false,
                  waterTarget: true,
                  secondShake: false,
                  healthyDinner: false,
                  goodSleep: false,
                  noJunkFood: false,
                  noSmoking: false,
                  updatedAt: '2026-10-02T00:00:00.000Z',
                },
              }
            : { status: 'unknown', reportDate: '2026-10-01', report: null },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    expect(await screen.findByRole('heading', { name: 'Марафон завершён' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Следующий набор' })).toBeInTheDocument();
    expect(screen.getByText('Вчера · 2026-10-01')).toBeInTheDocument();
    expect(screen.queryByText('Команда Антонины')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отметить выполнение' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Задание на сегодня' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Норма воды' }));
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));

    expect(await screen.findByRole('button', { name: 'Обновить отчёт' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Норма воды' })).toBeChecked();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === `${api}/marathon-wellness-reports/2026-10-01?marathonId=completed-marathon` &&
          (init as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/marathon-teams/current/today`),
    ).toBe(false);
  });

  it('shows the final report beside the new active marathon with scoped finale reads', async () => {
    const user = userEvent.setup();
    let finalSaved = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return json(onboarding());
      if (url === `${api}/marathons/lobby`) {
        return json({
          ...lobby({
            marathon: {
              ...marathon(),
              id: 'next-marathon',
              name: 'Следующий марафон',
              status: 'inProgress',
              startsOn: '2026-10-02',
              endsOn: '2026-10-22',
              startedAt: '2026-10-02T00:00:00.000Z',
            },
            enrollment: { isOpen: false, memberCount: 12 },
            currentMembership: { id: 'next-membership', role: 'captain' },
          }),
          finale: {
            marathonId: 'completed-marathon',
            endsOn: '2026-10-01',
            membershipId: 'completed-membership',
            role: 'participant',
          },
        });
      }
      if (url === `${api}/marathons/current`) {
        return json({
          ...current(),
          marathon: {
            ...current().marathon,
            id: 'next-marathon',
            name: 'Следующий марафон',
            startsOn: '2026-10-02',
            endsOn: '2026-10-22',
          },
          team: { id: 'next-team', name: 'Команда следующего марафона' },
          membership: { id: 'next-membership', role: 'captain', isCurrentUser: true },
          displayDate: '2026-10-02',
          reportDate: '2026-10-01',
        });
      }
      if (url === `${api}/marathons/current?marathonId=completed-marathon`) {
        return json({
          ...current(),
          marathon: {
            ...current().marathon,
            id: 'completed-marathon',
            startsOn: '2026-10-01',
            endsOn: '2026-10-01',
          },
          membership: { id: 'completed-membership', role: 'participant', isCurrentUser: true },
          displayDate: '2026-10-02',
          reportDate: '2026-10-01',
        });
      }
      if (url === `${api}/marathon-wellness-reports/2026-10-01`) {
        return json({ status: 'notApplicable', reportDate: '2026-10-01', report: null });
      }
      if (url === `${api}/marathon-wellness-reports/2026-10-01?marathonId=completed-marathon`) {
        if (init?.method === 'PUT') {
          finalSaved = true;
          return json({
            status: 'reported',
            reportDate: '2026-10-01',
            morningShake: false,
            physicalActivity: false,
            waterTarget: true,
            secondShake: false,
            healthyDinner: false,
            goodSleep: false,
            noJunkFood: false,
            noSmoking: false,
            markedCount: 1,
            updatedAt: '2026-10-02T00:00:00.000Z',
          });
        }
        return json(
          finalSaved
            ? {
                status: 'reported',
                reportDate: '2026-10-01',
                report: {
                  morningShake: false,
                  physicalActivity: false,
                  waterTarget: true,
                  secondShake: false,
                  healthyDinner: false,
                  goodSleep: false,
                  noJunkFood: false,
                  noSmoking: false,
                  updatedAt: '2026-10-02T00:00:00.000Z',
                },
              }
            : { status: 'unknown', reportDate: '2026-10-01', report: null },
        );
      }
      if (url === `${api}/marathon-teams/current/today`) {
        return json({
          ...team(),
          team: { id: 'next-team', name: 'Команда следующего марафона' },
          currentMembership: { id: 'next-membership', role: 'captain' },
          captainTask: {
            id: 'next-task',
            taskDate: '2026-10-02',
            title: 'Новое задание',
            description: 'Для нового марафона.',
            currentUserCompletion: { status: 'unknown', updatedAt: null },
          },
        });
      }
      if (url === `${api}/users/me/ai-provider-consent`) return json(consent());
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    expect(await screen.findByText('Команда следующего марафона')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Задание на сегодня' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Марафон завершён' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название задания')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Норма воды' }));
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));

    expect(await screen.findByRole('button', { name: 'Обновить отчёт' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === `${api}/marathon-wellness-reports/2026-10-01?marathonId=completed-marathon` &&
          (init as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/marathons/current`),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === `${api}/marathons/current?marathonId=completed-marathon`,
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/marathon-teams/current/today`),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/users/me/ai-provider-consent`),
    ).toBe(true);
  });

  it('does not request or render a final report after the server finale window closes', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${api}/users/me/onboarding`) return json(onboarding());
      if (String(input) === `${api}/marathons/lobby`) {
        return json(lobby({
          marathon: {
            ...marathon(),
            status: 'completed',
            startsOn: '2026-10-01',
            endsOn: '2026-10-01',
            completedAt: '2026-10-03T00:00:00.000Z',
          },
          currentMembership: { id: 'completed-membership', role: 'participant' },
        }));
      }
      throw new Error(`Unexpected fetch: ${String(input)} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);

    expect(await screen.findByRole('heading', { name: 'Марафон завершён' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /отчёт/i })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith(`${api}/marathon-wellness-reports/`)),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === `${api}/marathons/current`),
    ).toBe(false);
  });

  it('saves the selected yesterday items through the confirmed report endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      responseFor(input, init),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await screen.findByText('Команда Антонины');
    await user.click(screen.getByRole('checkbox', { name: 'Норма воды' }));
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));

    const mutation = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === `${api}/marathon-wellness-reports/2026-09-28` &&
        (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(mutation).toBeDefined();
    expect(mutation?.[1]?.body).toBe(
      JSON.stringify({
        morningShake: false,
        physicalActivity: false,
        waterTarget: true,
        secondShake: false,
        healthyDinner: false,
        goodSleep: false,
        noJunkFood: false,
        noSmoking: false,
      }),
    );
  });

  it('reuses the idempotency key when a failed report is sent again', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${api}/marathon-wellness-reports/2026-09-28` && init?.method === 'PUT') {
        attempts += 1;
        if (attempts === 1) return json({ error: { code: 'TEMPORARY', message: 'Временная ошибка.' } }, 500);
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await screen.findByText('Команда Антонины');
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Временная ошибка.');
    await user.click(screen.getByRole('button', { name: 'Отправить отчёт' }));

    const calls = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === `${api}/marathon-wellness-reports/2026-09-28` && (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(calls).toHaveLength(2);
    expect((calls[0]?.[1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      (calls[1]?.[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
  });

  it('shows the empty lobby instead of treating an unmaterialized marathon as an error', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${api}/marathons/lobby`) {
        return json({
          marathon: null,
          enrollment: null,
          currentMembership: null,
          canManage: false,
          canOpenEnrollment: false,
        });
      }
      return responseFor(input, init);
    }));

    render(<MarathonPage />);
    expect(await screen.findByText('Набор ещё не открыт')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
    expect(screen.queryByText('Не удалось загрузить марафон')).not.toBeInTheDocument();
  });

  it('keeps the team screen when the first-day report is not applicable', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${api}/marathon-wellness-reports/2026-09-28`) {
        return json({ status: 'notApplicable', reportDate: '2026-09-28', report: null });
      }
      return responseFor(input, init);
    }));

    render(<MarathonPage />);
    expect(await screen.findByText('Команда Антонины')).toBeInTheDocument();
    expect(screen.getByLabelText('Отчёт за вчера недоступен')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить отчёт' })).not.toBeInTheDocument();
  });

  it('refreshes a captain screen when a stale task date is rejected after midnight', async () => {
    const user = userEvent.setup();
    let currentReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/marathons/current`) {
        currentReads += 1;
        return json({
          ...current(),
          displayDate: currentReads === 1 ? '2026-09-29' : '2026-09-30',
          reportDate: currentReads === 1 ? '2026-09-28' : '2026-09-29',
          membership: { id: 'membership-1', role: 'captain', isCurrentUser: true },
        });
      }
      if (url.startsWith(`${api}/marathon-wellness-reports/`)) {
        return json({ status: 'unknown', reportDate: url.slice(-10), report: null });
      }
      if (url === `${api}/marathon-teams/current/today`) {
        return json({
          ...team(),
          currentMembership: { id: 'membership-1', role: 'captain' },
        });
      }
      if (
        url === `${api}/marathon-captain-tasks/2026-09-29` &&
        init?.method === 'PUT'
      ) {
        return json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Task date must be the current marathon date',
            },
          },
          422,
        );
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await screen.findByRole('heading', { name: 'Задание на сегодня' });
    await user.type(screen.getByLabelText('Название задания'), 'Прогулка');
    await user.type(screen.getByLabelText('Описание задания'), 'Синтетическая проверка');
    await user.click(screen.getByRole('button', { name: 'Сохранить задание' }));

    expect(
      await screen.findByText('Дата задания изменилась. Экран обновлён — можно продолжить.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('День 3 из 14 · 2026-09-30')).toBeInTheDocument();
    expect(currentReads).toBe(2);
  });

  it('refreshes a participant screen when yesterday task completion is rejected', async () => {
    const user = userEvent.setup();
    let currentReads = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/marathons/current`) {
        currentReads += 1;
        return json({
          ...current(),
          displayDate: currentReads === 1 ? '2026-09-29' : '2026-09-30',
          reportDate: currentReads === 1 ? '2026-09-28' : '2026-09-29',
        });
      }
      if (url.startsWith(`${api}/marathon-wellness-reports/`)) {
        return json({ status: 'unknown', reportDate: url.slice(-10), report: null });
      }
      if (url === `${api}/marathon-teams/current/today`) {
        return json({
          ...team(),
          captainTask: {
            id: 'task-1',
            taskDate: '2026-09-29',
            title: 'Прогулка',
            description: 'Синтетическая проверка',
            currentUserCompletion: { status: 'unknown', updatedAt: null },
          },
        });
      }
      if (
        url === `${api}/marathon-captain-tasks/task-1/completion` &&
        init?.method === 'PUT'
      ) {
        return json(
          {
            error: {
              code: 'MARATHON_TASK_DATE_INVALID',
              message: 'Only the current marathon task can be completed',
            },
          },
          409,
        );
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await user.click(await screen.findByRole('button', { name: 'Отметить выполнение' }));

    expect(
      await screen.findByText('Дата задания изменилась. Экран обновлён — можно продолжить.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('День 3 из 14 · 2026-09-30')).toBeInTheDocument();
    expect(currentReads).toBe(2);
  });

  it('lets a participant undo and then restore today\'s captain-task completion', async () => {
    const user = userEvent.setup();
    let completed = true;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/marathon-teams/current/today`) {
        return json({
          ...team(),
          captainTask: {
            id: 'task-1',
            taskDate: '2026-09-29',
            title: 'Прогулка',
            description: 'Пройдите 20 минут пешком.',
            currentUserCompletion: {
              status: completed ? 'completed' : 'unknown',
              updatedAt: '2026-09-29T00:00:00.000Z',
            },
          },
        });
      }
      if (
        url === `${api}/marathon-captain-tasks/task-1/completion` &&
        init?.method === 'PUT'
      ) {
        completed = JSON.parse(String(init.body)).completed;
        return json({
          taskId: 'task-1',
          membershipId: 'membership-1',
          completed,
          updatedAt: '2026-09-29T00:00:00.000Z',
        });
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Отменить выполнение' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Отметить выполнение' }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: 'Отметить выполнение' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Отменить выполнение' }),
    ).toBeEnabled();

    const calls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url) === `${api}/marathon-captain-tasks/task-1/completion` &&
        (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(calls.map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ completed: false }),
      JSON.stringify({ completed: true }),
    ]);
  });

  it('does not retry a completion against a captain task replaced after a failed request', async () => {
    const user = userEvent.setup();
    let refreshed = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/marathon-teams/current/today`) {
        const taskId = refreshed ? 'task-2' : 'task-1';
        return json({
          ...team(),
          captainTask: {
            id: taskId,
            taskDate: '2026-09-29',
            title: 'Прогулка',
            description: 'Пройдите 20 минут пешком.',
            currentUserCompletion: { status: 'unknown', updatedAt: null },
          },
        });
      }
      if (
        url === `${api}/marathon-captain-tasks/task-1/completion` &&
        init?.method === 'PUT'
      )
        return json(
          { error: { code: 'TEMPORARY', message: 'Временная ошибка.' } },
          500,
        );
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Отметить выполнение' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Временная ошибка.');

    refreshed = true;
    window.dispatchEvent(new Event('focus'));
    await screen.findByText('Прогулка');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Задание обновилось. Проверьте отметку ещё раз.',
    );
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/marathon-captain-tasks/') &&
          (init as RequestInit | undefined)?.method === 'PUT',
      ),
    ).toHaveLength(1);
  });
});

function responseFor(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input);
  if (url === `${api}/users/me/onboarding`) return json(onboarding());
  if (url === `${api}/marathons/lobby`) {
    return json(lobby({
      marathon: {
        ...marathon(),
        status: 'inProgress',
        startsOn: '2026-09-28',
        endsOn: '2026-10-11',
        startedAt: '2026-09-28T00:00:00.000Z',
      },
      enrollment: { isOpen: false, memberCount: 1 },
      currentMembership: { id: 'membership-1', role: 'participant' },
    }));
  }
  if (url === `${api}/marathons/current`) return json(current());
  if (url === `${api}/marathon-wellness-reports/2026-09-28`) {
    if (init?.method === 'PUT') return json(report(true));
    return json({ status: 'unknown', reportDate: '2026-09-28', report: null });
  }
  if (url === `${api}/marathon-teams/current/today`) return json(team());
  if (url === `${api}/users/me/ai-provider-consent`) return json(consent());
  throw new Error(`Unexpected fetch: ${url}`);
}

function onboarding() {
  return { status: 'completed', csrfToken: 'csrf-token', profile: {} };
}

function current() {
  return {
    marathon: {
      id: 'marathon-1',
      name: 'Герби-Марафон',
      startsOn: '2026-09-28',
      endsOn: '2026-10-11',
      timezone: 'Asia/Irkutsk',
    },
    team: { id: 'team-1', name: 'Команда Антонины' },
    membership: { id: 'membership-1', role: 'participant', isCurrentUser: true },
    displayDate: '2026-09-29',
    reportDate: '2026-09-28',
  };
}

function lobby(overrides: Partial<MarathonLobbyDto> = {}): MarathonLobbyDto {
  const defaultLobby: MarathonLobbyDto = {
    marathon: {
      id: 'marathon-1',
      name: 'Герби-Марафон',
      status: 'enrollmentOpen',
      durationDays: 21,
      timezone: 'Asia/Irkutsk',
      startsOn: null,
      endsOn: null,
      enrollmentOpenedAt: '2026-10-01T00:00:00.000Z',
      enrollmentClosedAt: null,
      startedAt: null,
      completedAt: null,
    },
    enrollment: { isOpen: true, memberCount: 12 },
    currentMembership: null,
    canManage: false,
    canOpenEnrollment: false,
  };
  return { ...defaultLobby, ...overrides };
}

function marathon(): NonNullable<MarathonLobbyDto['marathon']> {
  return lobby().marathon!;
}

function report(waterTarget: boolean) {
  return {
    status: 'reported',
    reportDate: '2026-09-28',
    morningShake: false,
    physicalActivity: false,
    waterTarget,
    secondShake: false,
    healthyDinner: false,
    goodSleep: false,
    noJunkFood: false,
    noSmoking: false,
    markedCount: Number(waterTarget),
    updatedAt: '2026-09-29T00:00:00.000Z',
  };
}

function team() {
  return {
    displayDate: '2026-09-29',
    reportDate: '2026-09-28',
    team: { id: 'team-1', name: 'Команда Антонины' },
    currentMembership: { id: 'membership-1', role: 'participant' },
    captainTask: null,
    members: [
      {
        membershipId: 'membership-1',
        displayName: 'Игорь',
        isCurrentUser: true,
        role: 'participant',
        weight: { status: 'reported', dailyPercent: 1 },
        wellness: { status: 'reported', markedCount: 3 },
        captainTask: { status: 'notAssigned' },
      },
    ],
    podiums: {
      weight: [
        {
          place: 1,
          value: 1,
          members: [
            {
              membershipId: 'membership-1',
              displayName: 'Игорь',
              role: 'participant',
              isCurrentUser: true,
            },
          ],
        },
      ],
      wellness: [],
      captainTask: [],
    },
  };
}

function consent() {
  return {
    currentVersion: 'v1',
    acceptedVersion: 'v1',
    disclosure: 'External processing.',
    accepted: true,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
