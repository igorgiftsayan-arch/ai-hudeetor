import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { OnboardingStatePort } from '../../identity/application/onboarding-state.port';
import type { OnboardingStatus } from '../../identity/domain/identity-types';
import type {
  AiPreference,
  PersonaId,
  ResponseLength,
  Strictness,
} from '../domain/profile-types';
import { profilesErrors } from '../domain/profiles-error';
import type { ProfilesRepository } from './profiles-repository';

export class SavePersonaPreferenceUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly onboardingState: OnboardingStatePort,
    private readonly repository: ProfilesRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    personaId: PersonaId;
    strictness?: Strictness;
    responseLength?: ResponseLength;
  }): Promise<AiPreference & { onboardingStatus: OnboardingStatus }> {
    const identity = await this.currentUser.execute(input.accessToken);
    if (identity.onboardingStatus === 'registered') {
      throw profilesErrors.onboardingIncomplete();
    }
    return this.database.transaction(async (client) => {
      const current = await this.repository.lockPreference(
        client,
        identity.userId,
      );
      const preference: AiPreference = {
        userId: identity.userId,
        personaId: input.personaId,
        strictness: input.strictness ?? current?.strictness ?? 'medium',
        responseLength:
          input.responseLength ?? current?.responseLength ?? 'medium',
      };
      const saved = await this.repository.upsertPreference(client, preference);
      const onboardingStatus = await this.onboardingState.advanceToPersonaReady(
        client,
        identity.userId,
      );
      if (current?.personaId !== saved.personaId) {
        await this.repository.insertPersonaSelectedEvent(client, {
          userId: identity.userId,
          personaId: saved.personaId,
        });
      }
      return { ...saved, onboardingStatus };
    });
  }
}
