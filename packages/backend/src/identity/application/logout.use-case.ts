import type { IdentityRepository } from './identity-repository';
import type { SessionTokenService } from './identity-ports';

export class LogoutUseCase {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: SessionTokenService,
  ) {}

  async execute(accessToken: string, refreshToken: string): Promise<void> {
    if (!accessToken && !refreshToken) return;
    await this.repository.revokeByTokenHashes(
      accessToken ? this.tokens.hash(accessToken) : null,
      refreshToken ? this.tokens.hash(refreshToken) : null,
    );
  }
}
