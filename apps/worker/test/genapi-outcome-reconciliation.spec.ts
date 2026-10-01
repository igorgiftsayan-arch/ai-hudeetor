import {
  buildGenApiChatPayload,
  GenApiOutcomeReconciliationClient,
} from '@atlas/backend';

const request = {
  operationId: '75feb19a-8729-4e4b-a9be-30a0c3ce2fbe',
  promptVersion: 'quick-reply-v1' as const,
  personaId: 'gentleFriend',
  memoryContext: 'safe context',
  messages: [
    { role: 'user' as const, content: 'first' },
    { role: 'assistant' as const, content: 'reply' },
    { role: 'user' as const, content: 'second' },
  ],
};

describe('GenAPI outcome reconciliation', () => {
  it.each(['grok-4-5', 'x-ai/grok-4.5'])('verifies the exact ordered request for observed model %s', async (resultModel) => {
    const payload = buildGenApiChatPayload(request, 'grok-4-5');
    const fetcher = jest.fn().mockResolvedValue(
      response({
        id: 54055527,
        status: 'success',
        network: 'grok-4-5',
        parameters: { ...payload, model: resultModel === 'x-ai/grok-4.5' ? 'grok-4.5' : 'x-ai/grok-4.5' },
        cost: 5.23,
        runtime: 30.91,
        result: [
          {
            id: 'provider-response',
            created: 1_790_198_765,
            model: resultModel,
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'answer' },
              },
            ],
            usage: {
              prompt_tokens: 560,
              completion_tokens: 717,
              total_tokens: 1277,
            },
          },
        ],
      }),
    );
    const client = new GenApiOutcomeReconciliationClient(
      {
        apiKey: 'secret',
        requestApiBaseUrl: 'https://api.gen-api.ru/api/v1',
        model: 'grok-4-5',
      },
      fetcher,
    );

    await expect(
      client.verifySuccess({
        operationId: request.operationId,
        providerRequestId: '54055527',
        request,
        operationCreatedAt: new Date('2026-09-23T21:26:04.232Z'),
        outcomeUnknownAt: new Date('2026-09-23T21:26:35.317Z'),
      }),
    ).resolves.toMatchObject({
      operationId: request.operationId,
      providerRequestId: '54055527',
      providerResponseId: 'provider-response',
      providerModel: 'grok-4-5',
      text: 'answer',
      inputTokens: 560,
      outputTokens: 717,
      totalTokens: 1277,
      cost: 5.23,
      latencyMs: 30910,
    });
  });

  it.each(['id', 'network', 'messages', 'parameterModel', 'resultModel', 'timestamp'])('keeps %s correlation strict for the observed native alias', async (mutation) => {
    const body = {
      id: 123, status: 'success', network: 'grok-4-5',
      parameters: { model: 'grok-4.5', messages: buildGenApiChatPayload(request,'grok-4-5').messages },
      result: [{model:'x-ai/grok-4.5',created:1_790_198_765,choices:[{message:{content:'synthetic answer'}}]}],
    };
    if (mutation === 'id') body.id = 124;
    if (mutation === 'network') body.network = 'other';
    if (mutation === 'messages') body.parameters.messages = [];
    if (mutation === 'parameterModel') body.parameters.model = 'other';
    if (mutation === 'resultModel') body.result[0]!.model = 'x-ai/other';
    if (mutation === 'timestamp') body.result[0]!.created = 1;
    const client = new GenApiOutcomeReconciliationClient({apiKey:'synthetic',requestApiBaseUrl:'https://api.gen-api.ru/api/v1',model:'grok-4-5'},jest.fn().mockResolvedValue(response(body)));
    await expect(client.verifySuccess({operationId:request.operationId,providerRequestId:'123',request,
      operationCreatedAt:new Date('2026-09-23T21:26:04.232Z'),outcomeUnknownAt:new Date('2026-09-23T21:26:35.317Z')})).rejects.toThrow();
  });

  it('rejects a provider record whose messages differ', async () => {
    const payload = buildGenApiChatPayload(request, 'grok-4-5');
    const fetcher = jest.fn().mockResolvedValue(
      response({
        id: 54055527,
        status: 'success',
        network: 'grok-4-5',
        parameters: {
          ...payload,
          messages: [
            ...payload.messages.slice(0, -1),
            { role: 'user', content: 'other' },
          ],
        },
        result: [],
      }),
    );
    const client = new GenApiOutcomeReconciliationClient(
      {
        apiKey: 'secret',
        requestApiBaseUrl: 'https://api.gen-api.ru/api/v1',
        model: 'grok-4-5',
      },
      fetcher,
    );

    await expect(
      client.verifySuccess({
        operationId: request.operationId,
        providerRequestId: '54055527',
        request,
        operationCreatedAt: new Date('2026-09-23T21:26:04.232Z'),
        outcomeUnknownAt: new Date('2026-09-23T21:26:35.317Z'),
      }),
    ).rejects.toThrow('GenAPI request parameters mismatch');
  });
});

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
