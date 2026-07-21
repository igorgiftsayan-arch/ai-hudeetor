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
});

class TransactionProbe {
  transactionCalls = 0;

  async transaction<TResult>(
    operation: (client: object) => Promise<TResult>,
  ): Promise<TResult> {
    this.transactionCalls += 1;
    return operation({});
  }
}
