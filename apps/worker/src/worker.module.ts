import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import {
  AiProviderAdapter,
  FakeAiProviderAdapter,
  GenApiAiProviderAdapter,
  PostgresAiMemoryRepository,
  AiMemoryRepository,
  DeterministicMemoryExtractor,
  ExtractMemoryUseCase,
  MemoryContextBuilder,
  GetCompanionProfileContextUseCase,
  GetCompanionWeightContextUseCase,
  DatabaseService,
  TechnicalInfrastructureModule,
  workerConfigSchema,
} from '@atlas/backend';
import { loadWorkerConfig } from './config/load-config';
import { AiOperationProcessor } from './ai-operation.processor';
import { OutboxPublisherService } from './outbox-publisher.service';
import { MemoryExtractionProcessor } from './memory-extraction.processor';

const configModule = ConfigModule.forRoot({
  envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
  isGlobal: true,
  validate: (environment: Record<string, unknown>) =>
    workerConfigSchema.parse(environment),
});
const config = loadWorkerConfig();
const redisUrl = new URL(config.REDIS_URL);

@Module({
  imports: [
    configModule,
    TechnicalInfrastructureModule.forRoot({
      databaseUrl: config.DATABASE_URL,
      redisUrl: config.REDIS_URL,
    }),
    BullModule.forRoot({
      connection: {
        db: Number(redisUrl.pathname.slice(1) || 0),
        host: redisUrl.hostname,
        password: redisUrl.password || undefined,
        port: Number(redisUrl.port || 6379),
      },
    }),
    BullModule.registerQueue({ name: config.WORKER_QUEUE_NAME }),
  ],
  providers: [
    {
      provide: AiMemoryRepository,
      useFactory: (database: DatabaseService) =>
        new PostgresAiMemoryRepository(database),
      inject: [DatabaseService],
    },
    DeterministicMemoryExtractor,
    {
      provide: ExtractMemoryUseCase,
      useFactory: (
        database: DatabaseService,
        repository: AiMemoryRepository,
        extractor: DeterministicMemoryExtractor,
      ) => new ExtractMemoryUseCase(database, repository, extractor),
      inject: [
        DatabaseService,
        AiMemoryRepository,
        DeterministicMemoryExtractor,
      ],
    },
    {
      provide: GetCompanionProfileContextUseCase,
      useFactory: (database: DatabaseService) =>
        new GetCompanionProfileContextUseCase(database),
      inject: [DatabaseService],
    },
    {
      provide: GetCompanionWeightContextUseCase,
      useFactory: (database: DatabaseService) =>
        new GetCompanionWeightContextUseCase(database),
      inject: [DatabaseService],
    },
    {
      provide: MemoryContextBuilder,
      useFactory: (
        profile: GetCompanionProfileContextUseCase,
        weight: GetCompanionWeightContextUseCase,
        memory: AiMemoryRepository,
      ) =>
        new MemoryContextBuilder({
          profile: (userId) => profile.execute(userId),
          weight: (userId) => weight.execute(userId),
          memories: (userId) => memory.listActive(userId),
        }),
      inject: [
        GetCompanionProfileContextUseCase,
        GetCompanionWeightContextUseCase,
        AiMemoryRepository,
      ],
    },
    {
      provide: AiProviderAdapter,
      useFactory: () =>
        config.AI_PROVIDER === 'genapi'
          ? new GenApiAiProviderAdapter({
              apiKey: config.GENAPI_API_KEY!,
              baseUrl: config.GENAPI_BASE_URL!,
              model: config.GENAPI_MODEL!,
              timeoutMs: config.GENAPI_TIMEOUT_MS,
            })
          : new FakeAiProviderAdapter(config.AI_FAKE_MODE),
    },
    AiOperationProcessor,
    MemoryExtractionProcessor,
    OutboxPublisherService,
  ],
})
export class WorkerModule {}
