import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { OnboardingState } from '../domain/profile-types';
import type { ProfilesRepository } from './profiles-repository';

export class GetOnboardingUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: ProfilesRepository,
  ) {}

  async execute(accessToken: string): Promise<OnboardingState> {
    const identity = await this.currentUser.execute(accessToken);
    const [profile, preference] = await Promise.all([
      this.repository.findProfile(identity.userId),
      this.repository.findPreference(identity.userId),
    ]);
    return { status: identity.onboardingStatus, profile, preference };
  }
}
