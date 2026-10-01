import { identityErrors } from '../domain/identity-error';
import type {
  IdentitySessionRecord,
  OnboardingStatus,
  RegisteredIdentity,
} from '../domain/identity-types';
import type { PoolClient } from 'pg';

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

export interface CreateIdentityEmailTokenInput {
  id: string;
  deliveryId: string;
  tokenHash: string;
  expiresAt: Date;
  template: 'verifyEmail' | 'passwordReset';
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
}

export type RotateIdentitySessionResult =
  | { kind: 'invalid' }
  | { kind: 'reused' }
  | {
      kind: 'rotated';
      session: IdentitySessionRecord;
      onboardingStatus: OnboardingStatus;
      emailVerified?: boolean;
    };

export abstract class IdentityRepository {
  abstract register(
    identity: RegisteredIdentity,
    passwordHash: string,
    session: CreateIdentitySessionInput,
    verification?: CreateIdentityEmailTokenInput,
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

  createSessionIfCredentialCurrent(
    input: CreateIdentitySessionInput,
    expectedPasswordHash: string,
  ): Promise<IdentitySessionRecord | null> {
    void expectedPasswordHash;
    return this.createSession(input);
  }

  abstract replaceRegistrationSession(
    userId: string,
    registrationIdempotencyKey: string,
    input: CreateIdentitySessionInput,
  ): Promise<IdentitySessionRecord>;

  abstract findByAccessHash(
    accessTokenHash: string,
  ): Promise<
    (IdentitySessionRecord & {
      onboardingStatus?: OnboardingStatus;
      emailVerified?: boolean;
    }) | null
  >;

  abstract rotateSession(
    input: RotateIdentitySessionInput,
  ): Promise<RotateIdentitySessionResult>;

  abstract revokeByTokenHashes(
    accessTokenHash: string | null,
    refreshTokenHash: string | null,
  ): Promise<void>;

  abstract revokeFamily(familyId: string): Promise<void>;

  createEmailVerification(
    userId: string,
    input: CreateIdentityEmailTokenInput,
  ): Promise<void> {
    void userId;
    void input;
    throw new Error('Identity email verification persistence is unavailable');
  }

  createPasswordReset(
    emailNormalized: string,
    input: CreateIdentityEmailTokenInput,
  ): Promise<void> {
    void emailNormalized;
    void input;
    throw new Error('Identity password reset persistence is unavailable');
  }

  verifyEmail(tokenHash: string): Promise<boolean> {
    void tokenHash;
    throw new Error('Identity email verification persistence is unavailable');
  }

  resetPassword(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    void tokenHash;
    void passwordHash;
    throw new Error('Identity password reset persistence is unavailable');
  }

  hasValidPasswordResetToken(tokenHash: string): Promise<boolean> {
    void tokenHash;
    throw new Error('Identity password reset persistence is unavailable');
  }

  abstract acceptWellnessNoticeAndAdvanceProfile(
    client: PoolClient,
    input: { userId: string; documentVersion: string },
  ): Promise<OnboardingStatus>;

  abstract advanceToPersonaReady(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus>;

  abstract advanceToCompleted(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus>;

  protected emailAlreadyRegistered(): Error {
    return identityErrors.emailAlreadyRegistered();
  }
}
