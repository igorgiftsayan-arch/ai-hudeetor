import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { OnboardingStatePort } from '../../identity/application/onboarding-state.port';
import { CompleteOnboardingUseCase } from '../application/complete-onboarding.use-case';
import { GetCurrentWalletUseCase } from '../application/get-current-wallet.use-case';
import { TokenEconomyController } from './token-economy.controller';
@Module({})
export class TokenEconomyModule {
  static forRoot(): DynamicModule {
    return {
      module: TokenEconomyModule,
      controllers: [TokenEconomyController],
      providers: [
        {
          provide: CompleteOnboardingUseCase,
          useFactory: (
            d: DatabaseService,
            c: GetCurrentUserUseCase,
            o: OnboardingStatePort,
          ) => new CompleteOnboardingUseCase(d, c, o),
          inject: [DatabaseService, GetCurrentUserUseCase, OnboardingStatePort],
        },
        {
          provide: GetCurrentWalletUseCase,
          useFactory: (d: DatabaseService, c: GetCurrentUserUseCase) =>
            new GetCurrentWalletUseCase(d, c),
          inject: [DatabaseService, GetCurrentUserUseCase],
        },
      ],
    };
  }
}
