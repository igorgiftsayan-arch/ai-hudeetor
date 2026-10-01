import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderConsentNotice } from './provider-consent';

describe('ProviderConsentNotice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the disclosure returned by the active consent contract', () => {
    render(
      <ProviderConsentNotice
        consent={{
          currentVersion: 'test-v1',
          acceptedVersion: null,
          disclosure: 'Сообщения будут переданы внешнему AI-провайдеру.',
          accepted: false,
        }}
        csrfToken="csrf-token"
        onAccepted={vi.fn()}
        onSessionExpired={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Сообщения будут переданы внешнему AI-провайдеру.',
      ),
    ).toBeInTheDocument();
  });

  it('posts the active consent version and permits a safe retry after a failed response', async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(() => {
      calls += 1;
      if (calls === 1)
        return Promise.resolve(
          json({ error: { message: 'Временная ошибка.' } }, 500),
        );
      return Promise.resolve(
        json({
          accepted: true,
          currentVersion: 'v2',
          acceptedVersion: 'v2',
          disclosure: 'Передадим запрос внешнему провайдеру.',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ProviderConsentNotice
        consent={{
          currentVersion: 'v2',
          acceptedVersion: null,
          disclosure: 'Передадим запрос внешнему провайдеру.',
          accepted: false,
        }}
        csrfToken="csrf-token"
        onAccepted={onAccepted}
        onSessionExpired={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Разрешить обработку' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Временная ошибка.',
    );
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onAccepted).toHaveBeenCalledTimes(1);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(first.method).toBe('POST');
    expect(new Headers(first.headers).get('X-CSRF-Token')).toBe('csrf-token');
    expect(second.method).toBe('POST');
    expect(first.body).toBe(
      JSON.stringify({ accepted: true, documentVersion: 'v2' }),
    );
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
