import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('onboarding flow', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists the profile, persona and completion through the existing API', async () => {
    const user = userEvent.setup();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url === `${api}/users/me/onboarding`)
          return json(onboarding('registered'));
        if (url === `${api}/users/me/profile`) {
          expect(init?.method).toBe('PATCH');
          expect(JSON.parse(String(init?.body))).toEqual({
            timezone: 'Asia/Irkutsk',
            consents: [
              {
                consentType: 'aiWellnessNotice',
                documentVersion: 'notice-v1',
                accepted: true,
              },
            ],
          });
          return json({
            userId: 'user-1',
            timezone: 'Asia/Irkutsk',
            displayName: null,
            targetWeightKg: null,
            onboardingStatus: 'profileReady',
          });
        }
        if (url === `${api}/users/me/ai-preference`) {
          expect(init?.method).toBe('PUT');
          expect(JSON.parse(String(init?.body))).toEqual({
            personaId: 'gentleFriend',
          });
          return json({
            userId: 'user-1',
            personaId: 'gentleFriend',
            strictness: 'supportive',
            responseLength: 'balanced',
            onboardingStatus: 'personaReady',
          });
        }
        if (url === `${api}/users/me/onboarding-completions`) {
          expect(init?.method).toBe('POST');
          expect(
            new Headers(init?.headers).get('Idempotency-Key'),
          ).toBeTruthy();
          return json({
            onboardingStatus: 'completed',
            starterTokensGranted: 100,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<OnboardingPage />);
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(
      await screen.findByRole('button', { name: 'Бережный друг' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Завершить настройку' }),
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
    expect(requests.map((request) => request.url)).toEqual([
      `${api}/users/me/onboarding`,
      `${api}/users/me/profile`,
      `${api}/users/me/ai-preference`,
      `${api}/users/me/onboarding-completions`,
    ]);
  });

  it('returns an expired session to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: {
              code: 'AUTHENTICATION_FAILED',
              message: 'Session expired',
            },
          },
          401,
        ),
      ),
    );

    render(<OnboardingPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('retries a lost completion response with the same idempotency key', async () => {
    const user = userEvent.setup();
    const completionKeys: string[] = [];
    let completionCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`)
          return json(onboarding('personaReady'));
        if (url === `${api}/users/me/onboarding-completions`) {
          completionCalls += 1;
          completionKeys.push(
            new Headers(init?.headers).get('Idempotency-Key') ?? '',
          );
          if (completionCalls === 1) throw new TypeError('Failed to fetch');
          return json({
            onboardingStatus: 'completed',
            starterTokensGranted: 100,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<OnboardingPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Завершить настройку' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.',
    );

    await user.click(
      screen.getByRole('button', { name: 'Завершить настройку' }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
    expect(completionKeys).toHaveLength(2);
    expect(completionKeys[0]).toBeTruthy();
    expect(completionKeys[1]).toBe(completionKeys[0]);
  });

  it('redirects an already completed user to today', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(onboarding('completed'))),
    );

    render(<OnboardingPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
  });
});

function onboarding(status: string) {
  return {
    status,
    completedSteps: [],
    requiredSteps: [],
    canComplete: false,
    aiWellnessNoticeVersion: 'notice-v1',
    csrfToken: 'csrf-token',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
