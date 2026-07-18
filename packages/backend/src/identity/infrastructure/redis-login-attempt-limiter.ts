import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { LoginAttemptLimiter } from '../application/login-attempt-limiter';
import { identityErrors } from '../domain/identity-error';

export class RedisLoginAttemptLimiter extends LoginAttemptLimiter {
  constructor(
    private readonly redisUrl: string,
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {
    super();
  }

  async assertAllowed(scope: string): Promise<void> {
    const attempts = await this.withClient((client) =>
      client.get(this.key(scope)),
    );
    if (Number(attempts ?? 0) >= this.maxAttempts) {
      throw identityErrors.rateLimited(this.windowMs);
    }
  }

  async recordFailure(scope: string): Promise<void> {
    const key = this.key(scope);
    const attempts = await this.withClient((client) =>
      client.eval(
        `local attempts = redis.call('INCR', KEYS[1])
         if attempts == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return attempts`,
        1,
        key,
        this.windowMs,
      ),
    );
    if (Number(attempts) >= this.maxAttempts) {
      throw identityErrors.rateLimited(this.windowMs);
    }
  }

  async clear(scope: string): Promise<void> {
    await this.withClient((client) => client.del(this.key(scope)));
  }

  private key(scope: string): string {
    const digest = createHash('sha256').update(scope).digest('hex');
    return `identity:login-attempts:${digest}`;
  }

  private async withClient<T>(
    operation: (client: Redis) => Promise<T>,
  ): Promise<T> {
    const client = new Redis(this.redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      return await operation(client);
    } finally {
      client.disconnect();
    }
  }
}
