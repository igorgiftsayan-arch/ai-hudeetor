import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
export class GetCurrentWalletUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
  ) {}
  async execute(accessToken: string) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query<{ id: string; balance: string }>(
      `select w.id, coalesce(sum(t.amount_tokens),0)::text as balance from token_wallets w left join token_transactions t on t.wallet_id=w.id where w.user_id=$1 group by w.id`,
      [user.userId],
    );
    if (!result.rows[0]) return { walletId: null, availableBalance: 0 };
    return {
      walletId: result.rows[0].id,
      availableBalance: Number(result.rows[0].balance),
    };
  }
}
