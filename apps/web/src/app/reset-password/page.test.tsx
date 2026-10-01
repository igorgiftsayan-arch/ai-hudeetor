import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from './page';

const api = '/api/v1';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('reset password screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.history.replaceState(null, '', '/reset-password#token=reset-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/reset-password');
  });

  it('reads a fragment token once, removes it from the URL, and changes the password on explicit submit', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${api}/password-resets`);
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({
            token: 'reset-token',
            newPassword: 'new-password-42',
          }),
        );
        return json({}, 200);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ResetPasswordPage />);

    expect(window.location.hash).toBe('');
    await user.type(
      screen.getByLabelText('Новый пароль', { selector: 'input' }),
      'new-password-42',
    );
    await user.click(
      screen.getByRole('button', { name: 'Сохранить новый пароль' }),
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
