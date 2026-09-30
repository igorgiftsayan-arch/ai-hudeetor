export abstract class RegistrationAttemptLimiter {
  abstract consume(scope: string): Promise<void>;
}
