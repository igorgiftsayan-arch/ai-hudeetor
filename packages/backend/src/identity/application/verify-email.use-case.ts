import { identityErrors } from '../domain/identity-error';
import type { IdentityEmailTokenService } from './identity-email-token.service';
import type { IdentityRepository } from './identity-repository';

export class VerifyEmailUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: IdentityEmailTokenService,
  ) {}

  async execute(token: string): Promise<{ emailVerified: true }> {
    if (!token || !(await this.repository.verifyEmail(this.tokens.hash(token))))
      throw identityErrors.emailVerificationTokenInvalid();
    return { emailVerified: true };
  }
}
