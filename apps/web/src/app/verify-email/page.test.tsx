import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VerifyEmailPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('email verification screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.history.replaceState(
      null,
      '',
      '/verify-email?next=/onboarding#token=mail-token',
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/verify-email');
  });

  it('keeps a fragment token out of the address bar until the user confirms it', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `${api}/users/me/onboarding`)
          return json({ status: 'registered', csrfToken: 'csrf-token' });
      if (String(input) === `${api}/email-verifications`) {
          expect(init?.method).toBe('POST');
          expect(init?.body).toBe(JSON.stringify({ token: 'mail-token' }));
        return json({ emailVerified: true }, 200);
      }
      if (String(input) === `${api}/users/me`)
        return json({ emailVerified: true, onboardingStatus: 'registered' });
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<VerifyEmailPage />);

    expect(window.location.hash).toBe('');
    await user.click(screen.getByRole('button', { name: 'Подтвердить email' }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding'),
    );
  });

  it('resends a verification message for a signed-in user with CSRF protection', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/verify-email');
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === `${api}/users/me/onboarding`)
          return json({ status: 'completed', csrfToken: 'csrf-token' });
        if (String(input) === `${api}/email-verification-requests`) {
          expect(init?.method).toBe('POST');
          expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe(
            'csrf-token',
          );
          return json({ accepted: true }, 202);
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<VerifyEmailPage />);

    await user.click(
      screen.getByRole('button', { name: 'Отправить письмо ещё раз' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Если адрес доступен, письмо уже отправлено.',
    );
  });

  it('lets an unverified existing user continue to the requested non-AI route', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/verify-email?next=/today');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === `${api}/users/me/onboarding`)
          return json({ status: 'completed', csrfToken: 'csrf-token' });
        throw new Error(`Unexpected fetch: ${String(input)}`);
      }),
    );

    render(<VerifyEmailPage />);
    await user.click(screen.getByRole('button', { name: 'Продолжить без AI' }));

    expect(replaceMock).toHaveBeenCalledWith('/today');
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
