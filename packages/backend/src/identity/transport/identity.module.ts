import { Module, type DynamicModule } from '@nestjs/common';
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
import { Argon2PasswordHasher } from '../infrastructure/argon2-password-hasher';
import { CryptoSessionTokenService } from '../infrastructure/crypto-session-token.service';
import { PostgresIdentityRepository } from '../infrastructure/postgres-identity.repository';
import { RedisLoginAttemptLimiter } from '../infrastructure/redis-login-attempt-limiter';
import { CsrfService, type IdentitySecurityOptions } from './csrf.service';
import { IdentityController } from './identity.controller';
import { IDENTITY_SECURITY_OPTIONS } from './identity.tokens';

@Module({})
export class IdentityModule {
  static forRoot(options: IdentitySecurityOptions): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        { provide: IDENTITY_SECURITY_OPTIONS, useValue: options },
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
          provide: SessionTokenService,
          useFactory: () =>
            new CryptoSessionTokenService({
              accessTtlMs: options.accessTtlMs,
              refreshTtlMs: options.refreshTtlMs,
            }),
        },
        {
          provide: RegisterUserUseCase,
          useFactory: (
            repository: IdentityRepository,
            passwordHasher: PasswordHasher,
            tokens: SessionTokenService,
          ) => new RegisterUserUseCase(repository, passwordHasher, tokens),
          inject: [IdentityRepository, PasswordHasher, SessionTokenService],
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
          provide: CsrfService,
          useFactory: () => new CsrfService(options),
        },
      ],
      exports: [IdentityRepository, CsrfService],
    };
  }
}
