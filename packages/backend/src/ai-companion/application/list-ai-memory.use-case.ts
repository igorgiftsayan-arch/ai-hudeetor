import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { AiMemoryRepository } from './ai-memory-repository';

export class ListAiMemoryUseCase {
  constructor(
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiMemoryRepository,
  ) {}

  async execute(accessToken: string) {
    const identity = await this.currentUser.execute(accessToken);
    return { items: await this.repository.listActive(identity.userId) };
  }
}
