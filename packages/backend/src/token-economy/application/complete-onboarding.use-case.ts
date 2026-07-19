import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import type { OnboardingStatePort } from '../../identity/application/onboarding-state.port';
import { IdentityError } from '../../identity/domain/identity-error';

export class CompleteOnboardingUseCase {
  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly onboarding: OnboardingStatePort,
  ) {}
  async execute(input: { accessToken: string; idempotencyKey: string }) {
    const identity = await this.currentUser.execute(input.accessToken);
    return this.database.transaction(async (client) => {
      const hash = createHash('sha256').update('{}').digest('hex');
      await client.query(
        `insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state)
        values ($1,$2,'onboardingCompletion',$3,$4,'processing') on conflict do nothing`,
        [randomUUID(), identity.userId, input.idempotencyKey, hash],
      );
      const record = await client.query<{
        request_hash: string;
        state: string;
        response_body: {
          onboardingStatus: 'completed';
          starterTokensGranted: number;
          tokenBalance: number;
        } | null;
      }>(
        `select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='onboardingCompletion' and idempotency_key=$2 for update`,
        [identity.userId, input.idempotencyKey],
      );
      const existing = record.rows[0]!;
      if (existing.request_hash !== hash)
        throw new IdentityError(
          'IDEMPOTENCY_KEY_REUSED',
          409,
          'The idempotency key was already used with another request',
        );
      if (existing.state === 'completed' && existing.response_body)
        return existing.response_body;
      if (identity.onboardingStatus !== 'personaReady')
        throw new IdentityError(
          'ONBOARDING_INCOMPLETE',
          409,
          'Complete profile setup before completing onboarding',
        );
      const wallet = await client.query<{ id: string }>(
        `insert into token_wallets (id,user_id) values ($1,$2) on conflict (user_id) do update set user_id=excluded.user_id returning id`,
        [randomUUID(), identity.userId],
      );
      const transactionId = randomUUID();
      await client.query(
        `insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id)
        values ($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)`,
        [transactionId, wallet.rows[0]!.id, identity.userId, randomUUID()],
      );
      const onboardingStatus = await this.onboarding.advanceToCompleted(
        client,
        identity.userId,
      );
      if (onboardingStatus !== 'completed')
        throw new IdentityError(
          'ONBOARDING_INCOMPLETE',
          409,
          'Complete persona setup before completing onboarding',
        );
      const response = {
        onboardingStatus: 'completed' as const,
        starterTokensGranted: 100,
        tokenBalance: 100,
      };
      for (const [eventType, payload] of [
        ['profiles.onboarding_completed.v1', { userId: identity.userId }],
        [
          'token-economy.starter_tokens_added.v1',
          {
            userId: identity.userId,
            transactionId,
            amount: 100,
            balanceAfter: 100,
          },
        ],
      ] as const)
        await client.query(
          `insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
        values ($1,$2,'user',$3,$4::jsonb,now(),now(),0)`,
          [randomUUID(), eventType, identity.userId, JSON.stringify(payload)],
        );
      await client.query(
        `update idempotency_records set state='completed',response_status=201,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='onboardingCompletion' and idempotency_key=$3`,
        [JSON.stringify(response), identity.userId, input.idempotencyKey],
      );
      return response;
    });
  }
}
