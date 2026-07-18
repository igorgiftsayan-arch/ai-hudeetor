import { identityErrors } from '../domain/identity-error';
import type { IssuedIdentitySession } from '../domain/identity-types';
import type { IdentityRepository } from './identity-repository';
import type { PasswordHasher, SessionTokenService } from './identity-ports';
import type { LoginAttemptLimiter } from './login-attempt-limiter';

export class CreateSessionUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly attempts: LoginAttemptLimiter,
  ) {}

  async execute(command: {
    email: string;
    password: string;
    attemptScope: string;
  }): Promise<IssuedIdentitySession> {
    await this.attempts.assertAllowed(command.attemptScope);
    const credentials = await this.repository.findCredentialsByEmail(
      command.email.trim().toLowerCase(),
    );
    if (!credentials) {
      await this.passwordHasher.hash(command.password);
      await this.attempts.recordFailure(command.attemptScope);
      throw identityErrors.authenticationFailed();
    }
    if (
      !(await this.passwordHasher.verify(
        credentials.passwordHash,
        command.password,
      ))
    ) {
      await this.attempts.recordFailure(command.attemptScope);
      throw identityErrors.authenticationFailed();
    }
    await this.attempts.clear(command.attemptScope);
    const issued = this.tokens.issue({ userId: credentials.user.id });
    const stored = await this.repository.createSession(issued.session);
    return {
      id: stored.id,
      userId: stored.userId,
      familyId: stored.familyId,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      accessExpiresAt: stored.accessExpiresAt,
      refreshExpiresAt: stored.refreshExpiresAt,
    };
  }
}
