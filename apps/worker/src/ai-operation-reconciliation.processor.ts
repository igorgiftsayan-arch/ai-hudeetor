/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  compensateExpiredAiRequest,
  DatabaseService as DatabaseToken,
  FinalizeReconciledAiOutcomeUseCase,
  GenApiOutcomeReconciliationClient,
} from '@atlas/backend';
import type { DatabaseService, AiProviderRequest } from '@atlas/backend';

@Injectable()
export class AiOperationReconciliationProcessor {
  constructor(@Inject(DatabaseToken) private readonly database:DatabaseService,private readonly config:{provider:'fake'|'genapi';apiKey?:string;requestApiBaseUrl:string;model?:string;timeoutMs:number}){}

  async process(job:Job<{outboxId:string}>):Promise<void>{
    if(this.config.provider!=='genapi'||!this.config.apiKey||!this.config.model)return;
    const event=await this.database.query<{payload:{operationId:string}}>(`select payload from outbox_messages where id=$1 and event_type='ai-companion.operation_reconciliation_requested.v1'`,[job.data.outboxId]);
    const operationId=event.rows[0]?.payload.operationId;if(!operationId)return;
    if(await this.database.transaction(client=>compensateExpiredAiRequest(client,'chat',operationId)))return;
    const found=await this.database.query<any>(`select a.id,a.created_at,a.updated_at,r.provider_request_id,r.request_payload from ai_operations a join ai_operation_request_receipts r on r.operation_id=a.id where a.id=$1 and a.status='outcomeUnknown' and r.submission_state='accepted' and r.provider_request_id is not null`,[operationId]);
    const row=found.rows[0];if(!row)return;
    const status=await this.lookup(row.provider_request_id);
    if(status==='pending'){await this.reschedule(operationId);return;}
    if(status==='technicalError'){await this.refund(operationId);return;}
    try{
      const verified=await new GenApiOutcomeReconciliationClient({apiKey:this.config.apiKey,requestApiBaseUrl:this.config.requestApiBaseUrl,model:this.config.model,timeoutMs:this.config.timeoutMs}).verifySuccess({operationId,providerRequestId:row.provider_request_id,request:row.request_payload as AiProviderRequest,operationCreatedAt:row.created_at,outcomeUnknownAt:row.updated_at});
      await new FinalizeReconciledAiOutcomeUseCase(this.database).execute(verified);
      await this.database.query(`update ai_operation_request_receipts set submission_state='completed',updated_at=now() where operation_id=$1`,[operationId]);
    }catch{await this.reschedule(operationId);}
  }

  private async lookup(requestId:string):Promise<'pending'|'success'|'technicalError'>{
    let response:Response;try{response=await fetch(`${this.config.requestApiBaseUrl.replace(/\/$/,'')}/request/get/${encodeURIComponent(requestId)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`,'Accept':'application/json'},signal:AbortSignal.timeout(this.config.timeoutMs)});}catch{return'pending';}
    if(!response.ok)return'pending';const body:any=await response.json().catch(()=>null);
    if(body?.status==='success')return'success';if(body?.status==='error')return'technicalError';return'pending';
  }

  private async refund(operationId:string):Promise<void>{await this.database.transaction(async(client)=>{
    if(await compensateExpiredAiRequest(client,'chat',operationId))return;
    const operation=(await client.query<{user_id:string}>(`select user_id from ai_operations where id=$1 and status='outcomeUnknown' for update`,[operationId])).rows[0];if(!operation)return;
    const reservation=(await client.query<any>(`select id,wallet_id,amount_tokens from token_transactions where operation_id=$1 and entry_type='aiReservation' for update`,[operationId])).rows[0];
    const terminal=await client.query(`select 1 from token_transactions where operation_id=$1 and entry_type in ('aiConfirmation','aiRefund')`,[operationId]);if(terminal.rowCount)return;
    await client.query(`insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,operation_id,reservation_id) values(gen_random_uuid(),$1,$2,'aiRefund',$3,'aiOperation',$4,$4,$5)`,[reservation.wallet_id,operation.user_id,-reservation.amount_tokens,operationId,reservation.id]);
    await client.query(`update ai_operations set status='technicalError',error_class='providerError',updated_at=now() where id=$1`,[operationId]);
    await client.query(`update ai_operation_request_receipts set submission_state='completed',updated_at=now() where operation_id=$1`,[operationId]);
  });}

  private async reschedule(operationId:string):Promise<void>{await this.database.query(`insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) select gen_random_uuid(),'ai-companion.operation_reconciliation_requested.v1','aiOperation',$1,jsonb_build_object('operationId',($1::uuid)::text),now(),now()+interval '30 seconds',0 where exists(select 1 from ai_operations where id=$1 and status='outcomeUnknown')`,[operationId]);}
}
