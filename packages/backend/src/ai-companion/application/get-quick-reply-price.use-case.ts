import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type {
  AiCompanionRepository,
  AiActionPrice,
} from './ai-companion-repository';

export class GetQuickReplyPriceUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiCompanionRepository,
  ) {}

  async execute(accessToken: string): Promise<AiActionPrice> {
    const user = await this.currentUser.execute(accessToken);
    return this.repository.getQuickReplyPrice(user.userId);
  }
}
