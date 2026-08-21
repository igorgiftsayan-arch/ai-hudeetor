import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { CreateAiConversationUseCase } from '../application/create-ai-conversation.use-case';
import { GetQuickReplyPriceUseCase } from '../application/get-quick-reply-price.use-case';
import { GetAiConversationUseCase } from '../application/get-ai-conversation.use-case';
import { GetAiOperationUseCase } from '../application/get-ai-operation.use-case';
import { AiCompanionRepository } from '../application/ai-companion-repository';
import { StartQuickReplyUseCase } from '../application/start-quick-reply.use-case';
import { AiMemoryRepository } from '../application/ai-memory-repository';
import { ListAiMemoryUseCase } from '../application/list-ai-memory.use-case';
import { DeleteAiMemoryUseCase } from '../application/delete-ai-memory.use-case';
import { PostgresAiMemoryRepository } from '../infrastructure/postgres-ai-memory.repository';
import { PostgresAiCompanionRepository } from '../infrastructure/postgres-ai-companion.repository';
import { AiCompanionController } from './ai-companion.controller';
import { AiDailyStateRepository } from '../application/ai-daily-state-repository';
import { PostgresAiDailyStateRepository } from '../infrastructure/postgres-ai-daily-state.repository';
import { DailyContextBuilder } from '../application/daily-context-builder';
import { GetTodayAiDailyStateUseCase } from '../application/get-today-ai-daily-state.use-case';
import { TransitionAiDailyStateUseCase } from '../application/transition-ai-daily-state.use-case';
import { GetCompanionProfileContextUseCase } from '../../profiles/application/get-companion-profile-context.use-case';
import { GetCompanionWeightContextUseCase } from '../../tracking/application/get-companion-weight-context.use-case';

@Module({})
export class AiCompanionModule {
  static forRoot(): DynamicModule {
    return {
      module: AiCompanionModule,
      controllers: [AiCompanionController],
      providers: [
        {
          provide: AiCompanionRepository,
          useFactory: (database: DatabaseService) =>
            new PostgresAiCompanionRepository(database),
          inject: [DatabaseService],
        },
        {
          provide: AiMemoryRepository,
          useFactory: (database: DatabaseService) =>
            new PostgresAiMemoryRepository(database),
          inject: [DatabaseService],
        },
        {
          provide: AiDailyStateRepository,
          useFactory: (database: DatabaseService) =>
            new PostgresAiDailyStateRepository(database),
          inject: [DatabaseService],
        },
        {
          provide: DailyContextBuilder,
          useFactory: (
            database: DatabaseService,
            memory: AiMemoryRepository,
          ) => {
            const profile = new GetCompanionProfileContextUseCase(database);
            const weight = new GetCompanionWeightContextUseCase(database);
            return new DailyContextBuilder({
              profile: (userId) => profile.execute(userId),
              weight: (userId) => weight.execute(userId),
              memories: (userId) => memory.listActive(userId),
            });
          },
          inject: [DatabaseService, AiMemoryRepository],
        },
        {
          provide: GetTodayAiDailyStateUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiDailyStateRepository,
            context: DailyContextBuilder,
          ) =>
            new GetTodayAiDailyStateUseCase(currentUser, repository, context),
          inject: [
            GetCurrentUserUseCase,
            AiDailyStateRepository,
            DailyContextBuilder,
          ],
        },
        {
          provide: TransitionAiDailyStateUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiDailyStateRepository,
          ) => new TransitionAiDailyStateUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, AiDailyStateRepository],
        },
        {
          provide: ListAiMemoryUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiMemoryRepository,
          ) => new ListAiMemoryUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, AiMemoryRepository],
        },
        {
          provide: DeleteAiMemoryUseCase,
          useFactory: (
            database: DatabaseService,
            currentUser: GetCurrentUserUseCase,
            repository: AiMemoryRepository,
          ) => new DeleteAiMemoryUseCase(database, currentUser, repository),
          inject: [DatabaseService, GetCurrentUserUseCase, AiMemoryRepository],
        },
        {
          provide: GetQuickReplyPriceUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) => new GetQuickReplyPriceUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, AiCompanionRepository],
        },
        {
          provide: GetAiConversationUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) => new GetAiConversationUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, AiCompanionRepository],
        },
        {
          provide: GetAiOperationUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) => new GetAiOperationUseCase(currentUser, repository),
          inject: [GetCurrentUserUseCase, AiCompanionRepository],
        },
        {
          provide: CreateAiConversationUseCase,
          useFactory: (
            database: DatabaseService,
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) =>
            new CreateAiConversationUseCase(database, currentUser, repository),
          inject: [
            DatabaseService,
            GetCurrentUserUseCase,
            AiCompanionRepository,
          ],
        },
        {
          provide: StartQuickReplyUseCase,
          useFactory: (
            database: DatabaseService,
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) => new StartQuickReplyUseCase(database, currentUser, repository),
          inject: [
            DatabaseService,
            GetCurrentUserUseCase,
            AiCompanionRepository,
          ],
        },
      ],
    };
  }
}
