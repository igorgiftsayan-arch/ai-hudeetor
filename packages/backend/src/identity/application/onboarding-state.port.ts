import type { PoolClient } from 'pg';
import type { OnboardingStatus } from '../domain/identity-types';

export abstract class OnboardingStatePort {
  abstract acceptWellnessNoticeAndAdvanceProfile(
    client: PoolClient,
    input: { userId: string; documentVersion?: string },
  ): Promise<OnboardingStatus>;

  abstract advanceToPersonaReady(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus>;
}
