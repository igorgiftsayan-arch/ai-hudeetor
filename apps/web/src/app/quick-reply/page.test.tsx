import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickReplyPage from './page';

const api = '/api/v1';
const conversationId = '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af';
const { replaceMock, contextReload } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  contextReload: { current: undefined as (() => Promise<void>) | undefined },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('../../features/ai-companion/provider-consent', () => ({
  loadProviderConsent: vi.fn(async () => ({
    providerMode: 'fake',
    externalProviderEnabled: false,
    documentVersion: 'v1',
    disclosure: 'Тестовый AI.',
    accepted: false,
    acceptedAt: null,
  })),
  ProviderConsentNotice: ({
    onAccepted,
  }: {
    onAccepted: () => Promise<void>;
  }) => {
    contextReload.current = onAccepted;
    return null;
  },
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

  it.each(['refunded', 'notRefunded'] as const)(
    'restores failed history after remount with explicit %s ledger status',
    async (refundStatus) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return conversation([
            {
              ...message('failed-input', 'user', 'Сохранённое сообщение'),
              operation: {
                id: 'failed-operation',
                status: 'technicalError',
                refundStatus,
              },
            },
          ]);
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const first = render(<QuickReplyPage />);
      await screen.findByText('Сохранённое сообщение');
      first.unmount();
      render(<QuickReplyPage />);
      await screen.findByText('Сохранённое сообщение');
      const expected =
        refundStatus === 'refunded'
          ? 'Ответ не получен. Зарезервированный токен возвращён.'
          : 'Ответ не получен. Возврат токена пока не подтверждён.';
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.every(
          ([input]) => !String(input).includes('/ai/operations'),
        ),
      ).toBe(true);
      expect(
        screen.queryByRole('button', { name: 'Повторить отправку' }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['queued', 'processing', 'outcomeUnknown'] as const)(
    'resumes persisted %s operation by GET and loads answer without resubmitting',
    async (status) => {
      let recovered = false;
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === `${api}/users/me/onboarding`) return onboarding();
          if (url === `${api}/ai-action-prices/quick-reply`) return price();
          if (
            url === `${api}/ai-conversations/current` ||
            url === `${api}/ai-conversations/${conversationId}`
          )
            return conversation([
              {
                ...message('saved-input', 'user', 'Уже отправлено'),
                operation: {
                  id: 'saved-operation',
                  status: recovered ? 'succeeded' : status,
                  refundStatus: 'notRefunded',
                },
              },
              ...(recovered
                ? [message('saved-answer', 'assistant', 'Сохранённый ответ')]
                : []),
            ]);
          if (url === `${api}/ai/operations/saved-operation` && !init?.method) {
            recovered = true;
            return operation(
              'succeeded',
              'saved-operation',
              'saved-input',
              'saved-answer',
            );
          }
          throw new Error(`Unexpected fetch: ${url}`);
        },
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<QuickReplyPage />);
      await screen.findByText('Уже отправлено');
      expect(screen.getByLabelText('Сообщение')).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100);
      });
      expect(await screen.findByText('Сохранённый ответ')).toBeInTheDocument();
      expect(screen.getByLabelText('Сообщение')).toBeEnabled();
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
      ).toBe(false);
    },
  );

  it.each(['refunded', 'notRefunded', undefined] as const)(
    'uses explicit %s marker when a recovered pending operation fails',
    async (refundStatus) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url === `${api}/users/me/onboarding`) return onboarding();
          if (url === `${api}/ai-action-prices/quick-reply`) return price();
          if (url === `${api}/ai-conversations/current`)
            return conversation([
              {
                ...message('saved-input', 'user', 'Проверить исход'),
                operation: {
                  id: 'saved-operation',
                  status: 'processing',
                  refundStatus: 'notRefunded',
                },
              },
            ]);
          if (url === `${api}/ai/operations/saved-operation`)
            return json({
              id: 'saved-operation',
              status: 'technicalError',
              conversationId,
              inputMessageId: 'saved-input',
              refundStatus,
            });
          throw new Error(`Unexpected fetch: ${url}`);
        }),
      );
      render(<QuickReplyPage />);
      await screen.findByText('Проверить исход');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100);
      });
      expect(
        await screen.findByText(
          refundStatus === 'refunded'
            ? 'Ответ не получен. Зарезервированный токен возвращён.'
            : 'Ответ не получен. Возврат токена пока не подтверждён.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Сообщение')).toBeEnabled();
    },
  );

  it.each(['poll', 'history'] as const)(
    'ignores old %s response after context reload',
    async (boundary) => {
      let finish!: (response: Response) => void;
      const deferred = new Promise<Response>((resolve) => {
        finish = resolve;
      });
      let newOwner = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return newOwner
            ? json({
                id: 'new-conversation',
                messages: [message('new', 'user', 'Новый аккаунт')],
              })
            : conversation([
                {
                  ...message('old', 'user', 'Старый аккаунт'),
                  operation: {
                    id: 'old-operation',
                    status: 'processing',
                    refundStatus: 'notRefunded',
                  },
                },
              ]);
        if (url === `${api}/ai/operations/old-operation`)
          return boundary === 'poll'
            ? deferred
            : operation('succeeded', 'old-operation', 'old', 'old-answer');
        if (url === `${api}/ai-conversations/${conversationId}`)
          return deferred;
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<QuickReplyPage />);
      await screen.findByText('Старый аккаунт');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_100);
      });
      newOwner = true;
      await act(async () => {
        await contextReload.current?.();
      });
      expect(await screen.findByText('Новый аккаунт')).toBeInTheDocument();
      await act(async () => {
        finish(
          boundary === 'poll'
            ? operation('succeeded', 'old-operation', 'old', 'old-answer')
            : conversation([message('old-answer', 'assistant', 'Чужой ответ')]),
        );
      });
      expect(screen.queryByText('Чужой ответ')).not.toBeInTheDocument();
      expect(screen.queryByText('Старый аккаунт')).not.toBeInTheDocument();
      expect(screen.getByText('Новый аккаунт')).toBeInTheDocument();
      expect(screen.getByLabelText('Сообщение')).toBeEnabled();
      if (boundary === 'poll')
        expect(
          fetchMock.mock.calls.some(
            ([url]) =>
              String(url) === `${api}/ai-conversations/${conversationId}`,
          ),
        ).toBe(false);
    },
  );

  it('does not continue old polling into history after unmount', async () => {
    let finish!: (response: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${api}/users/me/onboarding`) return onboarding();
      if (url === `${api}/ai-action-prices/quick-reply`) return price();
      if (url === `${api}/ai-conversations/current`)
        return conversation([
          {
            ...message('old', 'user', 'До выхода'),
            operation: {
              id: 'old-operation',
              status: 'processing',
              refundStatus: 'notRefunded',
            },
          },
        ]);
      if (url === `${api}/ai/operations/old-operation`) return deferred;
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<QuickReplyPage />);
    await screen.findByText('До выхода');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    view.unmount();
    await act(async () => {
      finish(operation('succeeded', 'old-operation', 'old'));
    });
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url) === `${api}/ai-conversations/${conversationId}`,
      ),
    ).toBe(false);
  });

  it.each(['refunded', 'notRefunded'] as const)(
    'shows persisted recovery deadline with %s marker and no resend',
    async (refundStatus) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${api}/users/me/onboarding`) return onboarding();
        if (url === `${api}/ai-action-prices/quick-reply`) return price();
        if (url === `${api}/ai-conversations/current`)
          return conversation([
            {
              ...message('expired', 'user', 'Старое сообщение'),
              operation: {
                id: 'expired-op',
                status: 'technicalError',
                errorCode: 'recoveryDeadlineExceeded',
                refundStatus,
              },
            },
          ]);
        throw new Error(`Unexpected fetch: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      render(<QuickReplyPage />);
      expect(
        await screen.findByText(
          new RegExp('Ответ не удалось восстановить за 5 минут'),
        ),
      ).toHaveTextContent(
        refundStatus === 'refunded'
          ? 'Зарезервированный токен возвращён.'
          : 'Возврат токена пока не подтверждён.',
      );
      expect(
        screen.queryByRole('button', { name: 'Повторить отправку' }),
      ).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/ai/operations'),
        ),
      ).toBe(false);
    },
  );

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
    const outcomeUnknownAlert = screen.getByRole('alert');
    expect(outcomeUnknownAlert).toHaveTextContent('Статус ответа уточняется.');
    expect(outcomeUnknownAlert).not.toHaveTextContent('возвращён');
    expect(
      screen.queryByRole('button', { name: 'Повторить отправку' }),
    ).not.toBeInTheDocument();

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
  operation?: {
    id: string;
    status:
      | 'queued'
      | 'processing'
      | 'outcomeUnknown'
      | 'succeeded'
      | 'technicalError';
    refundStatus: 'notRefunded' | 'refunded';
    errorCode?: string;
  };
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
