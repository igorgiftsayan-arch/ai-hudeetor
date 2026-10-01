import { identityErrors } from '../domain/identity-error';
import type { GetCurrentUserUseCase } from './get-current-user.use-case';
import type { IdentityEmailTokenService } from './identity-email-token.service';
import type { IdentityRepository } from './identity-repository';

export class RequestEmailVerificationUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: IdentityRepository,
    private readonly tokens: IdentityEmailTokenService,
    private readonly ttlMs: number,
  ) {}

  async execute(accessToken: string): Promise<{ accepted: true }> {
    const user = await this.currentUser.execute(accessToken);
    if (!user.emailVerified) {
      await this.repository.createEmailVerification(
        user.userId,
        this.tokens.issue('verifyEmail', this.ttlMs),
      );
    }
    return { accepted: true };
  }
}
