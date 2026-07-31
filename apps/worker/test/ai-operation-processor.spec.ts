import { AiOperationProcessor } from '../src/ai-operation.processor';

describe('AiOperationProcessor GenAPI boundary', () => {
  it('does not call GenAPI without provider consent and refunds the reservation', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              persona_id: 'gentleFriend',
              user_id: 'user-1',
              conversation_id: 'conversation-1',
              input_message_id: 'message-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 'user-1',
              conversation_id: 'conversation-1',
              input_message_id: 'message-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'reservation-1', wallet_id: 'wallet-1', amount_tokens: -1 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ payload: { operationId: 'op-1' } }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ role: 'user', content: 'Не отправлять провайдеру' }],
        }),
      transaction: jest.fn(
        async (callback: (value: typeof client) => unknown) => callback(client),
      ),
    };
    const adapter = {
      providerName: 'genapi',
      execute: jest.fn(),
    };
    const processor = new AiOperationProcessor(
      database as never,
      adapter as never,
      { build: jest.fn().mockResolvedValue('bounded context') } as never,
      { process: jest.fn() } as never,
    );

    await processor.process({ data: { outboxId: 'outbox-1' } } as never);

    expect(adapter.execute).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("'aiRefund'"),
      ['wallet-1', 'user-1', 1, 'op-1', 'reservation-1'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status='technicalError'"),
      ['op-1', 'safetyRejected'],
    );
  });

  it('passes ordered conversation history to a consented GenAPI adapter', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              persona_id: 'analyst',
              user_id: 'user-1',
              conversation_id: 'conversation-1',
              input_message_id: 'message-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: 'user-1',
              conversation_id: 'conversation-1',
              input_message_id: 'message-1',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'reservation-1', wallet_id: 'wallet-1', amount_tokens: -1 },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'assistant-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const messages = [
      { role: 'user', content: 'Первый вопрос' },
      { role: 'assistant', content: 'Первый ответ' },
      { role: 'user', content: 'Второй вопрос' },
    ];
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ payload: { operationId: 'op-1' } }] })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
        .mockResolvedValueOnce({ rows: messages }),
      transaction: jest.fn(
        async (callback: (value: typeof client) => unknown) => callback(client),
      ),
    };
    const adapter = {
      providerName: 'genapi',
      execute: jest.fn().mockResolvedValue({
        kind: 'success',
        text: 'Второй ответ',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        providerReference: 'response-1',
      }),
    };
    const processor = new AiOperationProcessor(
      database as never,
      adapter as never,
      { build: jest.fn().mockResolvedValue('bounded context') } as never,
      { process: jest.fn() } as never,
    );

    await processor.process({ data: { outboxId: 'outbox-1' } } as never);

    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        personaId: 'analyst',
        memoryContext: 'bounded context',
      }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status='succeeded'"),
      expect.arrayContaining(['op-1', 'assistant-1', 'response-1', 10, 5, 15]),
    );
  });
});
