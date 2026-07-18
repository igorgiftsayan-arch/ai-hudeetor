import { IdentityError } from '../../identity/domain/identity-error';

export const profilesErrors = {
  onboardingIncomplete: () =>
    new IdentityError(
      'ONBOARDING_INCOMPLETE',
      409,
      'Complete profile setup before selecting a persona',
    ),
  invalidPersona: () =>
    new IdentityError(
      'INVALID_PERSONA',
      422,
      'The selected persona is invalid',
    ),
  invalidTimezone: () =>
    new IdentityError(
      'VALIDATION_ERROR',
      422,
      'A canonical IANA timezone is required',
    ),
  consentVersionOutdated: () =>
    new IdentityError(
      'CONSENT_VERSION_OUTDATED',
      409,
      'A current consent document version is required',
    ),
};
