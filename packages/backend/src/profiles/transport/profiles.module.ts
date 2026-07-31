import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { OnboardingStatePort } from '../../identity/application/onboarding-state.port';
import { GetOnboardingUseCase } from '../application/get-onboarding.use-case';
import { ProfilesRepository } from '../application/profiles-repository';
import { SavePersonaPreferenceUseCase } from '../application/save-persona-preference.use-case';
import { SaveProfileSetupUseCase } from '../application/save-profile-setup.use-case';
import { GetCompanionProfileContextUseCase } from '../application/get-companion-profile-context.use-case';
import { PostgresProfilesRepository } from '../infrastructure/postgres-profiles.repository';
import { ProfilesController } from './profiles.controller';
import { PROFILES_OPTIONS, type ProfilesOptions } from './profiles.tokens';
@Module({})
export class ProfilesModule {
  static forRoot(options: ProfilesOptions): DynamicModule {
    return {
      module: ProfilesModule,
      controllers: [ProfilesController],
      providers: [
        { provide: PROFILES_OPTIONS, useValue: options },
        {
          provide: GetCompanionProfileContextUseCase,
          useFactory: (database: DatabaseService) =>
            new GetCompanionProfileContextUseCase(database),
          inject: [DatabaseService],
        },
        {
          provide: ProfilesRepository,
          useFactory: (database: DatabaseService) =>
            new PostgresProfilesRepository(database),
          inject: [DatabaseService],
        },
        {
          provide: GetOnboardingUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: ProfilesRepository,
          ) => new GetOnboardingUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, ProfilesRepository],
        },
        {
          provide: SaveProfileSetupUseCase,
          useFactory: (
            database: DatabaseService,
            currentUser: GetCurrentUserUseCase,
            onboardingState: OnboardingStatePort,
            repository: ProfilesRepository,
          ) =>
            new SaveProfileSetupUseCase(
              database,
              currentUser,
              onboardingState,
              repository,
            ),
          inject: [
            DatabaseService,
            GetCurrentUserUseCase,
            OnboardingStatePort,
            ProfilesRepository,
          ],
        },
        {
          provide: SavePersonaPreferenceUseCase,
          useFactory: (
            database: DatabaseService,
            currentUser: GetCurrentUserUseCase,
            onboardingState: OnboardingStatePort,
            repository: ProfilesRepository,
          ) =>
            new SavePersonaPreferenceUseCase(
              database,
              currentUser,
              onboardingState,
              repository,
            ),
          inject: [
            DatabaseService,
            GetCurrentUserUseCase,
            OnboardingStatePort,
            ProfilesRepository,
          ],
        },
      ],
      exports: [ProfilesRepository, GetCompanionProfileContextUseCase],
    };
  }
}
