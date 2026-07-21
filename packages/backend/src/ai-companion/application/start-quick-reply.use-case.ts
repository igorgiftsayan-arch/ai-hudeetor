import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';
import type {
  AiCompanionRepository,
  QueuedAiOperation,
  StartQuickReplyInput,
} from './ai-companion-repository';

export class StartQuickReplyUseCase {
  constructor(
    private readonly database: Pick<DatabaseService, 'transaction'>,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiCompanionRepository,
  ) {}

  async execute(
    input: Omit<StartQuickReplyInput, 'userId'> & { accessToken: string },
  ): Promise<QueuedAiOperation> {
    const contentLength = Array.from(input.content.trim()).length;
    if (contentLength < 1 || contentLength > 4000)
      throw new IdentityError(
        'VALIDATION_ERROR',
        422,
        'The quick reply content is invalid',
      );
    const user = await this.currentUser.execute(input.accessToken);
    return this.database.transaction((client) =>
      this.repository.startQuickReply(client, {
        ...input,
        userId: user.userId,
      }),
    );
  }
}
