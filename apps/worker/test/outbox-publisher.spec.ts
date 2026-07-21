import { OutboxPublisherService } from '../src/outbox-publisher.service';

describe('OutboxPublisherService', () => {
  it('uses the durable outbox id as the stable BullMQ job id', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] })
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
});
