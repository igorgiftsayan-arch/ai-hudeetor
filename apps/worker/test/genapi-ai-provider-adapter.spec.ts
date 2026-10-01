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
  it('persists and replays the exact native body without the proxy model selector', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response({ request_id: 123, status: 'starting' }))
      .mockResolvedValueOnce(response({ status: 'success', result: ['answer'] }));
    const adapter = new GenApiAiProviderAdapter({ apiKey: 'synthetic', baseUrl: 'https://proxy.gen-api.ru/v1', nativeBaseUrl: 'https://api.gen-api.ru/api/v1', model: 'grok-4-5', timeoutMs: 1000, pollIntervalMs: 0 }, fetcher);
    const prepared = adapter.prepareRequest(request);
    const persisted = JSON.parse(JSON.stringify(prepared));
    persisted.memoryContext = 'changed after preparation';
    persisted.personaId = 'analyst';
    persisted.messages = [{ role: 'user', content: 'changed history' }];
    await expect(adapter.execute(persisted)).resolves.toMatchObject({ kind: 'success', text: 'answer' });
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.gen-api.ru/api/v1/networks/grok-4-5');
    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    expect(body).toEqual(prepared.nativePayload);
    expect(body).not.toHaveProperty('model');
    expect(body.is_sync).toBe(false);
    expect(body.messages.slice(1)).toEqual(request.messages);
  });

  it('reads the documented full_response array without accepting request echoes', async () => {
    for (const [envelope, expectedKind] of [
      [{ full_response: [{ choices: [{ message: { content: 'answer' } }] }] }, 'success'],
      [{ input: { messages: [{ content: 'echo' }] }, result: [] }, 'technicalError'],
    ] as const) {
      const fetcher = jest.fn().mockResolvedValueOnce(response({ request_id: 123 }))
        .mockResolvedValueOnce(response({ status: 'success', ...envelope }));
      const adapter = new GenApiAiProviderAdapter({ apiKey: 'synthetic', baseUrl: 'https://proxy.gen-api.ru/v1', nativeBaseUrl: 'https://api.gen-api.ru/api/v1', model: 'grok-4-5', timeoutMs: 1000, pollIntervalMs: 0 }, fetcher);
      await expect(adapter.execute(request)).resolves.toMatchObject({ kind: expectedKind });
    }
  });

  it('persists the native async request id before polling the result', async () => {
    const accepted=jest.fn().mockResolvedValue(undefined);
    const fetcher=jest.fn()
      .mockResolvedValueOnce(response({request_id:54055527,status:'starting'}))
      .mockResolvedValueOnce(response({status:'success',cost:1.25,result:[{id:'response-native',choices:[{message:{content:'Готово'}}],usage:{prompt_tokens:3,completion_tokens:2,total_tokens:5}}]}));
    const adapter=new GenApiAiProviderAdapter({apiKey:'secret',baseUrl:'https://proxy.gen-api.ru/v1',nativeBaseUrl:'https://api.gen-api.ru/api/v1',model:'grok-4-5',timeoutMs:1000,pollIntervalMs:0},fetcher);

    await expect(adapter.execute(request,{onAccepted:accepted})).resolves.toMatchObject({kind:'success',text:'Готово',providerReference:'54055527'});
    expect(accepted).toHaveBeenCalledWith('54055527');
    expect(accepted.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]!);
  });

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

  it('keeps food/weight causality limits in the provider system message alongside confirmed history', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({ choices: [{ message: { content: 'Недостаточно сопоставимых данных.' } }] }));
    const adapter = new GenApiAiProviderAdapter({ apiKey: 'test', baseUrl: 'https://proxy.gen-api.ru/v1', model: 'grok-4-5', timeoutMs: 1000 }, fetcher);
    const foodContext = 'Подтверждённый приём пищи: рис 23 сентября. Вес 24 сентября: +0,3 кг; предыдущих сопоставимых записей нет.';
    await adapter.execute({ ...request, memoryContext: foodContext, messages: [{ role: 'user', content: 'Значит, рис вызвал привес?' }] });
    const payload = JSON.parse(String((fetcher.mock.calls[0]![1] as RequestInit).body));
    const system = payload.messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain(foodContext);
    expect(system.content).toContain('корреляции и единичные изменения веса не доказывают причинность');
    expect(system.content).toContain('Не объявляй продукт или приём пищи причиной привеса или отвеса');
    expect(system.content).toContain('нет записей питания и веса за сопоставимые периоды, прямо скажи об этом');
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'Значит, рис вызвал привес?' });
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
