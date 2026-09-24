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
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'outbox-ai-reconciliation',
              event_type: 'ai-companion.operation_reconciliation_requested.v1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    await new OutboxPublisherService(
      database as never,
      queue as never,
    ).publish();
    expect(queue.add).toHaveBeenCalledWith(
      'ai-operation-reconciliation',
      { outboxId: 'outbox-ai-reconciliation' },
      expect.objectContaining({ jobId: 'outbox-ai-reconciliation' }),
    );
  });
});

describe('OutboxPublisherService polling failure recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('contains a transient database failure and publishes the durable row on the next tick', async () => {
    const log = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const database = {
      query: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('synthetic private connection detail'), {
            code: 'EAI_AGAIN',
          }),
        )
        .mockResolvedValueOnce({
          rows: [
            { id: 'outbox-retry', event_type: 'food.analysis_requested.v1' },
          ],
        })
        .mockResolvedValue({ rows: [] }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new OutboxPublisherService(
      database as never,
      queue as never,
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.add).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ event: 'outbox_publish_error', errorCode: 'EAI_AGAIN' }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('private connection');
    await jest.advanceTimersByTimeAsync(1000);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'food-analysis',
      { outboxId: 'outbox-retry' },
      expect.objectContaining({ jobId: 'outbox-retry' }),
    );
    expect(database.query).toHaveBeenLastCalledWith(
      expect.stringContaining('published_at=now()'),
      ['outbox-retry'],
    );
  });

  it('leaves the row unpublished when queue delivery fails and retries the same job id', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let published = false;
    const database = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('update')) {
          published = true;
          return { rows: [] };
        }
        return {
          rows: published
            ? []
            : [
                {
                  id: 'outbox-queue-retry',
                  event_type: 'food.analysis_requested.v1',
                },
              ],
        };
      }),
    };
    const queue = {
      add: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('queue unavailable'), {
            code: 'ECONNREFUSED',
          }),
        )
        .mockResolvedValue(undefined),
    };
    const service = new OutboxPublisherService(
      database as never,
      queue as never,
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(published).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    expect(published).toBe(true);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls.map((call) => call[2].jobId)).toEqual([
      'outbox-queue-retry',
      'outbox-queue-retry',
    ]);
  });

  it('does not overlap slow polling runs', async () => {
    let release!: (value: { rows: never[] }) => void;
    const database = {
      query: jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    };
    const service = new OutboxPublisherService(
      database as never,
      { add: jest.fn() } as never,
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(3000);
    expect(database.query).toHaveBeenCalledTimes(1);
    release({ rows: [] });
    await jest.advanceTimersByTimeAsync(0);
  });
});

describe('OutboxPublisherService shutdown', () => {
  it('stops polling and waits for the current publish before dependency shutdown', async () => {
    jest.useFakeTimers();
    try {
      let release!: (value: { rows: never[] }) => void;
      const database = {
        query: jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
      };
      const service = new OutboxPublisherService(
        database as never,
        { add: jest.fn() } as never,
      );
      service.onModuleInit();
      let stopped = false;
      const shutdown = service.onModuleDestroy().then(() => {
        stopped = true;
      });
      await jest.advanceTimersByTimeAsync(2000);
      expect(stopped).toBe(false);
      expect(database.query).toHaveBeenCalledTimes(1);
      release({ rows: [] });
      await shutdown;
      await jest.advanceTimersByTimeAsync(2000);
      expect(database.query).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
