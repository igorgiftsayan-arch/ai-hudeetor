import { identityErrors } from '../domain/identity-error';
import type { IssuedIdentitySession } from '../domain/identity-types';
import type { IdentityRepository } from './identity-repository';
import type { SessionTokenService } from './identity-ports';

export class RefreshSessionUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  async execute(refreshToken: string): Promise<IssuedIdentitySession> {
    if (!refreshToken) throw identityErrors.sessionInvalid();
    const currentHash = this.tokens.hash(refreshToken);
    const issued = this.tokens.issue({ userId: 'resolved-during-rotation' });
    const result = await this.repository.rotateSession({
      currentRefreshTokenHash: currentHash,
      nextSession: issued.session,
    });
    if (result.kind !== 'rotated') {
      throw identityErrors.sessionInvalid();
    }
    return {
      id: result.session.id,
      userId: result.session.userId,
      familyId: result.session.familyId,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessExpiresAt: result.session.accessExpiresAt,
      refreshExpiresAt: result.session.refreshExpiresAt,
    };
  }
}
