/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

type VisionResult =
  | { kind:'success'; recognized:Record<string,unknown>; suitability:Record<string,unknown>; providerReference?:string }
  | { kind:'technicalError'; errorCategory:string }
  | { kind:'outcomeUnknown'; providerReference?:string };

@Injectable()
export class FoodAnalysisProcessor {
  private readonly storage?: S3Client;
  constructor(@Inject(DatabaseToken) private readonly db: DatabaseService, private readonly config: {
    provider:'fake'|'genapi'; fakeMode:'success'|'technicalError'|'outcomeUnknown';
    apiKey?:string;nativeBaseUrl:string;networkId?:string;modelVersion:string;timeoutMs:number;
    s3?:{endpoint:string;region:string;bucket:string;accessKeyId:string;secretAccessKey:string;forcePathStyle:boolean};
  }) { if(config.s3) this.storage=new S3Client({endpoint:config.s3.endpoint,region:config.s3.region,forcePathStyle:config.s3.forcePathStyle,credentials:{accessKeyId:config.s3.accessKeyId,secretAccessKey:config.s3.secretAccessKey}}); }

  async process(job: Job<{outboxId:string}>): Promise<void> {
    const event = await this.db.query<{payload:{analysisId:string}}>(`select payload from outbox_messages where id=$1 and event_type='food.analysis_requested.v1'`,[job.data.outboxId]);
    const analysisId = event.rows[0]?.payload.analysisId;
    if (!analysisId) return;
    const claimed = await this.db.transaction(async (client) => {
      const row = (await client.query<any>(`update food_analyses set status='processing',updated_at=now() where id=$1 and status='queued' returning id,user_id,runtime_adapter`,[analysisId])).rows[0];
      if (!row) return null;
      const source = (await client.query<any>(`select i.object_key,i.sha256,p.target_weight_kg,coalesce(jsonb_agg(jsonb_build_object('category',m.category,'key',m.key,'value',m.value)) filter (where m.id is not null),'[]'::jsonb) facts from uploaded_images i join food_analyses a on a.uploaded_image_id=i.id left join user_profiles p on p.user_id=a.user_id left join ai_memories m on m.user_id=a.user_id and m.deleted_at is null and m.category in ('preference','restriction','goal') where a.id=$1 group by i.object_key,i.sha256,p.target_weight_kg`,[analysisId])).rows[0];
      const payload = { analysisId, provider:this.config.provider,networkId:this.config.provider==='fake'?'fake-food-v1':this.config.networkId,modelVersion:this.config.provider==='fake'?'fake-food-v1':this.config.modelVersion,promptVersion:'food-analysis-v1',objectKey: source.object_key, imageSha256: source.sha256, knownProfile: { targetWeightKg: source.target_weight_kg ?? null, facts: source.facts } };
      const serialized = JSON.stringify(payload);
      const hash = createHash('sha256').update(serialized).digest('hex');
      await client.query(`insert into food_analysis_request_receipts (food_analysis_id,user_id,provider,model,request_payload,request_hash,submission_state) values ($1,$2,$3,$4,$5::jsonb,$6,'prepared') on conflict (food_analysis_id) do nothing`,[analysisId,row.user_id,row.runtime_adapter,payload.modelVersion,serialized,hash]);
      const receipt = (await client.query<any>(`select request_hash,submission_state from food_analysis_request_receipts where food_analysis_id=$1 for update`,[analysisId])).rows[0];
      if (receipt.request_hash !== hash || receipt.submission_state !== 'prepared') throw new Error('Food request receipt is not safely claimable');
      await client.query(`update food_analysis_request_receipts set submission_state='submitting',submitted_at=now(),updated_at=now() where food_analysis_id=$1`,[analysisId]);
      return { ...row, payload };
    });
    if (!claimed) return;

    const result:VisionResult = claimed.runtime_adapter!==this.config.provider ? {kind:'technicalError',errorCategory:'providerConfigurationChanged'} : await this.executeVision(claimed);
    await this.finalize(analysisId, result);
  }

  async reconcile(job: Job<{outboxId:string}>): Promise<void> {
    const event = await this.db.query<{payload:{analysisId:string}}>(
      `select payload from outbox_messages where id=$1 and event_type='food.analysis_reconciliation_requested.v1'`,
      [job.data.outboxId],
    );
    const analysisId = event.rows[0]?.payload.analysisId;
    if (!analysisId || this.config.provider !== 'genapi' || !this.config.apiKey) return;
    const found = await this.db.query<{provider_request_id:string}>(
      `select r.provider_request_id
         from food_analyses a
         join food_analysis_request_receipts r on r.food_analysis_id=a.id
        where a.id=$1 and a.status='outcomeUnknown'
          and r.submission_state='accepted' and r.provider_request_id is not null`,
      [analysisId],
    );
    const providerReference = found.rows[0]?.provider_request_id;
    if (!providerReference) return;
    const result = await this.pollKnownRequest(providerReference);
    if (!result) {
      await this.db.query(
        `insert into outbox_messages
          (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts)
         select gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',$1,
                jsonb_build_object('analysisId',($1::uuid)::text),now(),now()+interval '30 seconds',0
          where exists(select 1 from food_analyses where id=$1 and status='outcomeUnknown')`,
        [analysisId],
      );
      return;
    }
    await this.finalize(analysisId, result, 'outcomeUnknown');
  }

