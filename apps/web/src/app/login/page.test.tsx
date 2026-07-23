import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('login screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in a completed user and opens today', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/sessions`) {
          expect(init?.method).toBe('POST');
          expect(init?.body).toBe(
            JSON.stringify({
              email: 'owner@example.test',
              password: 'test-password-42',
            }),
          );
          return json({
            userId: 'user-1',
            expiresAt: '2026-07-22T05:00:00.000Z',
            onboardingStatus: 'registered',
            csrfToken: 'csrf-token',
          });
        }
        if (url === `${api}/users/me/onboarding`) {
          return json({ status: 'completed', csrfToken: 'csrf-token' });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'test-password-42');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
  });

  it('disables the action while login is in progress', async () => {
    const user = userEvent.setup();
    let finishLogin!: (response: Response) => void;
    const pendingLogin = new Promise<Response>((resolve) => {
      finishLogin = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === `${api}/sessions`) return pendingLogin;
        return json({ status: 'completed', csrfToken: 'csrf-token' });
      }),
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'test-password-42');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByRole('button', { name: 'Входим…' })).toBeDisabled();
    finishLogin(
      json({
        userId: 'user-1',
        expiresAt: '2026-07-22T05:00:00.000Z',
        onboardingStatus: 'registered',
        csrfToken: 'csrf-token',
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/today'));
  });

  it('shows a clear error for invalid credentials', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: {
              code: 'AUTHENTICATION_FAILED',
              message: 'Authentication failed',
              request_id: 'request-1',
            },
          },
          401,
        ),
      ),
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный email или пароль.',
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('sends an incomplete user back to onboarding', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === `${api}/sessions`)
          return json({
            userId: 'user-1',
            expiresAt: '2026-07-22T05:00:00.000Z',
            onboardingStatus: 'registered',
            csrfToken: 'csrf-token',
          });
        return json({ status: 'profileReady', csrfToken: 'csrf-token' });
      }),
    );

    render(<LoginPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'test-password-42');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding'),
    );
  });
});

function json(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
