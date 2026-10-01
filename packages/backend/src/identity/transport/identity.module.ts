import { Global, Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { CreateSessionUseCase } from '../application/create-session.use-case';
import { LoginAttemptLimiter } from '../application/login-attempt-limiter';
import { GetCurrentUserUseCase } from '../application/get-current-user.use-case';
import { IdentityRepository } from '../application/identity-repository';
import { LogoutUseCase } from '../application/logout.use-case';
import {
  PasswordHasher,
  SessionTokenService,
} from '../application/identity-ports';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import { RegisterUserUseCase } from '../application/register-user.use-case';
import { IdentityEmailTokenService } from '../application/identity-email-token.service';
import { RequestEmailVerificationUseCase } from '../application/request-email-verification.use-case';
import { VerifyEmailUseCase } from '../application/verify-email.use-case';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../application/reset-password.use-case';
import { AiProviderConsentService } from '../application/ai-provider-consent.service';
import { RegistrationAttemptLimiter } from '../application/registration-attempt-limiter';
import { OnboardingStatePort } from '../application/onboarding-state.port';
import { OnboardingStateService } from '../application/onboarding-state.service';
import { Argon2PasswordHasher } from '../infrastructure/argon2-password-hasher';
import { CryptoSessionTokenService } from '../infrastructure/crypto-session-token.service';
import { PostgresIdentityRepository } from '../infrastructure/postgres-identity.repository';
import { RedisLoginAttemptLimiter } from '../infrastructure/redis-login-attempt-limiter';
import { RedisRegistrationAttemptLimiter } from '../infrastructure/redis-registration-attempt-limiter';
import { CsrfService, type IdentitySecurityOptions } from './csrf.service';
import { IdentityController } from './identity.controller';
import { IDENTITY_SECURITY_OPTIONS } from './identity.tokens';

@Global()
@Module({})
export class IdentityModule {
  static forRoot(options: IdentitySecurityOptions): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        { provide: IDENTITY_SECURITY_OPTIONS, useValue: options },
        {
          provide: AiProviderConsentService,
          useFactory: (database: DatabaseService) =>
            new AiProviderConsentService(
              database,
              options.aiProviderConsentVersion,
              options.aiProviderConsentDisclosure,
            ),
          inject: [DatabaseService],
        },
        {
          provide: IdentityRepository,
          useFactory: (database: DatabaseService) =>
            new PostgresIdentityRepository(database),
          inject: [DatabaseService],
        },
        { provide: PasswordHasher, useClass: Argon2PasswordHasher },
        {
          provide: LoginAttemptLimiter,
          useFactory: () =>
            new RedisLoginAttemptLimiter(
              options.redisUrl,
              options.loginMaxAttempts,
              options.loginWindowMs,
            ),
        },
        {
          provide: RegistrationAttemptLimiter,
          useFactory: () =>
            new RedisRegistrationAttemptLimiter(
              options.redisUrl,
              options.registrationMaxAttempts,
              options.registrationWindowMs,
            ),
        },
        {
          provide: SessionTokenService,
          useFactory: () =>
            new CryptoSessionTokenService({
              accessTtlMs: options.accessTtlMs,
              refreshTtlMs: options.refreshTtlMs,
            }),
        },
        {
          provide: IdentityEmailTokenService,
          useFactory: () =>
            new IdentityEmailTokenService(options.emailPayloadSecret),
        },
        {
          provide: RegisterUserUseCase,
          useFactory: (
            repository: IdentityRepository,
            passwordHasher: PasswordHasher,
            tokens: SessionTokenService,
            emailTokens: IdentityEmailTokenService,
          ) =>
            new RegisterUserUseCase(
              repository,
              passwordHasher,
              tokens,
              emailTokens,
              options.emailVerificationTtlMs,
            ),
          inject: [
            IdentityRepository,
            PasswordHasher,
            SessionTokenService,
            IdentityEmailTokenService,
          ],
        },
        {
          provide: CreateSessionUseCase,
          useFactory: (
            repository: IdentityRepository,
            passwordHasher: PasswordHasher,
            tokens: SessionTokenService,
            attempts: LoginAttemptLimiter,
          ) =>
            new CreateSessionUseCase(
              repository,
              passwordHasher,
              tokens,
              attempts,
            ),
          inject: [
            IdentityRepository,
            PasswordHasher,
            SessionTokenService,
            LoginAttemptLimiter,
          ],
        },
        {
          provide: RefreshSessionUseCase,
          useFactory: (
            repository: IdentityRepository,
            tokens: SessionTokenService,
          ) => new RefreshSessionUseCase(repository, tokens),
          inject: [IdentityRepository, SessionTokenService],
        },
        {
          provide: GetCurrentUserUseCase,
          useFactory: (
            repository: IdentityRepository,
            tokens: SessionTokenService,
          ) => new GetCurrentUserUseCase(repository, tokens),
          inject: [IdentityRepository, SessionTokenService],
        },
        {
          provide: LogoutUseCase,
          useFactory: (
            repository: IdentityRepository,
            tokens: SessionTokenService,
          ) => new LogoutUseCase(repository, tokens),
          inject: [IdentityRepository, SessionTokenService],
        },
        {
          provide: RequestEmailVerificationUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: IdentityRepository,
            tokens: IdentityEmailTokenService,
          ) =>
            new RequestEmailVerificationUseCase(
              currentUser,
              repository,
              tokens,
              options.emailVerificationTtlMs,
            ),
          inject: [
            GetCurrentUserUseCase,
            IdentityRepository,
            IdentityEmailTokenService,
          ],
        },
        {
          provide: VerifyEmailUseCase,
          useFactory: (
            repository: IdentityRepository,
            tokens: IdentityEmailTokenService,
          ) => new VerifyEmailUseCase(repository, tokens),
          inject: [IdentityRepository, IdentityEmailTokenService],
        },
        {
          provide: RequestPasswordResetUseCase,
          useFactory: (
            repository: IdentityRepository,
            tokens: IdentityEmailTokenService,
          ) =>
            new RequestPasswordResetUseCase(
              repository,
              tokens,
              options.passwordResetTtlMs,
            ),
          inject: [IdentityRepository, IdentityEmailTokenService],
        },
        {
          provide: ResetPasswordUseCase,
          useFactory: (
            repository: IdentityRepository,
            hasher: PasswordHasher,
            tokens: IdentityEmailTokenService,
          ) => new ResetPasswordUseCase(repository, hasher, tokens),
          inject: [
            IdentityRepository,
            PasswordHasher,
            IdentityEmailTokenService,
          ],
        },
        {
          provide: OnboardingStatePort,
          useFactory: (repository: IdentityRepository) =>
            new OnboardingStateService(
              repository,
              options.aiWellnessNoticeVersion,
            ),
          inject: [IdentityRepository],
        },
        {
          provide: CsrfService,
          useFactory: () => new CsrfService(options),
        },
      ],
      exports: [
        IdentityRepository,
        CsrfService,
        GetCurrentUserUseCase,
        OnboardingStatePort,
        AiProviderConsentService,
      ],
    };
  }
}
