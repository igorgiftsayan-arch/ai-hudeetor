import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './logout-button';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('logout button', () => {
  beforeEach(() => replaceMock.mockReset());

  afterEach(() => vi.unstubAllGlobals());

  it('ends the cookie session and returns to login', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE');
        expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe(
          'csrf-token',
        );
        return new Response(null, { status: 204 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LogoutButton csrfToken="csrf-token" />);
    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/sessions/current',
      expect.any(Object),
    );
  });
});
