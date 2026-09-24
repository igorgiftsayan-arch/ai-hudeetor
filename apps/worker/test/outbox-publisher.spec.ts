import { OutboxPublisherService } from '../src/outbox-publisher.service';

describe('OutboxPublisherService', () => {
  it('uses the durable outbox id as the stable BullMQ job id', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'outbox-1',
              event_type: 'ai-companion.quick_reply_requested.v1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new OutboxPublisherService(
      database as never,
      queue as never,
    );

    await service.publish();

    expect(queue.add).toHaveBeenCalledWith(
      'ai-operation',
      { outboxId: 'outbox-1' },
      expect.objectContaining({ jobId: 'outbox-1' }),
    );
  });

  it('publishes extraction with the same stable outbox job id', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'outbox-memory',
              event_type: 'ai-companion.memory_extraction_requested.v1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new OutboxPublisherService(
      database as never,
      queue as never,
    );
    await service.publish();
    expect(queue.add).toHaveBeenCalledWith(
      'memory-extraction',
      { outboxId: 'outbox-memory' },
      expect.objectContaining({ jobId: 'outbox-memory' }),
    );
  });

  it('publishes food reconciliation with the durable outbox id as the job id', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'outbox-food-reconciliation',
              event_type: 'food.analysis_reconciliation_requested.v1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new OutboxPublisherService(
      database as never,
      queue as never,
    );

    await service.publish();

    expect(queue.add).toHaveBeenCalledWith(
      'food-analysis-reconciliation',
      { outboxId: 'outbox-food-reconciliation' },
      expect.objectContaining({ jobId: 'outbox-food-reconciliation' }),
    );
  });

  it('publishes AI reconciliation with the durable outbox id as the job id', async () => {
    const database = { query: jest.fn()
      .mockResolvedValueOnce({rows:[{id:'outbox-ai-reconciliation',event_type:'ai-companion.operation_reconciliation_requested.v1'}]})
      .mockResolvedValueOnce({rows:[]}) };
    const queue={add:jest.fn().mockResolvedValue(undefined)};
    await new OutboxPublisherService(database as never,queue as never).publish();
    expect(queue.add).toHaveBeenCalledWith('ai-operation-reconciliation',{outboxId:'outbox-ai-reconciliation'},expect.objectContaining({jobId:'outbox-ai-reconciliation'}));
  });
});
