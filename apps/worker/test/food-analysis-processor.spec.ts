import { FoodAnalysisProcessor } from '../src/food-analysis.processor';

describe('FoodAnalysisProcessor reconciliation', () => {
  afterEach(() => jest.restoreAllMocks());

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
      expect.stringContaining("status=$2 for update"),
      ['analysis-1', 'outcomeUnknown'],
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
