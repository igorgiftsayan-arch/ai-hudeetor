import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { AiProviderConsentService } from '../../identity/application/ai-provider-consent.service';
import {
  IdentityError,
  identityErrors,
} from '../../identity/domain/identity-error';
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
    private readonly providerConsent?: AiProviderConsentService,
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
    if (!user.emailVerified) throw identityErrors.emailVerificationRequired();
    await this.providerConsent?.assertAccepted(user.userId);
    return this.database.transaction((client) =>
      this.repository.startQuickReply(client, {
        ...input,
        userId: user.userId,
      }),
    );
  }
}
