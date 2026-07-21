import { Module, type DynamicModule } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { CreateAiConversationUseCase } from '../application/create-ai-conversation.use-case';
import { GetQuickReplyPriceUseCase } from '../application/get-quick-reply-price.use-case';
import { AiCompanionRepository } from '../application/ai-companion-repository';
import { StartQuickReplyUseCase } from '../application/start-quick-reply.use-case';
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
          provide: GetQuickReplyPriceUseCase,
          useFactory: (
            currentUser: GetCurrentUserUseCase,
            repository: AiCompanionRepository,
          ) => new GetQuickReplyPriceUseCase(currentUser, repository),
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
