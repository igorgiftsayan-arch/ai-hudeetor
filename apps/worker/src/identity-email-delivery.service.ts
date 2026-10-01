import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '@atlas/backend';
import {
  DatabaseService as DatabaseToken,
  IdentityEmailTokenService,
} from '@atlas/backend';
import { EmailTransport } from './email-transport';

type DeliveryRow = {
  id: string;
  template: 'verifyEmail' | 'passwordReset';
  email_normalized: string;
  token_ciphertext: string;
  token_iv: string;
  token_auth_tag: string;
  claim_id: string;
};

@Injectable()
export class IdentityEmailDeliveryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IdentityEmailDeliveryService.name);
  private interval?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DatabaseToken) private readonly database: DatabaseService,
    @Inject(EmailTransport) private readonly transport: EmailTransport,
    @Inject(IdentityEmailTokenService)
    private readonly tokens: IdentityEmailTokenService,
    @Inject('PUBLIC_WEB_URL') private readonly publicWebUrl: string,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => void this.pollSafely(), 1000);
    this.interval.unref();
    void this.pollSafely();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async pollSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.deliverPending();
    } catch {
      this.logger.error({ status: 'pollFailed', code: 'databaseError' });
    } finally {
      this.running = false;
    }
  }

  async deliverPending(): Promise<void> {
    for (let count = 0; count < 20; count += 1) {
      const delivery = await this.claim();
      if (!delivery) return;
      try {
        const rawToken = this.tokens.decrypt({
          tokenCiphertext: delivery.token_ciphertext,
          tokenIv: delivery.token_iv,
          tokenAuthTag: delivery.token_auth_tag,
        });
        const route =
          delivery.template === 'verifyEmail'
            ? 'verify-email'
            : 'reset-password';
        await this.transport.send({
          messageId: `<identity-${delivery.id}@rebody38.ru>`,
          to: delivery.email_normalized,
          subject:
            delivery.template === 'verifyEmail'
              ? 'Подтвердите email в Rebody'
              : 'Сброс пароля Rebody',
          text: `${this.publicWebUrl}/${route}#token=${encodeURIComponent(rawToken)}`,
        });
        await this.database.query(
          `update identity_email_deliveries
              set status='sent', sent_at=now(), updated_at=now(),
                  token_ciphertext='', token_iv='', token_auth_tag='',
                  last_error_code=null
            where id=$1 and status='sending' and claim_id=$2`,
          [delivery.id, delivery.claim_id],
        );
        this.logger.log({ deliveryId: delivery.id, status: 'sent' });
      } catch (error) {
        const code = classifyEmailError(error);
        await this.database.query(
          `update identity_email_deliveries
              set status=case when attempts >= 5 then 'failed' else 'pending' end,
                  available_at=now() + make_interval(secs => least(300, power(2, attempts)::int * 5)),
                  last_error_code=$2, updated_at=now()
            where id=$1 and status='sending' and claim_id=$3`,
          [delivery.id, code, delivery.claim_id],
        );
        this.logger.warn({ deliveryId: delivery.id, status: 'retry', code });
      }
    }
  }

  private claim(): Promise<DeliveryRow | null> {
    return this.database.transaction(async (client) => {
      await client.query(
        `update identity_email_deliveries d
            set status='failed', last_error_code='tokenUnavailable', updated_at=now(),
                token_ciphertext='', token_iv='', token_auth_tag=''
           from identity_tokens t
          where t.id=d.token_id and d.status in ('pending','sending')
            and (t.consumed_at is not null or t.expires_at <= now())`,
      );
      const claimId = randomUUID();
      const result = await client.query<DeliveryRow>(
        `with candidate as (
           select d.id from identity_email_deliveries d
            where ((d.status='pending' and d.available_at <= now())
               or (d.status='sending' and d.claimed_at < now() - interval '5 minutes'))
              and d.attempts < 5
            order by d.created_at
            for update skip locked limit 1
         )
         update identity_email_deliveries d
            set status='sending', claimed_at=now(), claim_id=$1,
                attempts=attempts+1, updated_at=now()
           from candidate c, users u
          where d.id=c.id and u.id=d.user_id
         returning d.id,d.template,u.email_normalized,d.token_ciphertext,d.token_iv,d.token_auth_tag,d.claim_id`,
        [claimId],
      );
      return result.rows[0] ?? null;
    });
  }
}

function classifyEmailError(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String(error.code);
    if (/AUTH|EAUTH|535/.test(code)) return 'authentication';
    if (/TIMEOUT|ETIMEDOUT/.test(code)) return 'timeout';
    if (/ECONN|ENET|EHOST/.test(code)) return 'network';
  }
  return 'smtpError';
}
