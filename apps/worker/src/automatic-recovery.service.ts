import { Inject, Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { DatabaseService } from '@atlas/backend';
import { AiRecoveryDeadlineService, DatabaseService as DatabaseToken } from '@atlas/backend';

@Injectable()
export class AutomaticRecoveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running=false;
  constructor(@Inject(DatabaseToken) private readonly database:DatabaseService) {}

  onModuleInit():void {
    this.timer=setInterval(()=>void this.sweep().catch(()=>console.error(JSON.stringify({event:'automatic_recovery_sweep_error',errorCategory:'databaseUnavailable'}))),30_000).unref();
    void this.sweep().catch(()=>console.error(JSON.stringify({event:'automatic_recovery_sweep_error',errorCategory:'databaseUnavailable'})));
  }

  onModuleDestroy():void { if(this.timer)clearInterval(this.timer); }

  async sweep():Promise<void>{
    if(this.running)return;
    this.running=true;
    try { await this.runSweep(); } finally { this.running=false; }
  }

  private async runSweep():Promise<void>{
    await new AiRecoveryDeadlineService(this.database).sweep();
    await this.database.transaction(async(client)=>{
      await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) select gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',a.id,jsonb_build_object('analysisId',a.id::text),now(),now(),0 from food_analyses a join food_analysis_request_receipts r on r.food_analysis_id=a.id where a.status='outcomeUnknown' and r.submission_state='accepted' and r.provider_request_id is not null and not exists(select 1 from outbox_messages o where o.event_type='food.analysis_reconciliation_requested.v1' and o.aggregate_id=a.id and o.published_at is null)`);
      await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) select gen_random_uuid(),'ai-companion.operation_reconciliation_requested.v1','aiOperation',a.id,jsonb_build_object('operationId',a.id::text),now(),now(),0 from ai_operations a join ai_operation_request_receipts r on r.operation_id=a.id where a.status='outcomeUnknown' and r.submission_state='accepted' and r.provider_request_id is not null and not exists(select 1 from outbox_messages o where o.event_type='ai-companion.operation_reconciliation_requested.v1' and o.aggregate_id=a.id and o.published_at is null)`);
      const food=await client.query<{id:string}>(`select id from food_analyses where status='processing' and updated_at < now()-interval '2 minutes' order by updated_at limit 50 for update skip locked`);
      for(const row of food.rows){
        const receipt=(await client.query<{submission_state:string;provider_request_id:string|null}>(`select submission_state,provider_request_id from food_analysis_request_receipts where food_analysis_id=$1 for update`,[row.id])).rows[0];
        if(!receipt||receipt.submission_state==='prepared'){
          await client.query(`update food_analyses set status='queued',processing_attempt_id=null,updated_at=now() where id=$1`,[row.id]);
          await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'food.analysis_requested.v1','foodAnalysis',$1,jsonb_build_object('analysisId',($1::uuid)::text),now(),now(),0)`,[row.id]);
        }else if(receipt.submission_state==='accepted'&&receipt.provider_request_id){
          await client.query(`update food_analyses set status='outcomeUnknown',updated_at=now() where id=$1`,[row.id]);
          await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',$1,jsonb_build_object('analysisId',($1::uuid)::text),now(),now(),0)`,[row.id]);
        }else if(receipt.submission_state==='submitting'){
          await client.query(`update food_analyses set status='outcomeUnknown',updated_at=now() where id=$1`,[row.id]);
          await client.query(`update food_analysis_request_receipts set submission_state='ambiguous',updated_at=now() where food_analysis_id=$1`,[row.id]);
        }
      }
      const ai=await client.query<{id:string}>(`select id from ai_operations where status='processing' and updated_at < now()-interval '2 minutes' order by updated_at limit 50 for update skip locked`);
      for(const row of ai.rows){
        const receipt=(await client.query<{submission_state:string;provider_request_id:string|null}>(`select submission_state,provider_request_id from ai_operation_request_receipts where operation_id=$1 for update`,[row.id])).rows[0];
        if(!receipt||receipt.submission_state==='prepared'){
          await client.query(`update ai_operations set status='queued',processing_attempt_id=null,updated_at=now() where id=$1`,[row.id]);
          await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'ai-companion.quick_reply_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now(),0)`,[row.id]);
        }else if(receipt.submission_state==='accepted'&&receipt.provider_request_id){
          await client.query(`update ai_operations set status='outcomeUnknown',updated_at=now() where id=$1`,[row.id]);
          await client.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values(gen_random_uuid(),'ai-companion.operation_reconciliation_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now(),0)`,[row.id]);
        }else if(receipt.submission_state==='submitting'){
          await client.query(`update ai_operations set status='outcomeUnknown',updated_at=now() where id=$1`,[row.id]);
          await client.query(`update ai_operation_request_receipts set submission_state='ambiguous',updated_at=now() where operation_id=$1`,[row.id]);
        }
      }
    });
  }
}
