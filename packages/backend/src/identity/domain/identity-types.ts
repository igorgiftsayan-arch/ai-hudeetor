export type OnboardingStatus = 'registered';

export interface ConsentAcceptance {
  consentType: 'terms' | 'privacy';
  documentVersion: string;
  accepted: true;
}

export interface RegisteredIdentity {
  id: string;
  emailNormalized: string;
  onboardingStatus: OnboardingStatus;
  registrationIdempotencyKey: string;
  registrationRequestHash: string;
  consents: ConsentAcceptance[];
}

export interface IdentitySessionRecord {
  id: string;
  userId: string;
  familyId: string;
  registrationIdempotencyKey: string | null;
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface IssuedIdentitySession {
  id: string;
  userId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface CurrentIdentity {
  userId: string;
  onboardingStatus: OnboardingStatus;
}