  private async finalize(
    analysisId:string,
    result:VisionResult,
    expectedStatus:'processing'|'outcomeUnknown'='processing',
  ):Promise<void> {
    await this.db.transaction(async (client) => {
      const operation = (await client.query<any>(`select id,user_id from food_analyses where id=$1 and status=$2 for update`,[analysisId,expectedStatus])).rows[0];
      if (!operation) return;
      const reservation = (await client.query<any>(`select id,wallet_id,amount_tokens from token_transactions where food_analysis_id=$1 and entry_type='aiReservation' for update`,[analysisId])).rows[0];
      if (result.kind === 'success') {
        await client.query(`update food_analyses set status='analyzed',recognized_result=$2::jsonb,suitability_result=$3::jsonb,provider_reference=$4,analyzed_at=now(),updated_at=now() where id=$1`,[analysisId,JSON.stringify(result.recognized),JSON.stringify(result.suitability),result.providerReference ?? null]);
        await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reason,reference_type,reference_id,food_analysis_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiConfirmation',0,'foodPhotoAnalysis','foodAnalysis',$3,$3,$4)`,[reservation.wallet_id,operation.user_id,analysisId,reservation.id]);
        await client.query(`update food_analysis_request_receipts set submission_state='completed',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      } else if (result.kind === 'technicalError') {
        await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reason,reference_type,reference_id,food_analysis_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiRefund',$3,'foodPhotoAnalysis','foodAnalysis',$4,$4,$5)`,[reservation.wallet_id,operation.user_id,-reservation.amount_tokens,analysisId,reservation.id]);
        await client.query(`update food_analyses set status='technicalError',error_category=$2,updated_at=now() where id=$1`,[analysisId,result.errorCategory]);
        await client.query(`update food_analysis_request_receipts set submission_state='completed',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      } else {
        await client.query(`update food_analyses set status='outcomeUnknown',provider_reference=coalesce($2,provider_reference),updated_at=now() where id=$1`,[analysisId,result.providerReference ?? null]);
        await client.query(`update food_analysis_request_receipts set submission_state=$2,provider_request_id=coalesce($3,provider_request_id),updated_at=now() where food_analysis_id=$1`,[analysisId,result.providerReference?'accepted':'ambiguous',result.providerReference ?? null]);
        if(result.providerReference) await client.query(`insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values (gen_random_uuid(),'food.analysis_reconciliation_requested.v1','foodAnalysis',$1,jsonb_build_object('analysisId',($1::uuid)::text),now(),now()+interval '15 seconds',0)`,[analysisId]);
      }
    });
  }

  private async pollKnownRequest(providerReference:string):Promise<VisionResult|null>{
    let poll:Response;
    try {
      poll=await fetch(`${this.config.nativeBaseUrl.replace(/\/$/,'')}/request/get/${encodeURIComponent(providerReference)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`,'Accept':'application/json'}});
    } catch {
      return null;
    }
    if(!poll.ok)return null;
    const state:any=await poll.json().catch(()=>null);
    if(state?.status==='processing'||state?.status==='starting')return null;
    if(state?.status==='error')return{kind:'technicalError',errorCategory:'providerError'};
    if(state?.status!=='success')return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
    const content=extractProviderContent(state);
    if(!content)return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
    try {
      const parsed=JSON.parse(content);
      if(!validResult(parsed))throw new Error();
      return{kind:'success',recognized:parsed.recognized,suitability:parsed.suitability,providerReference};
    } catch {
      return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
    }
  }

  private async executeVision(claimed:any):Promise<VisionResult>{
    const facts=claimed.payload.knownProfile.facts as Array<{category:string;key:string;value:string}>;
    const hasKnownProfile=Boolean(claimed.payload.knownProfile.targetWeightKg || facts.length);
    if(this.config.provider==='fake'){
      if(this.config.fakeMode==='technicalError') return {kind:'technicalError',errorCategory:'providerUnavailable'};
      if(this.config.fakeMode==='outcomeUnknown') return {kind:'outcomeUnknown'};
      return {kind:'success',recognized:{kind:'food',dishName:'Тестовое блюдо',items:[{name:'Тестовый продукт',confidence:1}],uncertaintyNotes:[]},suitability:hasKnownProfile?{status:'mixed',source:'profile',observations:['Оценка основана только на сохранённых целях и предпочтениях пользователя.'],missingData:[]}:{status:'insufficientData',source:'none',observations:[],missingData:['Не хватает подтверждённых целей или ограничений питания.']}};
    }
    if(!this.storage||!this.config.s3||!this.config.apiKey||!this.config.networkId) return {kind:'technicalError',errorCategory:'providerConfiguration'};
    const object=await this.storage.send(new GetObjectCommand({Bucket:this.config.s3.bucket,Key:claimed.payload.objectKey}));
    const bytes=object.Body?Buffer.from(await object.Body.transformToByteArray()):Buffer.alloc(0);
    if(!bytes.length||bytes.length>10_485_760) return {kind:'technicalError',errorCategory:'imageUnavailable'};
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),this.config.timeoutMs);
    let response:Response;
    const requestBody={is_sync:false,model:this.config.modelVersion,response_format:{type:'json_object'},messages:[{role:'system',content:'Return strict JSON only. Recognize visible food without inventing hidden ingredients. Use only supplied known profile facts for suitability. If insufficient, use status insufficientData.'},{role:'user',content:[{type:'text',text:`Known profile JSON: ${JSON.stringify(claimed.payload.knownProfile)}. Required JSON: {recognized:{kind:food|nonFood|ambiguous,dishName:string|null,items:[{name,confidence}],uncertaintyNotes:string[]},suitability:{status:matches|doesNotMatch|mixed|insufficientData,source:profile|none,observations:string[],missingData:string[]}}`},{type:'image_url',image_url:{url:`data:${object.ContentType ?? 'image/jpeg'};base64,${bytes.toString('base64')}`}}]}]};
    try { response=await fetch(`${this.config.nativeBaseUrl.replace(/\/$/,'')}/networks/${encodeURIComponent(this.config.networkId)}`,{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`,'Content-Type':'application/json','Accept':'application/json','X-Request-ID':claimed.id},body:JSON.stringify(requestBody),signal:controller.signal}); }
    catch { clearTimeout(timer); return {kind:'outcomeUnknown'}; }
    if(!response.ok)return{kind:'technicalError',errorCategory:`http${response.status}`};
    const accepted:any=await response.json().catch(()=>null); const requestId=accepted?.request_id;
    if(typeof requestId!=='string'&&typeof requestId!=='number')return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
    const providerReference=String(requestId);
    await this.db.query(`update food_analysis_request_receipts set submission_state='accepted',provider_request_id=$2,updated_at=now() where food_analysis_id=$1 and submission_state='submitting'`,[claimed.id,providerReference]);
    while(!controller.signal.aborted){
      await new Promise((resolve)=>setTimeout(resolve,1500));
      let poll:Response; try{poll=await fetch(`${this.config.nativeBaseUrl.replace(/\/$/,'')}/request/get/${encodeURIComponent(providerReference)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`,'Accept':'application/json'},signal:controller.signal});}catch{if(controller.signal.aborted){clearTimeout(timer);return{kind:'outcomeUnknown',providerReference} as VisionResult;}continue;}
      if(!poll.ok)continue;
      const state:any=await poll.json().catch(()=>null); if(state?.status==='processing'||state?.status==='starting')continue;
      if(state?.status==='error'){clearTimeout(timer);return{kind:'technicalError',errorCategory:'providerError'};}
      if(state?.status==='success'){
        clearTimeout(timer); const content=extractProviderContent(state); if(!content)return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
        try{const parsed=JSON.parse(content);if(!validResult(parsed))throw new Error();return{kind:'success',recognized:parsed.recognized,suitability:parsed.suitability,providerReference};}catch{return{kind:'technicalError',errorCategory:'invalidProviderResponse'};}
      }
      clearTimeout(timer);return{kind:'technicalError',errorCategory:'invalidProviderResponse'};
    }
    clearTimeout(timer);return{kind:'outcomeUnknown',providerReference} as VisionResult;
  }
}

function validResult(value:any){return value&&typeof value==='object'&&value.recognized&&['food','nonFood','ambiguous'].includes(value.recognized.kind)&&Array.isArray(value.recognized.items)&&value.suitability&&['matches','doesNotMatch','mixed','insufficientData'].includes(value.suitability.status)&&['profile','none'].includes(value.suitability.source)&&Array.isArray(value.suitability.observations)&&Array.isArray(value.suitability.missingData);}
function extractProviderContent(value:any):string|null{const candidates=[value?.full_response?.choices?.[0]?.message?.content,value?.full_response?.[0]?.choices?.[0]?.message?.content,value?.result?.[0],value?.output?.choices?.[0]?.message?.content];return candidates.find((item)=>typeof item==='string'&&item.trim())??null;}
