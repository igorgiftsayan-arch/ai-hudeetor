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
          ) =>
            new DeleteAiMemoryUseCase(database, currentUser, repository),
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
