import {
  GenApiAiProviderAdapter,
  type AiTechnicalLogRecord,
} from '@atlas/backend';

const request = {
  operationId: 'operation-1',
  promptVersion: 'quick-reply-v1' as const,
  personaId: 'gentleFriend',
  memoryContext: 'Не любит рыбу',
  messages: [
    { role: 'user' as const, content: 'Первое сообщение' },
    { role: 'assistant' as const, content: 'Первый ответ' },
    { role: 'user' as const, content: 'Второе сообщение' },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GenApiAiProviderAdapter', () => {
  it('sends system prompt and conversation history and normalizes usage', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      response({
        id: 'response-1',
        choices: [{ message: { content: 'Полезный ответ' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
      }),
    );
    const logs: AiTechnicalLogRecord[] = [];
    const adapter = new GenApiAiProviderAdapter(
      {
        apiKey: 'secret-key',
        baseUrl: 'https://proxy.gen-api.ru/v1',
        model: 'grok-4-5',
        timeoutMs: 60_000,
      },
      fetcher,
      (record) => logs.push(record),
    );

    await expect(adapter.execute(request)).resolves.toMatchObject({
      kind: 'success',
      text: 'Полезный ответ',
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      providerReference: 'response-1',
    });
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.model).toBe('grok-4-5');
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[0].content).toContain('Не любит рыбу');
    expect(payload.messages.slice(1)).toEqual(request.messages);
    expect(String(init.headers)).not.toContain('secret-key');
    expect(logs[0]).toMatchObject({
      provider: 'genapi',
      model: 'grok-4-5',
      requestId: 'operation-1',
      responseId: 'response-1',
      inputTokens: 12,
      outputTokens: 7,
      totalTokens: 19,
      status: 'succeeded',
    });
    expect(JSON.stringify(logs)).not.toContain('Первое сообщение');
    expect(JSON.stringify(logs)).not.toContain('Полезный ответ');
    expect(JSON.stringify(logs)).not.toContain('secret-key');
  });

  it.each([401, 403, 404, 429])(
    'maps HTTP %s to a refundable technical error',
    async (status) => {
      const adapter = new GenApiAiProviderAdapter(
        {
          apiKey: 'secret',
          baseUrl: 'https://proxy.gen-api.ru/v1',
          model: 'grok-4-5',
          timeoutMs: 60_000,
        },
        jest.fn().mockResolvedValue(response({ error: 'raw body' }, status)),
      );
      await expect(adapter.execute(request)).resolves.toMatchObject({
        kind: 'technicalError',
      });
    },
  );

  it.each([
    { choices: [] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: '' } }] },
  ])('rejects empty or malformed responses', async (body) => {
    const adapter = new GenApiAiProviderAdapter(
      {
        apiKey: 'secret',
        baseUrl: 'https://proxy.gen-api.ru/v1',
        model: 'grok-4-5',
        timeoutMs: 60_000,
      },
      jest.fn().mockResolvedValue(response(body)),
    );
    await expect(adapter.execute(request)).resolves.toEqual({
      kind: 'technicalError',
      errorClass: 'invalidProviderResponse',
    });
  });

  it('retries one confirmed connection failure and succeeds', async () => {
    const connectionError = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(
        response({
          id: 'response-2',
          choices: [{ message: { content: 'После retry' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    const adapter = new GenApiAiProviderAdapter(
      {
        apiKey: 'secret',
        baseUrl: 'https://proxy.gen-api.ru/v1',
        model: 'grok-4-5',
        timeoutMs: 60_000,
      },
      fetcher,
    );
    await expect(adapter.execute(request)).resolves.toMatchObject({
      kind: 'success',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps an abort after dispatch to outcomeUnknown without retry', async () => {
    const fetcher = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const adapter = new GenApiAiProviderAdapter(
      {
        apiKey: 'secret',
        baseUrl: 'https://proxy.gen-api.ru/v1',
        model: 'grok-4-5',
        timeoutMs: 1,
      },
      fetcher,
    );
    await expect(adapter.execute(request)).resolves.toEqual({
      kind: 'outcomeUnknown',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
