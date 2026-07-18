import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { OnboardingStatePort } from '../../identity/application/onboarding-state.port';
import type { OnboardingStatus } from '../../identity/domain/identity-types';
import type { UserProfile } from '../domain/profile-types';
import type { ProfilesRepository } from './profiles-repository';

export class SaveProfileSetupUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly onboardingState: OnboardingStatePort,
    private readonly repository: ProfilesRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    timezone: string;
    wellnessNoticeVersion?: string;
  }): Promise<UserProfile & { onboardingStatus: OnboardingStatus }> {
    const identity = await this.currentUser.execute(input.accessToken);
    return this.database.transaction(async (client) => {
      const profile = await this.repository.upsertProfile(client, {
        userId: identity.userId,
        timezone: input.timezone,
      });
      const onboardingStatus = input.wellnessNoticeVersion
        ? await this.onboardingState.acceptWellnessNoticeAndAdvanceProfile(
            client,
            {
              userId: identity.userId,
              documentVersion: input.wellnessNoticeVersion,
            },
          )
        : identity.onboardingStatus;
      return { ...profile, onboardingStatus };
    });
  }
}
