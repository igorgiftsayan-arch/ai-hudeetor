import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderConsentNotice } from './provider-consent';

describe('ProviderConsentNotice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the current disclosure version and reuses its idempotency key on retry', async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    let calls = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) return Promise.resolve(json({ error: { message: 'Временная ошибка.' } }, 500));
      return Promise.resolve(json({ accepted: true, documentVersion: 'v2', acceptedAt: '2026-09-24T00:00:00.000Z' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ProviderConsentNotice
        consent={{ providerMode: 'genapi', externalProviderEnabled: true, documentVersion: 'v2', disclosure: 'Передадим запрос внешнему провайдеру.', accepted: false, acceptedAt: null }}
        csrfToken="csrf-token"
        onAccepted={onAccepted}
        onSessionExpired={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Разрешить обработку' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Временная ошибка.');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onAccepted).toHaveBeenCalledTimes(1);
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(first.headers).get('Idempotency-Key')).toBe(new Headers(second.headers).get('Idempotency-Key'));
    expect(first.body).toBe(JSON.stringify({ accepted: true, documentVersion: 'v2' }));
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
