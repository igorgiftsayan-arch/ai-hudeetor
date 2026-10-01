export class IdentityError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export const identityErrors = {
  emailAlreadyRegistered: () =>
    new IdentityError(
      'EMAIL_ALREADY_REGISTERED',
      409,
      'An account already exists for this email',
    ),
  idempotencyKeyReused: () =>
    new IdentityError(
      'IDEMPOTENCY_KEY_REUSED',
      409,
      'The idempotency key was already used with another request',
    ),
  authenticationFailed: () =>
    new IdentityError(
      'AUTHENTICATION_FAILED',
      401,
      'Invalid email or password',
    ),
  sessionInvalid: () =>
    new IdentityError('SESSION_INVALID', 401, 'The session is invalid'),
  csrfValidationFailed: () =>
    new IdentityError('CSRF_VALIDATION_FAILED', 403, 'CSRF validation failed'),
  originValidationFailed: () =>
    new IdentityError(
      'ORIGIN_VALIDATION_FAILED',
      403,
      'Request origin validation failed',
    ),
  rateLimited: (windowMs: number) =>
    new IdentityError('RATE_LIMITED', 429, 'Too many authentication attempts', {
      retryAfterSeconds: Math.ceil(windowMs / 1_000),
    }),
  emailVerificationTokenInvalid: () =>
    new IdentityError(
      'EMAIL_VERIFICATION_TOKEN_INVALID',
      400,
      'The email verification token is invalid',
    ),
  passwordResetTokenInvalid: () =>
    new IdentityError(
      'PASSWORD_RESET_TOKEN_INVALID',
      400,
      'The password reset token is invalid',
    ),
  emailVerificationRequired: () =>
    new IdentityError(
      'EMAIL_VERIFICATION_REQUIRED',
      403,
      'Email verification is required',
    ),
};
