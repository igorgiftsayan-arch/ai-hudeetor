import { AiOperationProcessor } from '../src/ai-operation.processor';
import { createHash } from 'node:crypto';

function requestHash(personaId: string, messages: Array<{role:'user'|'assistant';content:string}>) {
  return createHash('sha256').update(JSON.stringify({operationId:'op-1',promptVersion:'quick-reply-v1',personaId,memoryContext:'bounded context',messages})).digest('hex');
}

describe('AiOperationProcessor GenAPI boundary', () => {
  it('does not call GenAPI without provider consent and refunds the reservation', async () => {
    const messages = [{ role: 'user' as const, content: 'Не отправлять провайдеру' }];
    const { client, database } = processorDatabase('gentleFriend', messages, false);
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
    const messages = [
      { role: 'user' as const, content: 'Первый вопрос' },
      { role: 'assistant' as const, content: 'Первый ответ' },
      { role: 'user' as const, content: 'Второй вопрос' },
    ];
    const { client, database } = processorDatabase('analyst', messages, true);
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
      expect.objectContaining({ onAccepted: expect.any(Function) }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status='succeeded'"),
      expect.arrayContaining(['op-1', 'assistant-1', 'response-1', 10, 5, 15]),
    );
  });
});

function processorDatabase(
  personaId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  authorized: boolean,
) {
  let receiptHash = '';
  const client = {
    query: jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('select user_id,created_at,status'))
        return {
          rows: [{ user_id: 'user-1', created_at: new Date(), status: 'processing' }],
          rowCount: 1,
        };
      if (sql.includes("interval '300 seconds'"))
        return { rows: [{ due: false }], rowCount: 1 };
      if (sql.includes("set status='processing'"))
        return {
          rows: [{
            persona_id: personaId,
            user_id: 'user-1',
            conversation_id: 'conversation-1',
            input_message_id: 'message-1',
          }],
          rowCount: 1,
        };
      if (sql.includes('insert into ai_operation_request_receipts'))
        receiptHash = String(values?.[5]);
      if (sql.includes('select request_hash,submission_state'))
        return {
          rows: [{ request_hash: receiptHash || requestHash(personaId, messages), submission_state: 'prepared' }],
          rowCount: 1,
        };
      if (sql.includes("status='processing' and processing_attempt_id"))
        return { rows: [{ one: 1 }], rowCount: 1 };
      if (sql.includes("set submission_state='submitting'"))
        return { rows: [], rowCount: 1 };
      if (sql.includes('select user_id,conversation_id,input_message_id'))
        return {
          rows: [{
            user_id: 'user-1',
            conversation_id: 'conversation-1',
            input_message_id: 'message-1',
          }],
          rowCount: 1,
        };
      if (sql.includes('select id,wallet_id'))
        return {
          rows: [{ id: 'reservation-1', wallet_id: 'wallet-1', amount_tokens: -1 }],
          rowCount: 1,
        };
      if (sql.includes("insert into ai_messages") && sql.includes("'assistant'"))
        return { rows: [{ id: 'assistant-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
  const database = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('from outbox_messages'))
        return { rows: [{ payload: { operationId: 'op-1' } }], rowCount: 1 };
      if (sql.includes('email_verified_at'))
        return authorized
          ? { rows: [{ exists: 1 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      if (sql.includes('from ai_messages'))
        return { rows: messages, rowCount: messages.length };
      return { rows: [], rowCount: 0 };
    }),
    transaction: jest.fn(
      async (callback: (value: typeof client) => unknown) => callback(client),
    ),
  };
  return { client, database };
}
