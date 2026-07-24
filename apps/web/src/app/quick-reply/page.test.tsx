import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickReplyPage from './page';

const api = '/api/v1';
const conversationId = '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe('AI chat screen', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads the persisted conversation as visually separated messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return conversation([
            message('message-1', 'user', 'Вечером мне особенно трудно.'),
            message(
              'message-2',
              'assistant',
              'Давайте выберем один спокойный шаг на вечер.',
            ),
          ]);
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation([
            message('message-1', 'user', 'Вечером мне особенно трудно.'),
            message(
              'message-2',
              'assistant',
              'Давайте выберем один спокойный шаг на вечер.',
            ),
          ]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);

    const feed = await screen.findByRole('log', { name: 'Переписка с AI' });
    expect(within(feed).getByText('Вечером мне особенно трудно.')).toHaveClass(
      'chat-message-user',
    );
    expect(
      within(feed).getByText('Давайте выберем один спокойный шаг на вечер.'),
    ).toHaveClass('chat-message-assistant');
    expect(
      screen.queryByRole('heading', { name: 'Быстрый ответ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 токен')).toBeInTheDocument();
  });

  it('shows sent messages, waiting state and backend assistant history', async () => {
    const user = userEvent.setup();
    const messages: ChatMessage[] = [];
    let operationReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return notFoundConversation();
        if (url === `${api}/ai-conversations`)
          return json({ id: conversationId }, 201);
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation(messages);
        if (url === `${api}/ai/operations` && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { content: string };
          messages.push(message('message-user', 'user', body.content));
          return operation('queued', 'operation-1', 'message-user');
        }
        if (url === `${api}/ai/operations/operation-1`) {
          operationReads += 1;
          if (operationReads === 1)
            return operation('processing', 'operation-1', 'message-user');
          messages.push(
            message(
              'message-assistant',
              'assistant',
              'Сделаем один небольшой следующий шаг сегодня.',
            ),
          );
          return operation(
            'succeeded',
            'operation-1',
            'message-user',
            'message-assistant',
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(screen.getByLabelText('Сообщение'), 'Мне нужен план');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText('Мне нужен план')).toBeInTheDocument();
    expect(screen.getByText('AI готовит ответ…')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(
      await screen.findByText('Сделаем один небольшой следующий шаг сегодня.'),
    ).toBeInTheDocument();
  });

  it('uses a new idempotency key for each new message', async () => {
    const user = userEvent.setup();
    const operationKeys: string[] = [];
    const messages: ChatMessage[] = [];
    let operationNumber = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return notFoundConversation();
        if (url === `${api}/ai-conversations`)
          return json({ id: conversationId }, 201);
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation(messages);
        if (url === `${api}/ai/operations` && init?.method === 'POST') {
          operationNumber += 1;
          operationKeys.push(
            new Headers(init.headers).get('Idempotency-Key') ?? '',
          );
          const body = JSON.parse(String(init.body)) as { content: string };
          messages.push(
            message(`user-${operationNumber}`, 'user', body.content),
          );
          return operation(
            'queued',
            `operation-${operationNumber}`,
            `user-${operationNumber}`,
          );
        }
        if (url.startsWith(`${api}/ai/operations/`)) {
          const id = url.at(-1)!;
          messages.push(message(`assistant-${id}`, 'assistant', `Ответ ${id}`));
          return operation(
            'succeeded',
            `operation-${id}`,
            `user-${id}`,
            `assistant-${id}`,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });

    await user.type(screen.getByLabelText('Сообщение'), 'Первое сообщение');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    await screen.findByText('Ответ 1');

    await user.type(screen.getByLabelText('Сообщение'), 'Второе сообщение');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    await screen.findByText('Ответ 2');

    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).not.toBe(operationKeys[1]);
  });

  it('retries a lost response with the same key and an in-chat error', async () => {
    const user = userEvent.setup();
    const operationKeys: string[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return notFoundConversation();
        if (url === `${api}/ai-conversations`)
          return json({ id: conversationId }, 201);
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation([]);
        if (url === `${api}/ai/operations` && init?.method === 'POST') {
          attempts += 1;
          operationKeys.push(
            new Headers(init.headers).get('Idempotency-Key') ?? '',
          );
          if (attempts === 1) throw new TypeError('Failed to fetch');
          return operation('queued', 'operation-1', 'message-user');
        }
        if (url === `${api}/ai/operations/operation-1`)
          return operation(
            'succeeded',
            'operation-1',
            'message-user',
            'message-assistant',
          );
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(screen.getByLabelText('Сообщение'), 'Повтори безопасно');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(
      'Не удалось отправить сообщение. Проверьте связь и повторите.',
    );
    await user.click(
      within(error).getByRole('button', { name: 'Повторить отправку' }),
    );

    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).toBe(operationKeys[1]);
  });

  it('keeps the same key after an ambiguous server response', async () => {
    const user = userEvent.setup();
    const operationKeys: string[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`) return conversation([]);
        if (url === `${api}/ai/operations` && init?.method === 'POST') {
          attempts += 1;
          operationKeys.push(
            new Headers(init.headers).get('Idempotency-Key') ?? '',
          );
          if (attempts === 1)
            return json(
              {
                error: {
                  code: 'GATEWAY_TIMEOUT',
                  message: 'Unexpected server error',
                },
              },
              504,
            );
          return operation('queued', 'operation-1', 'message-user');
        }
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation([]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(
      screen.getByLabelText('Сообщение'),
      'Без двойного списания',
    );
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    const error = await screen.findByRole('alert');
    expect(error).not.toHaveTextContent('Unexpected server error');
    await user.click(
      within(error).getByRole('button', { name: 'Повторить отправку' }),
    );

    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).toBe(operationKeys[1]);
  });

  it('keeps the composer disabled while the initial request is in flight', async () => {
    const user = userEvent.setup();
    let finishRequest!: (response: Response) => void;
    const pendingRequest = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`) return conversation([]);
        if (url === `${api}/ai/operations` && init?.method === 'POST')
          return pendingRequest;
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation([]);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    const composer = screen.getByLabelText('Сообщение');
    await user.type(composer, 'Не стирай этот текст');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(composer).toBeDisabled();
    await act(async () => {
      finishRequest(operation('queued', 'operation-1', 'message-user'));
    });
  });

  it('keeps polling and blocks new messages while the outcome is unknown', async () => {
    const user = userEvent.setup();
    const messages: ChatMessage[] = [];
    let operationReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return conversation(messages);
        if (url === `${api}/ai/operations` && init?.method === 'POST') {
          messages.push(message('message-user', 'user', 'Статус ответа'));
          return operation('queued', 'operation-1', 'message-user');
        }
        if (url === `${api}/ai-conversations/${conversationId}`)
          return conversation(messages);
        if (url === `${api}/ai/operations/operation-1`) {
          operationReads += 1;
          if (operationReads === 1)
            return operation('outcomeUnknown', 'operation-1', 'message-user');
          messages.push(
            message('message-assistant', 'assistant', 'Ответ подтверждён.'),
          );
          return operation(
            'succeeded',
            'operation-1',
            'message-user',
            'message-assistant',
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(screen.getByLabelText('Сообщение'), 'Статус ответа');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });

    expect(screen.getByLabelText('Сообщение')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Статус ответа уточняется.',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(await screen.findByText('Ответ подтверждён.')).toBeInTheDocument();
  });

  it('retries loading persisted history after a succeeded poll', async () => {
    const user = userEvent.setup();
    let conversationReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`) return conversation([]);
        if (url === `${api}/ai/operations` && init?.method === 'POST')
          return operation('queued', 'operation-1', 'message-user');
        if (url === `${api}/ai/operations/operation-1`)
          return operation(
            'succeeded',
            'operation-1',
            'message-user',
            'message-assistant',
          );
        if (url === `${api}/ai-conversations/${conversationId}`) {
          conversationReads += 1;
          if (conversationReads === 2) throw new TypeError('Failed to fetch');
          return conversation(
            conversationReads === 1
              ? [message('message-user', 'user', 'Загрузи ответ')]
              : [
                  message('message-user', 'user', 'Загрузи ответ'),
                  message(
                    'message-assistant',
                    'assistant',
                    'История восстановлена.',
                  ),
                ],
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(screen.getByLabelText('Сообщение'), 'Загрузи ответ');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });

    expect(
      await screen.findByText('История восстановлена.'),
    ).toBeInTheDocument();
  });

  it('finishes the initial history refresh before terminal polling', async () => {
    const user = userEvent.setup();
    let finishInitialHistory!: (response: Response) => void;
    const initialHistory = new Promise<Response>((resolve) => {
      finishInitialHistory = resolve;
    });
    let conversationReads = 0;
    let operationReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`) return conversation([]);
        if (url === `${api}/ai/operations` && init?.method === 'POST')
          return operation('queued', 'operation-1', 'message-user');
        if (url === `${api}/ai-conversations/${conversationId}`) {
          conversationReads += 1;
          if (conversationReads === 1) return initialHistory;
          return conversation([
            message('message-user', 'user', 'Последовательная история'),
            message('message-assistant', 'assistant', 'Ответ не потерян.'),
          ]);
        }
        if (url === `${api}/ai/operations/operation-1`) {
          operationReads += 1;
          return operation(
            'succeeded',
            'operation-1',
            'message-user',
            'message-assistant',
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<QuickReplyPage />);
    await screen.findByRole('log', { name: 'Переписка с AI' });
    await user.type(
      screen.getByLabelText('Сообщение'),
      'Последовательная история',
    );
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });

    expect(operationReads).toBe(1);
    expect(await screen.findByText('Ответ не потерян.')).toBeInTheDocument();
    await act(async () => {
      finishInitialHistory(
        conversation([
          message('message-user', 'user', 'Последовательная история'),
        ]),
      );
    });

    expect(screen.getByText('Ответ не потерян.')).toBeInTheDocument();
  });
});

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

function onboarding(): Response {
  return json({ status: 'completed', csrfToken: 'csrf-token' });
}

function price(): Response {
  return json({
    actionType: 'quickReply',
    priceTokens: 1,
    priceVersion: 1,
  });
}

function message(
  id: string,
  role: ChatMessage['role'],
  content: string,
): ChatMessage {
  return { id, role, content, createdAt: '2026-07-24T02:00:00.000Z' };
}

function conversation(messages: ChatMessage[]): Response {
  return json({ id: conversationId, messages: [...messages] });
}

function notFoundConversation(): Response {
  return json(
    {
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Conversation not found',
        details: {},
        request_id: 'request-1',
      },
    },
    404,
  );
}

function operation(
  status: 'queued' | 'processing' | 'succeeded' | 'outcomeUnknown',
  id: string,
  inputMessageId: string,
  outputMessageId?: string,
): Response {
  return json(
    {
      id,
      status,
      conversationId,
      inputMessageId,
      outputMessageId,
      reservedTokens: 1,
      priceVersion: 1,
      pollUrl: `${api}/ai/operations/${id}`,
      runtimeAdapter: 'fake',
    },
    status === 'queued' ? 202 : 200,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
