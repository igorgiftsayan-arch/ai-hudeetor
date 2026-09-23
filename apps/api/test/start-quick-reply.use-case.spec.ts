import { StartQuickReplyUseCase } from '@atlas/backend';

describe('StartQuickReplyUseCase', () => {
  it('creates a queued operation in one transaction for a completed user', async () => {
    const database = new TransactionProbe();
    const currentUser = {
      execute: jest.fn().mockResolvedValue({
        userId: '43d7cb11-c958-4266-8946-6ee644095ec1',
        onboardingStatus: 'completed',
      }),
    };
    const repository = {
      startQuickReply: jest.fn().mockResolvedValue({
        id: '4bd8d033-410a-486c-a285-4d5e92328373',
        status: 'queued' as const,
        conversationId: '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af',
        inputMessageId: '0392fdc4-c0a4-447e-b69f-6c86097a1e10',
        reservedTokens: 1,
        priceVersion: 1,
        pollUrl: '/api/v1/ai/operations/4bd8d033-410a-486c-a285-4d5e92328373',
        runtimeAdapter: 'fake',
      }),
    };
    const useCase = new StartQuickReplyUseCase(
      database as never,
      currentUser as never,
      repository as never,
    );

    const result = await useCase.execute({
      accessToken: 'opaque-access-token',
      idempotencyKey: 'a-valid-idempotency-key',
      conversationId: '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af',
      content: 'Помоги мне не сорваться сегодня',
      expectedPriceTokens: 1,
      priceVersion: 1,
    });

    expect(database.transactionCalls).toBe(1);
    expect(repository.startQuickReply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: '43d7cb11-c958-4266-8946-6ee644095ec1',
        content: 'Помоги мне не сорваться сегодня',
        priceVersion: 1,
      }),
    );
    expect(result).toMatchObject({
      status: 'queued',
      reservedTokens: 1,
      runtimeAdapter: 'fake',
    });
  });

  it('rejects whitespace-only content before opening a transaction', async () => {
    const database = new TransactionProbe();
    const useCase = new StartQuickReplyUseCase(
      database as never,
      { execute: jest.fn() } as never,
      { startQuickReply: jest.fn() } as never,
    );

    await expect(
      useCase.execute({
        accessToken: 'opaque-access-token',
        idempotencyKey: 'a-valid-idempotency-key',
        conversationId: '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af',
        content: '   ',
        expectedPriceTokens: 1,
        priceVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });

    expect(database.transactionCalls).toBe(0);
  });

  it('denies an external provider before dispatch without current-version consent', async () => {
    const repository = { startQuickReply: jest.fn() };
    const database = new TransactionProbe({ rows: [] });
    const useCase = new StartQuickReplyUseCase(
      database as never,
      { execute: jest.fn().mockResolvedValue({ userId: 'user-1' }) } as never,
      repository as never,
      { required: true, documentVersion: 'pilot-v2' },
    );
    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: 'AI_PROVIDER_CONSENT_REQUIRED',
      status: 409,
    });
    expect(repository.startQuickReply).not.toHaveBeenCalled();
  });

  it('dispatches only when consent matches the configured current version', async () => {
    const repository = {
      startQuickReply: jest.fn().mockResolvedValue({ status: 'queued' }),
    };
    const database = new TransactionProbe({ rows: [{ '?column?': 1 }] });
    const useCase = new StartQuickReplyUseCase(
      database as never,
      { execute: jest.fn().mockResolvedValue({ userId: 'user-1' }) } as never,
      repository as never,
      { required: true, documentVersion: 'pilot-v2' },
    );
    await expect(useCase.execute(command())).resolves.toMatchObject({
      status: 'queued',
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('document_version=$2'),
      ['user-1', 'pilot-v2'],
    );
  });
});

function command() {
  return {
    accessToken: 'opaque-access-token',
    idempotencyKey: 'a-valid-idempotency-key',
    conversationId: '773a7e6e-cb1a-42f0-9dca-24f94c5cc5af',
    content: 'Помоги сегодня',
    expectedPriceTokens: 1,
    priceVersion: 1,
  };
}

class TransactionProbe {
  transactionCalls = 0;
  query: jest.Mock;
  constructor(result: { rows: object[] } = { rows: [] }) {
    this.query = jest.fn().mockResolvedValue(result);
  }

  async transaction<TResult>(
    operation: (client: object) => Promise<TResult>,
  ): Promise<TResult> {
    this.transactionCalls += 1;
    return operation({ query: this.query });
  }
}
