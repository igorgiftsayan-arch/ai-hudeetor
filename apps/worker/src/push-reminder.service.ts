/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import webpush from 'web-push';
import { createHash } from 'node:crypto';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';
import type { Job } from 'bullmq';

@Injectable()
export class PushReminderService implements OnModuleInit {
  constructor(@Inject(DatabaseToken) private readonly db: DatabaseService, private readonly config: { enabled:boolean; subject?:string; publicKey?:string; privateKey?:string }) {
    if (config.enabled) webpush.setVapidDetails(config.subject!,config.publicKey!,config.privateKey!);
  }
  onModuleInit() { if (!this.config.enabled) return; setInterval(()=>void this.schedule().catch(()=>console.error(JSON.stringify({event:'push_schedule_error',errorCategory:'databaseUnavailable'}))),30_000).unref(); void this.recoverStale().then(()=>this.schedule()).catch(()=>console.error(JSON.stringify({event:'push_schedule_error',errorCategory:'databaseUnavailable'}))); }

  async schedule(now = new Date()) {
    if (!this.config.enabled) return;
    const candidates = await this.db.query<any>(`select p.user_id,p.local_time::text,p.timezone,s.id subscription_id from push_notification_preferences p join push_subscriptions s on s.user_id=p.user_id and s.status='active' where p.enabled=true`);
    for (const row of candidates.rows) {
      const lag=dueLagMinutes(now,row.timezone,row.local_time.slice(0,5)); if(lag<0||lag>5)continue;
      const scheduledFor = new Date(Math.floor(now.getTime()/60_000)*60_000-lag*60_000);
      await this.db.transaction(async (client)=>{
        const inserted = await client.query<{id:string}>(`insert into push_deliveries (id,user_id,subscription_id,reminder_type,scheduled_for,status) values (gen_random_uuid(),$1,$2,'dailyCheckin',$3,'queued') on conflict (subscription_id,reminder_type,scheduled_for) do nothing returning id`,[row.user_id,row.subscription_id,scheduledFor]);
        const id=inserted.rows[0]?.id;
        if (id) await client.query(`insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values (gen_random_uuid(),'notifications.push_delivery_requested.v1','pushDelivery',$1,jsonb_build_object('deliveryId',($1::uuid)::text),now(),now(),0)`,[id]);
      });
    }
  }

  async process(job: Job<{outboxId:string}>) {
    if (!this.config.enabled) return;
    const event = await this.db.query<{payload:{deliveryId:string}}>(`select payload from outbox_messages where id=$1 and event_type='notifications.push_delivery_requested.v1'`,[job.data.outboxId]);
    const id=event.rows[0]?.payload.deliveryId; if(!id)return;
    const claimed=await this.db.query<any>(`update push_deliveries d set status='processing',attempt_count=attempt_count+1,updated_at=now() from push_subscriptions s,push_notification_preferences p where d.id=$1 and d.subscription_id=s.id and d.user_id=s.user_id and p.user_id=d.user_id and d.status in ('queued','technicalError') and s.status='active' and p.enabled=true returning d.id,d.subscription_id,s.endpoint,s.p256dh,s.auth_secret`,[id]);
    const row=claimed.rows[0]; if(!row)return;
    try {
      const topic=createHash('sha256').update(`daily:${id}`).digest('base64url').slice(0,32);
      await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_secret}},JSON.stringify({title:'AI-друг',body:'Пора ненадолго заглянуть в приложение.',url:'/marathon',deliveryId:id}),{TTL:3600,urgency:'normal',topic});
      await this.db.query(`update push_deliveries set status='delivered',delivered_at=now(),last_error_category=null,updated_at=now() where id=$1 and status='processing'`,[id]);
    } catch(error) {
      const statusCode = typeof error==='object' && error && 'statusCode' in error ? Number((error as {statusCode?:number}).statusCode) : 0;
      const expired=statusCode===404||statusCode===410;
      await this.db.transaction(async(client)=>{
        await client.query(`update push_deliveries set status=$2,last_error_category=$3,updated_at=now() where id=$1 and status='processing'`,[id,expired?'expired':'technicalError',expired?'subscriptionExpired':'deliveryFailed']);
        if(expired) await client.query(`update push_subscriptions set status='expired',revoked_at=now(),updated_at=now() where id=$1`,[row.subscription_id]);
      });
      if(!expired) throw error;
    }
  }

  private async recoverStale(){await this.db.query(`update push_deliveries set status='deliveryUnknown',last_error_category='workerInterruptedAfterDispatch',updated_at=now() where status='processing' and updated_at < now()-interval '5 minutes'`);}
}

function localTime(now:Date,timezone:string){ const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now); const value=(t:string)=>parts.find((p)=>p.type===t)?.value; return `${value('hour')}:${value('minute')}`; }
function dueLagMinutes(now:Date,timezone:string,target:string){const current=localTime(now,timezone).split(':').map(Number);const desired=target.split(':').map(Number);return (current[0]??0)*60+(current[1]??0)-((desired[0]??0)*60+(desired[1]??0));}
