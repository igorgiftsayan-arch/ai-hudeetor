import type { DatabaseService } from '../../infrastructure/database/database.service';
import { IdentityError } from '../domain/identity-error';

export class AiProviderConsentService {
  constructor(
    private readonly database: DatabaseService,
    readonly currentVersion: string,
    readonly disclosure: string,
  ) {}

  async getStatus(userId: string): Promise<{
    accepted: boolean;
    currentVersion: string;
    acceptedVersion: string | null;
    disclosure: string;
  }> {
    const result = await this.database.query<{ document_version: string }>(
      `select document_version from user_consents
        where user_id=$1 and consent_type='aiProviderProcessing'
        order by accepted_at desc limit 1`,
      [userId],
    );
    const acceptedVersion = result.rows[0]?.document_version ?? null;
    return {
      accepted: acceptedVersion === this.currentVersion,
      currentVersion: this.currentVersion,
      acceptedVersion,
      disclosure: this.disclosure,
    };
  }

  async accept(userId: string, version: string): Promise<void> {
    if (version !== this.currentVersion)
      throw new IdentityError(
        'CONSENT_VERSION_OUTDATED',
        409,
        'A current consent document version is required',
      );
    await this.database.query(
      `insert into user_consents
        (id,user_id,consent_type,document_version,source)
       values (gen_random_uuid(),$1,'aiProviderProcessing',$2,'web')
       on conflict (user_id,consent_type,document_version) do nothing`,
      [userId, version],
    );
  }

  async assertAccepted(userId: string): Promise<void> {
    if (!(await this.getStatus(userId)).accepted)
      throw new IdentityError(
        'AI_PROVIDER_CONSENT_REQUIRED',
        403,
        'AI provider processing consent is required',
      );
  }
}
