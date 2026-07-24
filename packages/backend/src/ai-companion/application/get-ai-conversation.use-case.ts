import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type {
  AiCompanionRepository,
  AiConversationDetail,
} from './ai-companion-repository';

export class GetAiConversationUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiCompanionRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    conversationId?: string;
  }): Promise<AiConversationDetail> {
    const user = await this.currentUser.execute(input.accessToken);
    return input.conversationId
      ? this.repository.getConversation(user.userId, input.conversationId)
      : this.repository.getCurrentConversation(user.userId);
  }
}
