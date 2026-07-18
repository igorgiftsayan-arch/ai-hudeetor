export abstract class LoginAttemptLimiter {
  abstract assertAllowed(scope: string): Promise<void>;
  abstract recordFailure(scope: string): Promise<void>;
  abstract clear(scope: string): Promise<void>;
}
