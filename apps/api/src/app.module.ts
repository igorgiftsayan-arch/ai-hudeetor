import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  IdentityModule,
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
    }),
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
