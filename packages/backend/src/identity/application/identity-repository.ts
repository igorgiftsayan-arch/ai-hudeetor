import { identityErrors } from '../domain/identity-error';
import type {
  IdentitySessionRecord,
  RegisteredIdentity,
} from '../domain/identity-types';

export interface CreateIdentitySessionInput {
  id: string;
  userId: string;
  familyId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  rotatedFromId?: string;
  registrationIdempotencyKey?: string;
}

export interface RotateIdentitySessionInput {
  currentRefreshTokenHash: string;
  nextSession: CreateIdentitySessionInput;
}

export type RotateIdentitySessionResult =
  | { kind: 'invalid' }
  | { kind: 'reused' }
  | { kind: 'rotated'; session: IdentitySessionRecord };

export abstract class IdentityRepository {
  abstract register(
    identity: RegisteredIdentity,
    passwordHash: string,
    session: CreateIdentitySessionInput,
  ): Promise<{ user: RegisteredIdentity; session: IdentitySessionRecord }>;

  abstract findCredentialsByEmail(emailNormalized: string): Promise<{
    user: RegisteredIdentity;
    passwordHash: string;
  } | null>;

  abstract findCredentialsByRegistrationIdempotencyKey(
    registrationIdempotencyKey: string,
  ): Promise<{
    user: RegisteredIdentity;
    passwordHash: string;
  } | null>;

  abstract createSession(
    input: CreateIdentitySessionInput,
  ): Promise<IdentitySessionRecord>;

  abstract replaceRegistrationSession(
    userId: string,
    registrationIdempotencyKey: string,
    input: CreateIdentitySessionInput,
  ): Promise<IdentitySessionRecord>;

  abstract findByAccessHash(
    accessTokenHash: string,
  ): Promise<
    (IdentitySessionRecord & { onboardingStatus?: 'registered' }) | null
  >;

  abstract rotateSession(
    input: RotateIdentitySessionInput,
  ): Promise<RotateIdentitySessionResult>;

  abstract revokeByTokenHashes(
    accessTokenHash: string | null,
    refreshTokenHash: string | null,
  ): Promise<void>;

  abstract revokeFamily(familyId: string): Promise<void>;

  protected emailAlreadyRegistered(): Error {
    return identityErrors.emailAlreadyRegistered();
  }
}
