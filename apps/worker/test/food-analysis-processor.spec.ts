import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';

describe('FoodAnalysisProcessor reconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends explicit food/weight causality and missing-data limits to the photo provider', async () => {
    let receiptHash = '';
    const query = jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("set status='processing'")) return { rows: [{ id: 'analysis-1', user_id: 'user-1', runtime_adapter: 'genapi' }], rowCount: 1 };
      if (sql.includes('select i.object_key')) return { rows: [{ object_key: 'private/test.jpg', sha256: 'test', target_weight_kg: null, facts: [] }], rowCount: 1 };
      if (sql.includes('insert into food_analysis_request_receipts')) receiptHash = String(values?.[5]);
      if (sql.includes('select request_hash')) return { rows: [{ request_hash: receiptHash, submission_state: 'prepared' }], rowCount: 1 };
      if (sql.includes('select id,user_id')) return { rows: [{ id: 'analysis-1', user_id: 'user-1' }], rowCount: 1 };
      if (sql.includes('select id,wallet_id')) return { rows: [{ id: 'reservation-1', wallet_id: 'wallet-1', amount_tokens: -5 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const database = { query: jest.fn().mockResolvedValue({ rows: [{ payload: { analysisId: 'analysis-1' } }] }), transaction: async (callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }) };
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async () => ({ ContentType: 'image/jpeg', Body: { transformToByteArray: async () => new Uint8Array([255,216,255]) } })) as never);
    const fetcher = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('synthetic transport interruption'));
    const processor = new FoodAnalysisProcessor(database as never, { provider: 'genapi', fakeMode: 'success', apiKey: 'test', nativeBaseUrl: 'https://provider.example/api/v1', networkId: 'gpt-4o', modelVersion: 'test', timeoutMs: 1000, s3: { endpoint: 'http://127.0.0.1:1', region: 'test', bucket: 'test', accessKeyId: 'test', secretAccessKey: 'test', forcePathStyle: true } });
    await processor.process({ data: { outboxId: 'outbox-1' } } as never);
    const payload = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[0].content).toContain('Food/weight correlations and individual weight changes do not establish causation');
    expect(payload.messages[0].content).toContain('Never claim a food or meal caused weight gain or loss');
    expect(payload.messages[0].content).toContain('not temporally comparable, explicitly state that limitation');
    expect(payload.messages[0].content).toContain('If insufficient, use status insufficientData');
  });

  it('confirms a known provider request exactly once when reconciliation succeeds', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'analysis-1', user_id: 'user-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'reservation-1', wallet_id: 'wallet-1', amount_tokens: -5 }] })
        .mockResolvedValue({ rows: [] }),
    };
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ payload: { analysisId: 'analysis-1' } }] })
        .mockResolvedValueOnce({ rows: [{ provider_request_id: 'provider-1' }] }),
      transaction: jest.fn(async (callback: (value: typeof client) => unknown) => callback(client)),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        status: 'success',
        result: [JSON.stringify({
          recognized: { kind: 'food', dishName: 'Салат', items: [], uncertaintyNotes: [] },
          suitability: { status: 'insufficientData', source: 'none', observations: [], missingData: ['Нет данных'] },
        })],
      }), { status: 200 }),
    );
    const processor = new FoodAnalysisProcessor(database as never, {
      provider: 'genapi', fakeMode: 'success', apiKey: 'test',
      nativeBaseUrl: 'https://provider.example/api/v1', networkId: 'gpt-4o',
      modelVersion: 'gpt-4o-test', timeoutMs: 1000,
    });

    await processor.reconcile({ data: { outboxId: 'outbox-1' } } as never);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status in ($2,'outcomeUnknown')"),
      ['analysis-1', 'outcomeUnknown', null],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("'aiConfirmation'"),
      ['wallet-1', 'user-1', 'analysis-1', 'reservation-1'],
    );
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("'aiRefund'"),
      expect.anything(),
    );
  });

  it.each(['result', 'full_response'])('confirms the observed native %s choice-array envelope without refund', async (field) => {
    // Sanitized real synthetic-image response: no request parameters, image, profile or identifiers.
    const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/genapi-food-native-choices.json'), 'utf8'));
    const expected = JSON.parse(fixture.result[0].message.content);
    const client = { query: jest.fn()
      .mockResolvedValueOnce({rows:[{id:'analysis-1',user_id:'user-1'}]})
      .mockResolvedValueOnce({rows:[{id:'reservation-1',wallet_id:'wallet-1',amount_tokens:-5}]})
      .mockResolvedValue({rows:[]}) };
    const database = { query: jest.fn()
      .mockResolvedValueOnce({rows:[{payload:{analysisId:'analysis-1'}}]})
      .mockResolvedValueOnce({rows:[{provider_request_id:'known-request'}]}),
      transaction: async (callback: (value: typeof client) => unknown) => callback(client) };
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({status:fixture.status,[field]:fixture.result}), {status:200}));
    const processor = new FoodAnalysisProcessor(database as never, {provider:'genapi',fakeMode:'success',apiKey:'test',nativeBaseUrl:'https://provider.example/api/v1',networkId:'gpt-4o',modelVersion:'gpt-4o-2024-08-06',timeoutMs:1000});
    await processor.reconcile({data:{outboxId:'outbox-1'}} as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe('https://provider.example/api/v1/request/get/known-request');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("set status='analyzed'"), ['analysis-1',JSON.stringify(expected.recognized),JSON.stringify(expected.suitability),'known-request']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("'aiConfirmation'"), ['wallet-1','user-1','analysis-1','reservation-1']);
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("'aiRefund'"),expect.anything());
  });

  it('schedules another reconciliation without a financial effect while provider is processing', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ payload: { analysisId: 'analysis-1' } }] })
        .mockResolvedValueOnce({ rows: [{ provider_request_id: 'provider-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
      transaction: jest.fn(),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'processing' }), { status: 200 }),
    );
    const processor = new FoodAnalysisProcessor(database as never, {
      provider: 'genapi', fakeMode: 'success', apiKey: 'test',
      nativeBaseUrl: 'https://provider.example/api/v1', networkId: 'gpt-4o',
      modelVersion: 'gpt-4o-test', timeoutMs: 1000,
    });

    await processor.reconcile({ data: { outboxId: 'outbox-1' } } as never);

    expect(database.query).toHaveBeenLastCalledWith(
      expect.stringContaining("food.analysis_reconciliation_requested.v1"),
      ['analysis-1'],
    );
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
