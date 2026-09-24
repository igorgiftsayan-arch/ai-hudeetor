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
