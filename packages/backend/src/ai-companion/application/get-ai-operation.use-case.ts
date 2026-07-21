import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type {
  AiCompanionRepository,
  AiOperation,
} from './ai-companion-repository';

export class GetAiOperationUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiCompanionRepository,
  ) {}

  async execute(input: {
    accessToken: string;
    operationId: string;
  }): Promise<AiOperation> {
    const user = await this.currentUser.execute(input.accessToken);
    return this.repository.getOperation(user.userId, input.operationId);
  }
}
