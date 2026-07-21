import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type {
  AiCompanionRepository,
  AiConversation,
} from './ai-companion-repository';

export class CreateAiConversationUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiCompanionRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    idempotencyKey: string;
  }): Promise<AiConversation> {
    const user = await this.currentUser.execute(input.accessToken);
    return this.database.transaction((client) =>
      this.repository.createConversation(client, {
        userId: user.userId,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }
}
