import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';

@Injectable()
export class AutomaticRecoveryService implements OnModuleInit {
  constructor(@Inject(DatabaseToken) private readonly database:DatabaseService) {}

  onModuleInit():void {
    setInterval(()=>void this.sweep().catch(()=>console.error(JSON.stringify({event:'automatic_recovery_sweep_error',errorCategory:'databaseUnavailable'}))),30_000).unref();
    void this.sweep().catch(()=>console.error(JSON.stringify({event:'automatic_recovery_sweep_error',errorCategory:'databaseUnavailable'})));
  }

  async sweep():Promise<void>{
    await this.database.transaction(async(client)=>{
      await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) select gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',a.id,jsonb_build_object('analysisId',a.id::text),now(),now(),0 from food_analyses a join food_analysis_request_receipts r on r.food_analysis_id=a.id where a.status='outcomeUnknown' and r.submission_state='accepted' and r.provider_request_id is not null and not exists(select 1 from outbox_messages o where o.event_type='food.analysis_reconciliation_requested.v1' and o.aggregate_id=a.id and o.published_at is null)`);
      await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) select gen_random_uuid(),'ai-companion.operation_reconciliation_requested.v1','aiOperation',a.id,jsonb_build_object('operationId',a.id::text),now(),now(),0 from ai_operations a join ai_operation_request_receipts r on r.operation_id=a.id where a.status='outcomeUnknown' and r.submission_state='accepted' and r.provider_request_id is not null and not exists(select 1 from outbox_messages o where o.event_type='ai-companion.operation_reconciliation_requested.v1' and o.aggregate_id=a.id and o.published_at is null)`);
      const retryFood=await client.query<{id:string}>(`update food_analyses a set status='queued',processing_attempt_id=null,updated_at=now() from food_analysis_request_receipts r where r.food_analysis_id=a.id and a.status='processing' and a.updated_at < now()-interval '2 minutes' and r.submission_state='prepared' returning a.id`);
      for(const row of retryFood.rows)await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'food.analysis_requested.v1','foodAnalysis',$1,jsonb_build_object('analysisId',($1::uuid)::text),now(),now(),0)`,[row.id]);
      const food=await client.query<{id:string}>(
        `update food_analyses a set status='outcomeUnknown',updated_at=now()
           from food_analysis_request_receipts r
          where r.food_analysis_id=a.id and a.status='processing'
            and a.updated_at < now()-interval '2 minutes'
            and r.submission_state='accepted' and r.provider_request_id is not null
          returning a.id`,
      );
      for(const row of food.rows) await client.query(
        `insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
         values(gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',$1,jsonb_build_object('analysisId',($1::uuid)::text),now(),now(),0)`,[row.id]);
      await client.query(
        `with stranded as (
           update food_analyses a set status='outcomeUnknown',updated_at=now()
            from food_analysis_request_receipts r
           where r.food_analysis_id=a.id and a.status='processing'
             and a.updated_at < now()-interval '2 minutes'
             and r.submission_state='submitting' and r.provider_request_id is null
           returning a.id
         ) update food_analysis_request_receipts r set submission_state='ambiguous',updated_at=now()
            from stranded where r.food_analysis_id=stranded.id`,
      );

      const retryAi=await client.query<{id:string}>(`update ai_operations a set status='queued',processing_attempt_id=null,updated_at=now() where a.status='processing' and a.updated_at < now()-interval '2 minutes' and not exists(select 1 from ai_operation_request_receipts r where r.operation_id=a.id) returning a.id`);
      for(const row of retryAi.rows)await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'ai-companion.quick_reply_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now(),0)`,[row.id]);
      const retryPreparedAi=await client.query<{id:string}>(`update ai_operations a set status='queued',processing_attempt_id=null,updated_at=now() from ai_operation_request_receipts r where r.operation_id=a.id and a.status='processing' and a.updated_at < now()-interval '2 minutes' and r.submission_state='prepared' returning a.id`);
      for(const row of retryPreparedAi.rows)await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'ai-companion.quick_reply_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now(),0)`,[row.id]);
      const ai=await client.query<{id:string}>(
        `update ai_operations a set status='outcomeUnknown',updated_at=now()
           from ai_operation_request_receipts r
          where r.operation_id=a.id and a.status='processing'
            and a.updated_at < now()-interval '2 minutes'
            and r.submission_state='accepted' and r.provider_request_id is not null
          returning a.id`,
      );
      for(const row of ai.rows) await client.query(
        `insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
         values(gen_random_uuid(),'ai-companion.operation_reconciliation_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now(),0)`,[row.id]);
      await client.query(
        `with stranded as (
           update ai_operations a set status='outcomeUnknown',updated_at=now()
            from ai_operation_request_receipts r
           where r.operation_id=a.id and a.status='processing'
             and a.updated_at < now()-interval '2 minutes'
             and r.submission_state='submitting' and r.provider_request_id is null
           returning a.id
         ) update ai_operation_request_receipts r set submission_state='ambiguous',updated_at=now()
            from stranded where r.operation_id=stranded.id`,
      );
    });
  }
}
