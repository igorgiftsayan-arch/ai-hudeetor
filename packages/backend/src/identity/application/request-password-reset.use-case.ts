import type { IdentityEmailTokenService } from './identity-email-token.service';
import type { IdentityRepository } from './identity-repository';

export class RequestPasswordResetUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: IdentityEmailTokenService,
    private readonly ttlMs: number,
  ) {}

  async execute(email: string): Promise<{ accepted: true }> {
    await this.repository.createPasswordReset(
      email.trim().toLowerCase(),
      this.tokens.issue('passwordReset', this.ttlMs),
    );
    return { accepted: true };
  }
}
