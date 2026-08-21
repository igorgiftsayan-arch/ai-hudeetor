export {
  apiConfigSchema,
  workerConfigSchema,
} from './infrastructure/config/runtime-config';
export type {
  ApiConfig,
  WorkerConfig,
} from './infrastructure/config/runtime-config';
export { DatabaseService } from './infrastructure/database/database.service';
export { RedisService } from './infrastructure/redis/redis.service';
export { TechnicalInfrastructureModule } from './infrastructure/technical-infrastructure.module';
export { IdentityError } from './identity/domain/identity-error';
export type {
  CurrentIdentity,
  IdentitySessionRecord,
  OnboardingStatus,
  IssuedIdentitySession,
  RegisteredIdentity,
} from './identity/domain/identity-types';
export {
  IdentityRepository,
  type CreateIdentitySessionInput,
  type RotateIdentitySessionInput,
} from './identity/application/identity-repository';
export { LoginAttemptLimiter } from './identity/application/login-attempt-limiter';
export { Argon2PasswordHasher } from './identity/infrastructure/argon2-password-hasher';
export { CryptoSessionTokenService } from './identity/infrastructure/crypto-session-token.service';
export { PostgresIdentityRepository } from './identity/infrastructure/postgres-identity.repository';
export { RedisLoginAttemptLimiter } from './identity/infrastructure/redis-login-attempt-limiter';
export { RegisterUserUseCase } from './identity/application/register-user.use-case';
export { CreateSessionUseCase } from './identity/application/create-session.use-case';
export { RefreshSessionUseCase } from './identity/application/refresh-session.use-case';
export { GetCurrentUserUseCase } from './identity/application/get-current-user.use-case';
export { LogoutUseCase } from './identity/application/logout.use-case';
export { OnboardingStatePort } from './identity/application/onboarding-state.port';
export { OnboardingStateService } from './identity/application/onboarding-state.service';
export { CsrfService } from './identity/transport/csrf.service';
export { IdentityModule } from './identity/transport/identity.module';
export { ProfilesModule } from './profiles/transport/profiles.module';
export { TokenEconomyModule } from './token-economy/transport/token-economy.module';
export { TrackingModule } from './tracking/transport/tracking.module';
export {
  AiCompanionRepository,
  type QueuedAiOperation,
  type AiOperation,
  type AiConversationDetail,
  type AiConversationMessage,
  type StartQuickReplyInput,
} from './ai-companion/application/ai-companion-repository';
export { StartQuickReplyUseCase } from './ai-companion/application/start-quick-reply.use-case';
export { GetQuickReplyPriceUseCase } from './ai-companion/application/get-quick-reply-price.use-case';
export { GetAiOperationUseCase } from './ai-companion/application/get-ai-operation.use-case';
export { GetAiConversationUseCase } from './ai-companion/application/get-ai-conversation.use-case';
export { CreateAiConversationUseCase } from './ai-companion/application/create-ai-conversation.use-case';
export { AiCompanionModule } from './ai-companion/transport/ai-companion.module';
export { AiMemoryRepository } from './ai-companion/application/ai-memory-repository';
export { PostgresAiMemoryRepository } from './ai-companion/infrastructure/postgres-ai-memory.repository';
export { ListAiMemoryUseCase } from './ai-companion/application/list-ai-memory.use-case';
export { DeleteAiMemoryUseCase } from './ai-companion/application/delete-ai-memory.use-case';
export type {
  AiMemory,
  AiMemoryCategory,
  AiMemorySource,
} from './ai-companion/domain/ai-memory';
export { PostgresAiCompanionRepository } from './ai-companion/infrastructure/postgres-ai-companion.repository';
export {
  AiProviderAdapter,
  type AiProviderRequest,
  type AiProviderResult,
} from './ai-companion/application/ai-provider-adapter';
export {
  FakeAiProviderAdapter,
  type FakeAiMode,
} from './ai-companion/infrastructure/fake-ai-provider.adapter';
export {
  GenApiAiProviderAdapter,
  type AiTechnicalLogRecord,
} from './ai-companion/infrastructure/genapi-ai-provider.adapter';
export { ProfilesRepository } from './profiles/application/profiles-repository';
export {
  GetCompanionProfileContextUseCase,
  type CompanionProfileContext,
} from './profiles/application/get-companion-profile-context.use-case';
export {
  GetCompanionWeightContextUseCase,
  type CompanionWeightContext,
} from './tracking/application/get-companion-weight-context.use-case';
export {
  MemoryContextBuilder,
  containsSensitiveContent,
  type MemoryContextDependencies,
} from './ai-companion/application/memory-context-builder';
export {
  DeterministicMemoryExtractor,
  type ExtractedMemoryFact,
} from './ai-companion/application/deterministic-memory-extractor';
export { ExtractMemoryUseCase } from './ai-companion/application/extract-memory.use-case';
export {
  applyAiDailyStateTransition,
  type AiDailyState,
  type AiDailyStateStatus,
} from './ai-companion/domain/ai-daily-state';
export { AiDailyStateRepository } from './ai-companion/application/ai-daily-state-repository';
export { PostgresAiDailyStateRepository } from './ai-companion/infrastructure/postgres-ai-daily-state.repository';
export {
  DailyContextBuilder,
  type DailyContext,
  type DailyContextDependencies,
} from './ai-companion/application/daily-context-builder';
export { GetTodayAiDailyStateUseCase } from './ai-companion/application/get-today-ai-daily-state.use-case';
export { TransitionAiDailyStateUseCase } from './ai-companion/application/transition-ai-daily-state.use-case';
export { PostgresProfilesRepository } from './profiles/infrastructure/postgres-profiles.repository';
export { GetOnboardingUseCase } from './profiles/application/get-onboarding.use-case';
export { SaveProfileSetupUseCase } from './profiles/application/save-profile-setup.use-case';
export { SavePersonaPreferenceUseCase } from './profiles/application/save-persona-preference.use-case';
