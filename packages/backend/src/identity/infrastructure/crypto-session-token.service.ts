import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SessionTokenService } from '../application/identity-ports';

export interface SessionTokenOptions {
  accessTtlMs: number;
  refreshTtlMs: number;
}

export class CryptoSessionTokenService extends SessionTokenService {
  constructor(private readonly options: SessionTokenOptions) {
    super();
  }

  issue(input: { userId: string; familyId?: string; rotatedFromId?: string }) {
    const now = Date.now();
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    return {
      accessToken,
      refreshToken,
      session: {
        id: randomUUID(),
        userId: input.userId,
        familyId: input.familyId ?? randomUUID(),
        accessTokenHash: this.hash(accessToken),
        refreshTokenHash: this.hash(refreshToken),
        accessExpiresAt: new Date(now + this.options.accessTtlMs),
        refreshExpiresAt: new Date(now + this.options.refreshTtlMs),
        rotatedFromId: input.rotatedFromId,
      },
    };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
