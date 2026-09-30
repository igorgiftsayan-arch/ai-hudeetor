import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { RegistrationAttemptLimiter } from '../application/registration-attempt-limiter';
import { identityErrors } from '../domain/identity-error';

export class RedisRegistrationAttemptLimiter extends RegistrationAttemptLimiter {
  constructor(
    private readonly redisUrl: string,
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {
    super();
  }

  async consume(scope: string): Promise<void> {
    const allowed = await this.withClient((client) =>
      client.eval(
        `local attempts = redis.call('INCR', KEYS[1])
         if attempts == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         if attempts > tonumber(ARGV[2]) then return 0 end
         return 1`,
        1,
        this.key(scope),
        this.windowMs,
        this.maxAttempts,
      ),
    );
    if (Number(allowed) !== 1) throw identityErrors.rateLimited(this.windowMs);
  }

  private key(scope: string): string {
    const digest = createHash('sha256').update(scope).digest('hex');
    return `identity:registration-attempts:${digest}`;
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
