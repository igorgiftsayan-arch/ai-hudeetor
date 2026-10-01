import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';

const api = '/api/v1';

describe('forgot password screen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('always shows a neutral success message after requesting a reset link', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${api}/password-reset-requests`);
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({ email: 'owner@example.test' }),
        );
        return json({ accepted: true }, 202);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText('Email'), 'owner@example.test');
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Если такой адрес зарегистрирован, мы отправили ссылку для смены пароля.',
    );
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
