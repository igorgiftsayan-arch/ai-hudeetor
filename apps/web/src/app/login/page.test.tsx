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
    vi.unstubAllEnvs();
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

  it('creates a self-registered adult session with explicit consents', async () => {
    const user = userEvent.setup();
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'test-v1');
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'test-v1');
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${api}/registrations`);
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBeTruthy();
        expect(init?.body).toBe(
          JSON.stringify({
            email: 'new@example.test',
            password: 'new-password-42',
            ageConfirmed: true,
            consents: [
              {
                consentType: 'terms',
                documentVersion: 'test-v1',
                accepted: true,
              },
              {
                consentType: 'privacy',
                documentVersion: 'test-v1',
                accepted: true,
              },
            ],
          }),
        );
        return json({
          userId: 'new-user',
          onboardingStatus: 'registered',
          sessionExpiresAt: '2026-09-30T00:00:00.000Z',
          csrfToken: 'csrf-token',
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'new-password-42');
    for (const checkbox of screen.getAllByRole('checkbox'))
      await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding'),
    );
  });

  it('retries an indeterminate registration with the same idempotency key', async () => {
    const user = userEvent.setup();
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'test-v1');
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'test-v1');
    let calls = 0;
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
        if (calls === 1) throw new TypeError('Failed to fetch');
        return json({
          userId: 'new-user',
          onboardingStatus: 'registered',
          sessionExpiresAt: '2026-09-30T00:00:00.000Z',
          csrfToken: 'csrf-token',
        });
      }),
    );

    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'new-password-42');
    for (const checkbox of screen.getAllByRole('checkbox'))
      await user.click(checkbox);

    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.',
    );

    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding'),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('issues a new registration key when data changes after a lost response', async () => {
    const user = userEvent.setup();
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'test-v1');
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'test-v1');
    const keys: string[] = [];
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        keys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
        if (calls === 1) throw new TypeError('Failed to fetch');
        return json({
          userId: 'new-user',
          onboardingStatus: 'registered',
          sessionExpiresAt: '2026-09-30T00:00:00.000Z',
          csrfToken: 'csrf-token',
        });
      }),
    );

    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await user.type(screen.getByLabelText('Email'), 'first@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'new-password-42');
    for (const checkbox of screen.getAllByRole('checkbox'))
      await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await screen.findByRole('alert');

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'second@example.test');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith('/onboarding'),
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('explains an outdated consent version without showing the raw API text', async () => {
    const user = userEvent.setup();
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_TERMS_VERSION', 'old-v1');
    vi.stubEnv('NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION', 'old-v1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            error: {
              code: 'CONSENT_VERSION_OUTDATED',
              message: 'A current consent document version is required',
            },
          },
          409,
        ),
      ),
    );

    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'new-password-42');
    for (const checkbox of screen.getAllByRole('checkbox'))
      await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Версия условий изменилась. Обновите страницу и ознакомьтесь с актуальными документами.',
    );
  });
});

function json(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
