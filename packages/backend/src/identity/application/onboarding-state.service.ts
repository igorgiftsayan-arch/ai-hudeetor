import type { PoolClient } from 'pg';
import type { OnboardingStatus } from '../domain/identity-types';
import { IdentityError } from '../domain/identity-error';
import type { IdentityRepository } from './identity-repository';
import { OnboardingStatePort } from './onboarding-state.port';

export class OnboardingStateService extends OnboardingStatePort {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly wellnessNoticeVersion: string,
  ) {
    super();
  }

  async acceptWellnessNoticeAndAdvanceProfile(
    client: PoolClient,
    input: { userId: string; documentVersion?: string },
  ): Promise<OnboardingStatus> {
    if (
      input.documentVersion &&
      input.documentVersion !== this.wellnessNoticeVersion
    ) {
      throw new IdentityError(
        'CONSENT_VERSION_OUTDATED',
        409,
        'A current consent document version is required',
      );
    }
    return this.repository.acceptWellnessNoticeAndAdvanceProfile(client, {
      userId: input.userId,
      documentVersion: this.wellnessNoticeVersion,
    });
  }

  advanceToPersonaReady(
    client: PoolClient,
    userId: string,
  ): Promise<OnboardingStatus> {
    return this.repository.advanceToPersonaReady(client, userId);
  }
}
