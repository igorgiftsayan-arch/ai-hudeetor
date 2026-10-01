import { identityErrors } from '../domain/identity-error';
import type { IdentityEmailTokenService } from './identity-email-token.service';
import type { PasswordHasher } from './identity-ports';
import type { IdentityRepository } from './identity-repository';

export class ResetPasswordUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: IdentityEmailTokenService,
  ) {}

  async execute(input: {
    token: string;
    newPassword: string;
  }): Promise<{ passwordReset: true }> {
    if (!input.token) throw identityErrors.passwordResetTokenInvalid();
    const tokenHash = this.tokens.hash(input.token);
    if (!(await this.repository.hasValidPasswordResetToken(tokenHash)))
      throw identityErrors.passwordResetTokenInvalid();
    const passwordHash = await this.hasher.hash(input.newPassword);
    if (!(await this.repository.resetPassword(tokenHash, passwordHash)))
      throw identityErrors.passwordResetTokenInvalid();
    return { passwordReset: true };
  }
}
