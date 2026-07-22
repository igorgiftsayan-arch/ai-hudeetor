import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickReplyPage from './page';

const api = 'http://localhost:3001/api/v1';

describe('quick reply screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the fake-runtime notice, submits a priced operation and polls its response', async () => {
    const user = userEvent.setup();
    let operationReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`)
          return json({ status: 'completed', csrfToken: 'csrf-token' });
        if (url === `${api}/ai-action-prices/quick-reply`)
          return json({
            actionType: 'quickReply',
            priceTokens: 1,
            priceVersion: 1,
          });
        if (url === `${api}/ai-conversations`)
          return json({ id: 'conversation-1' }, 201);
        if (url === `${api}/ai/operations`)
          return json(
            {
              id: 'operation-1',
              status: 'queued',
              conversationId: 'conversation-1',
              inputMessageId: 'message-1',
              reservedTokens: 1,
              priceVersion: 1,
              pollUrl: '/api/v1/ai/operations/operation-1',
              runtimeAdapter: 'fake',
            },
            202,
          );
        if (url === `${api}/ai/operations/operation-1`) {
          operationReads += 1;
          return json({
            id: 'operation-1',
            status: operationReads === 1 ? 'processing' : 'succeeded',
            conversationId: 'conversation-1',
            inputMessageId: 'message-1',
            outputMessageId: 'message-2',
            responseText: 'Я рядом. Сделаем один спокойный шаг.',
            reservedTokens: 1,
            priceVersion: 1,
            pollUrl: '/api/v1/ai/operations/operation-1',
            runtimeAdapter: 'fake',
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    expect(
      await screen.findByText(
        'Тестовый AI-адаптер. Ответ не создан реальной моделью.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Цена: 1 токен')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Сегодня' })).toHaveAttribute(
      'href',
      '/today',
    );

    await user.type(
      screen.getByLabelText('Сообщение'),
      'Мне трудно не сорваться',
    );
    await user.click(
      screen.getByRole('button', { name: 'Отправить за 1 токен' }),
    );
    expect(
      await screen.findByText('Запрос обрабатывается'),
    ).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(
      await screen.findByText('Я рядом. Сделаем один спокойный шаг.'),
    ).toBeInTheDocument();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
