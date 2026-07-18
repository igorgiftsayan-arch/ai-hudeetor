import { createHash, randomUUID } from 'node:crypto';
import { IdentityError, identityErrors } from '../domain/identity-error';
import type {
  ConsentAcceptance,
  IdentitySessionRecord,
  IssuedIdentitySession,
  RegisteredIdentity,
} from '../domain/identity-types';
import type { IdentityRepository } from './identity-repository';
import type { PasswordHasher, SessionTokenService } from './identity-ports';

export interface RegisterUserCommand {
  email: string;
  password: string;
  ageConfirmed: true;
  consents: ConsentAcceptance[];
  idempotencyKey: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: SessionTokenService,
  ) {}

  async execute(command: RegisterUserCommand): Promise<{
    user: RegisteredIdentity;
    session: IssuedIdentitySession;
  }> {
    const emailNormalized = command.email.trim().toLowerCase();
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          emailNormalized,
          ageConfirmed: command.ageConfirmed,
          consents: [...command.consents].sort((a, b) =>
            a.consentType.localeCompare(b.consentType),
          ),
        }),
      )
      .digest('hex');
    const existing =
      await this.repository.findCredentialsByEmail(emailNormalized);
    if (existing) {
      if (existing.user.registrationIdempotencyKey !== command.idempotencyKey) {
        throw identityErrors.emailAlreadyRegistered();
      }
      if (
        existing.user.registrationRequestHash !== requestHash ||
        !(await this.passwordHasher.verify(
          existing.passwordHash,
          command.password,
        ))
      ) {
        throw identityErrors.idempotencyKeyReused();
      }
      const issued = this.tokens.issue({ userId: existing.user.id });
      const stored = await this.repository.replaceRegistrationSession(
        existing.user.id,
        command.idempotencyKey,
        {
          ...issued.session,
          registrationIdempotencyKey: command.idempotencyKey,
        },
      );
      return {
        user: existing.user,
        session: toIssuedSession(stored, issued),
      };
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const user: RegisteredIdentity = {
      id: randomUUID(),
      emailNormalized,
      onboardingStatus: 'registered',
      registrationIdempotencyKey: command.idempotencyKey,
      registrationRequestHash: requestHash,
      consents: command.consents,
    };
    const issued = this.tokens.issue({ userId: user.id });
    let result: { user: RegisteredIdentity; session: IdentitySessionRecord };
    try {
      result = await this.repository.register(user, passwordHash, {
        ...issued.session,
        registrationIdempotencyKey: command.idempotencyKey,
      });
    } catch (error) {
      if (
        error instanceof IdentityError &&
        ['EMAIL_ALREADY_REGISTERED', 'IDEMPOTENCY_KEY_REUSED'].includes(
          error.code,
        )
      ) {
        const committed =
          await this.repository.findCredentialsByRegistrationIdempotencyKey(
            command.idempotencyKey,
          );
        if (committed?.user.emailNormalized === emailNormalized) {
          return this.execute(command);
        }
      }
      throw error;
    }
    return {
      user: result.user,
      session: toIssuedSession(result.session, issued),
    };
  }
}

function toIssuedSession(
  stored: IdentitySessionRecord,
  issued: ReturnType<SessionTokenService['issue']>,
): IssuedIdentitySession {
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
