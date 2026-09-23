import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarathonPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('marathon page', () => {
  beforeEach(() => replaceMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('loads the server daily model without deriving a podium or wellness report', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => responseFor(input)));

    render(<MarathonPage />);

    expect(await screen.findByText('Команда Антонины')).toBeInTheDocument();
    expect(screen.getByText('Пока нет отчёта за вчера.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Три лидера дня')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Поговорить с AI' })).toHaveAttribute(
      'href',
      '/quick-reply',
    );
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

  it('lets a user without membership join the current marathon with a provided code', async () => {
    const user = userEvent.setup();
    let joined = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${api}/marathons/current`) {
        return joined
          ? json(current())
          : json({ error: { code: 'MARATHON_MEMBERSHIP_REQUIRED', message: 'Нет membership.' } }, 403);
      }
      if (url === `${api}/marathon-team-memberships` && init?.method === 'POST') {
        joined = true;
        return json({ role: 'participant' }, 201);
      }
      return responseFor(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MarathonPage />);
    expect(await screen.findByText('Присоединитесь к команде')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Код приглашения'), 'team-code');
    await user.click(screen.getByRole('button', { name: 'Присоединиться' }));

    expect(await screen.findByText('Команда Антонины')).toBeInTheDocument();
    const join = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === `${api}/marathon-team-memberships` && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(join?.[1]?.body).toBe(JSON.stringify({ joinCode: 'team-code' }));
  });
});

function responseFor(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input);
  if (url === `${api}/users/me/onboarding`) return json(onboarding());
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
        weight: { status: 'unknown', dailyPercent: null },
        wellness: { status: 'unknown', markedCount: null },
        captainTask: { status: 'notAssigned' },
      },
    ],
    podiums: { weight: null, wellness: null, captainTask: null },
  };
}

function consent() {
  return {
    providerMode: 'fake',
    externalProviderEnabled: false,
    documentVersion: 'v1',
    disclosure: 'Ответы создаёт тестовый режим.',
    accepted: false,
    acceptedAt: null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
