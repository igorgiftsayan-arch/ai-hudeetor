import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  IdentityModule,
  AiCompanionModule,
  ProfilesModule,
  TokenEconomyModule,
  TechnicalInfrastructureModule,
  TrackingModule,
} from '@atlas/backend';
import { loadApiConfig } from './config/load-config';
import { HealthController } from './health/health.controller';
import { RequestIdMiddleware } from './http/request-id.middleware';

const configModule = ConfigModule.forRoot({
  envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
  isGlobal: true,
  validate: (environment: Record<string, unknown>) =>
    loadApiConfig(environment as NodeJS.ProcessEnv),
});
const config = loadApiConfig();

@Module({
  imports: [
    configModule,
    TechnicalInfrastructureModule.forRoot({
      databaseUrl: config.DATABASE_URL,
      redisUrl: config.REDIS_URL,
    }),
    IdentityModule.forRoot({
      accessTtlMs: config.IDENTITY_ACCESS_TTL_SECONDS * 1000,
      refreshTtlMs: config.IDENTITY_REFRESH_TTL_SECONDS * 1000,
      corsOrigin: config.API_CORS_ORIGIN,
      csrfSecret: config.CSRF_SECRET,
      secureCookies: config.IDENTITY_SECURE_COOKIES,
      termsVersion: config.IDENTITY_TERMS_VERSION,
      privacyVersion: config.IDENTITY_PRIVACY_VERSION,
      aiWellnessNoticeVersion: config.IDENTITY_AI_WELLNESS_NOTICE_VERSION,
      redisUrl: config.REDIS_URL,
      loginMaxAttempts: config.IDENTITY_LOGIN_MAX_ATTEMPTS,
      loginWindowMs: config.IDENTITY_LOGIN_WINDOW_SECONDS * 1_000,
      registrationMaxAttempts: config.IDENTITY_REGISTRATION_MAX_ATTEMPTS,
      registrationWindowMs: config.IDENTITY_REGISTRATION_WINDOW_SECONDS * 1_000,
      emailPayloadSecret: config.IDENTITY_EMAIL_PAYLOAD_SECRET,
      emailVerificationTtlMs:
        config.IDENTITY_EMAIL_VERIFICATION_TTL_SECONDS * 1_000,
      passwordResetTtlMs: config.IDENTITY_PASSWORD_RESET_TTL_SECONDS * 1_000,
      aiProviderConsentVersion:
        config.IDENTITY_AI_PROVIDER_PROCESSING_VERSION,
      aiProviderConsentDisclosure:
        config.IDENTITY_AI_PROVIDER_PROCESSING_DISCLOSURE,
    }),
    AiCompanionModule.forRoot(),
    ProfilesModule.forRoot({
      aiWellnessNoticeVersion: config.IDENTITY_AI_WELLNESS_NOTICE_VERSION,
    }),
    TokenEconomyModule.forRoot(),
    TrackingModule.forRoot(),
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
