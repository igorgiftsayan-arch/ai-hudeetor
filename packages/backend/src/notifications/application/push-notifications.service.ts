import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';

export class PushNotificationsService {
  constructor(private readonly db: DatabaseService, private readonly current: GetCurrentUserUseCase) {}

  async get(accessToken: string) {
    const user = await this.current.execute(accessToken);
    const preference = (await this.db.query<any>(`select enabled,local_time::text,timezone from push_notification_preferences where user_id=$1`, [user.userId])).rows[0];
    const count = (await this.db.query<{ count: number }>(`select count(*)::int count from push_subscriptions where user_id=$1 and status='active'`, [user.userId])).rows[0]?.count ?? 0;
    return { enabled: preference?.enabled ?? false, localTime: preference?.local_time?.slice(0,5) ?? null, timezone: preference?.timezone ?? null, permissionState: count ? 'granted' : 'notRequested', activeSubscriptionCount: count };
  }

  async savePreference(accessToken: string, input: { enabled: boolean; localTime?: string; timezone?: string }) {
    const user = await this.current.execute(accessToken);
    if (input.enabled && (!input.localTime || !input.timezone)) throw new IdentityError('PUSH_SCHEDULE_REQUIRED',422,'Time and timezone are required when reminders are enabled');
    if (input.timezone) validateTimezone(input.timezone);
    await this.db.query(`insert into push_notification_preferences (user_id,enabled,local_time,timezone) values ($1,$2,$3,$4) on conflict (user_id) do update set enabled=excluded.enabled,local_time=excluded.local_time,timezone=excluded.timezone,updated_at=now()`, [user.userId,input.enabled,input.enabled?input.localTime:null,input.enabled?input.timezone:null]);
    return this.get(accessToken);
  }

  async subscribe(accessToken: string, input: { endpoint: string; p256dh: string; auth: string; platform: string; permissionState: 'granted' }) {
    const user = await this.current.execute(accessToken);
    if (!input.endpoint.startsWith('https://') || input.p256dh.length < 16 || input.auth.length < 8) throw new IdentityError('PUSH_SUBSCRIPTION_INVALID',422,'Push subscription is invalid');
    const endpointHash = createHash('sha256').update(input.endpoint).digest('hex');
    const result = await this.db.query<any>(`insert into push_subscriptions (id,user_id,endpoint,endpoint_hash,p256dh,auth_secret,platform,status) values ($1,$2,$3,$4,$5,$6,$7,'active') on conflict (endpoint_hash) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,platform=excluded.platform,status='active',revoked_at=null,updated_at=now() returning id,platform,status`, [randomUUID(),user.userId,input.endpoint,endpointHash,input.p256dh,input.auth,input.platform]);
    return result.rows[0];
  }

  async unsubscribe(accessToken: string, id: string) {
    const user = await this.current.execute(accessToken);
    const result = await this.db.query(`update push_subscriptions set status='revoked',revoked_at=now(),updated_at=now() where id=$1 and user_id=$2 and status='active'`, [id,user.userId]);
    if (!result.rowCount) throw new IdentityError('PUSH_SUBSCRIPTION_NOT_FOUND',404,'Push subscription not found');
  }
}

function validateTimezone(value: string) { try { new Intl.DateTimeFormat('en-US',{timeZone:value}).format(); } catch { throw new IdentityError('PROFILE_TIMEZONE_INVALID',422,'Timezone is invalid'); } }
