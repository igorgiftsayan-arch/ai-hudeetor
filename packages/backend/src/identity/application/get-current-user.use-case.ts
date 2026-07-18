import { identityErrors } from '../domain/identity-error';
import type { CurrentIdentity } from '../domain/identity-types';
import type { IdentityRepository } from './identity-repository';
import type { SessionTokenService } from './identity-ports';

export class GetCurrentUserUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  async execute(accessToken: string): Promise<CurrentIdentity> {
    if (!accessToken) throw identityErrors.sessionInvalid();
    const session = await this.repository.findByAccessHash(
      this.tokens.hash(accessToken),
    );
    if (!session) throw identityErrors.sessionInvalid();
    return {
      userId: session.userId,
      onboardingStatus: session.onboardingStatus ?? 'registered',
    };
  }
}
