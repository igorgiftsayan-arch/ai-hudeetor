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
import { FoodAnalysisProcessor } from './food-analysis.processor';
import { PushReminderService } from './push-reminder.service';

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
        database: DatabaseService,
      ) =>
        new MemoryContextBuilder({
          profile: (userId) => profile.execute(userId),
          weight: (userId) => weight.execute(userId),
          memories: (userId) => memory.listActive(userId),
          confirmedFood: async (userId) => {
            const result=await database.query<{consumed_at:Date;confirmed_result:{dishName?:string;items?:Array<{name?:string}>}}>(`select consumed_at,confirmed_result from food_consumptions where user_id=$1 and deleted_at is null order by consumed_at desc,id desc limit 5`,[userId]);
            return result.rows.map((row)=>({consumedAt:row.consumed_at.toISOString(),summary:row.confirmed_result.dishName ?? row.confirmed_result.items?.map((item)=>item.name).filter(Boolean).join(', ') ?? 'Подтверждённая еда'}));
          },
        }),
      inject: [
        GetCompanionProfileContextUseCase,
        GetCompanionWeightContextUseCase,
        AiMemoryRepository,
        DatabaseService,
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
    {
      provide: AiOperationProcessor,
      useFactory: (
        database: DatabaseService,
        adapter: AiProviderAdapter,
        memoryContext: MemoryContextBuilder,
        memoryExtraction: MemoryExtractionProcessor,
        foodAnalysis: FoodAnalysisProcessor,
        pushReminder: PushReminderService,
      ) =>
        new AiOperationProcessor(
          database,
          adapter,
          memoryContext,
          memoryExtraction,
          config.IDENTITY_AI_PROVIDER_PROCESSING_VERSION,
          foodAnalysis,
          pushReminder,
        ),
      inject: [
        DatabaseService,
        AiProviderAdapter,
        MemoryContextBuilder,
        MemoryExtractionProcessor,
        FoodAnalysisProcessor,
        PushReminderService,
      ],
    },
    MemoryExtractionProcessor,
    {
      provide: FoodAnalysisProcessor,
      useFactory: (database: DatabaseService) => new FoodAnalysisProcessor(database, {provider:config.FOOD_VISION_PROVIDER,fakeMode:config.FOOD_FAKE_MODE,apiKey:config.GENAPI_API_KEY,nativeBaseUrl:config.GENAPI_NATIVE_BASE_URL,networkId:config.GENAPI_VISION_MODEL,modelVersion:config.GENAPI_VISION_MODEL_VERSION,timeoutMs:config.GENAPI_TIMEOUT_MS,s3:{endpoint:config.S3_ENDPOINT,region:config.S3_REGION,bucket:config.S3_BUCKET,accessKeyId:config.S3_ACCESS_KEY_ID,secretAccessKey:config.S3_SECRET_ACCESS_KEY,forcePathStyle:config.S3_FORCE_PATH_STYLE}}),
      inject: [DatabaseService],
    },
    {
      provide: PushReminderService,
      useFactory: (database: DatabaseService) => new PushReminderService(database,{enabled:config.PUSH_ENABLED,subject:config.PUSH_VAPID_SUBJECT,publicKey:config.PUSH_VAPID_PUBLIC_KEY,privateKey:config.PUSH_VAPID_PRIVATE_KEY}),
      inject:[DatabaseService],
    },
    OutboxPublisherService,
  ],
})
export class WorkerModule {}
