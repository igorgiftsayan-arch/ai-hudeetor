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
    private readonly providerConsent?: {
      required: boolean;
      documentVersion: string;
    },
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
    return this.database.transaction(async (client) => {
      if (this.providerConsent?.required) {
        const consent = await client.query(
          `select 1 from user_consents where user_id=$1 and consent_type='aiProviderProcessing' and document_version=$2 limit 1`,
          [user.userId, this.providerConsent.documentVersion],
        );
        if (!consent.rows[0])
          throw new IdentityError(
            'AI_PROVIDER_CONSENT_REQUIRED',
            409,
            'Current external AI provider consent is required',
          );
      }
      return this.repository.startQuickReply(client, {
        ...input,
        userId: user.userId,
      });
    });
  }
}
