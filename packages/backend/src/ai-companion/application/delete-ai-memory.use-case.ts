import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { AiCompanionError } from '../domain/ai-companion-error';
import type { AiMemoryRepository } from './ai-memory-repository';

export class DeleteAiMemoryUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly repository: AiMemoryRepository,
  ) {}

  async execute(input: { accessToken: string; memoryId: string }): Promise<void> {
    const identity = await this.currentUser.execute(input.accessToken);
    const deleted = await this.database.transaction((client) =>
      this.repository.softDelete(client, identity.userId, input.memoryId),
    );
    if (!deleted)
      throw new AiCompanionError(
        'RESOURCE_NOT_FOUND',
        404,
        'AI memory was not found',
      );
  }
}
