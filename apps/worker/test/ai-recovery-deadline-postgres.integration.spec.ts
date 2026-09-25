import 'reflect-metadata';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService, FinalizeReconciledAiOutcomeUseCase, compensateExpiredAiRequest } from '@atlas/backend';
import { AiOperationProcessor } from '../src/ai-operation.processor';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';
import { AutomaticRecoveryService } from '../src/automatic-recovery.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('AI recovery deadline on actual PostgreSQL', () => {
  let admin: DatabaseService, db: DatabaseService, schema: string;
  beforeAll(async () => {
    admin = new DatabaseService(databaseUrl!); schema = `deadline_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`create schema "${schema}"`);
    const url = new URL(databaseUrl!); url.searchParams.set('options', `-c search_path=${schema},public`);
    db = new DatabaseService(url.toString());
    const folder = resolve(__dirname, '../../../database/migrations');
    for (const name of (await readdir(folder)).filter(n => n.endsWith('.sql')).sort()) await db.query(await readFile(resolve(folder,name),'utf8'));
  });
  afterEach(()=>jest.restoreAllMocks());
  afterAll(async () => { await db?.onApplicationShutdown(); if(schema) await admin.query(`drop schema "${schema}" cascade`); await admin?.onApplicationShutdown(); });
  async function seed(kind: 'chat'|'food', age: number, status='outcomeUnknown') {
    const user=randomUUID(),wallet=randomUUID(),id=randomUUID(),message=randomUUID(),conversation=randomUUID(),image=randomUUID();
    await db.query("insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",[user,`${user}@example.test`,randomUUID()]);
    await db.query('insert into token_wallets(id,user_id) values($1,$2)',[wallet,user]);
    await db.query("insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$3)",[randomUUID(),wallet,user]);
    if(kind==='chat') {
      await db.query('insert into ai_conversations(id,user_id) values($1,$2)',[conversation,user]);
      await db.query("insert into ai_messages(id,conversation_id,role,content) values($1,$2,'user','synthetic')",[message,conversation]);
      await db.query("insert into ai_operations(id,user_id,conversation_id,input_message_id,status,action_type,price_version,reserved_tokens,runtime_adapter,prompt_version,created_at) values($1,$2,$3,$4,$5,'quickReply',1,1,'genapi','quick-reply-v1',clock_timestamp()-($6*interval '1 second'))",[id,user,conversation,message,status,age]);
    } else {
      await db.query("insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$4,'image/png',3,$3,'available')",[image,user,'0'.repeat(64),`private/${image}`]);
      await db.query("insert into food_analyses(id,user_id,uploaded_image_id,status,runtime_adapter,created_at) values($1,$2,$3,$4,'genapi',clock_timestamp()-($5*interval '1 second'))",[id,user,image,status,age]);
    }
    const column=kind==='chat'?'operation_id':'food_analysis_id',ref=kind==='chat'?'aiOperation':'foodAnalysis';
    await db.query(`insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,${column}) values($1,$2,$3,'aiReservation',-1,$4,$5,$5)`,[randomUUID(),wallet,user,ref,id]);
    return {id,user,column,table:kind==='chat'?'ai_operations':'food_analyses'};
  }
  it.each(['chat','food'] as const)('refunds expired %s without a provider ID once across repeated restart sweeps',async kind=>{
    const f=await seed(kind,301);
    await new AutomaticRecoveryService(db).sweep();
    await Promise.all([new AutomaticRecoveryService(db).sweep(),new AutomaticRecoveryService(db).sweep()]);
    expect((await db.query(`select status from ${f.table} where id=$1`,[f.id])).rows[0]?.status).toBe('technicalError');
    expect((await db.query(`select count(*)::int n,sum(amount_tokens)::int amount from token_transactions where ${f.column}=$1 and entry_type='aiRefund'`,[f.id])).rows[0]).toEqual({n:1,amount:1});
    expect((await db.query('select sum(amount_tokens)::int amount from token_transactions where user_id=$1',[f.user])).rows[0]?.amount).toBe(100);
  });
  it.each(['chat','food'] as const)('does not refund %s before the immutable deadline',async kind=>{
    const f=await seed(kind,290);
    await new AutomaticRecoveryService(db).sweep();
    expect((await db.query(`select status from ${f.table} where id=$1`,[f.id])).rows[0]?.status).toBe('outcomeUnknown');
    expect((await db.query(`select count(*)::int n from token_transactions where ${f.column}=$1 and entry_type='aiRefund'`,[f.id])).rows[0]?.n).toBe(0);
  });
  const outcome=(id:string)=>({operationId:id,providerRequestId:'known-synthetic',providerResponseId:'response',providerModel:'synthetic',text:'late synthetic',inputTokens:1,outputTokens:1,totalTokens:2,cost:null,latencyMs:1,parametersHash:'0'.repeat(64)});
  it.each(['chat','food'] as const)('checks the %s exact boundary before finalization without waiting for a sweep',async kind=>{
    const f=await seed(kind,300);
    if(kind==='chat') await expect(new FinalizeReconciledAiOutcomeUseCase(db).execute(outcome(f.id))).resolves.toMatchObject({status:'technicalError'});
    else {
      const processor=new FoodAnalysisProcessor(db,{provider:'fake',fakeMode:'success',nativeBaseUrl:'https://invalid.example',modelVersion:'synthetic',timeoutMs:1});
      await (processor as unknown as {finalize(id:string,result:unknown,status:string):Promise<void>}).finalize(f.id,{kind:'success',recognized:{},suitability:{}},'outcomeUnknown');
    }
    expect((await db.query(`select entry_type from token_transactions where ${f.column}=$1 and entry_type in ('aiRefund','aiConfirmation')`,[f.id])).rows).toEqual([{entry_type:'aiRefund'}]);
    await expect(db.query(`update ${f.table} set created_at=clock_timestamp() where id=$1`,[f.id])).rejects.toThrow('immutable');
  });
  it('uses current DB time after waiting for an operation lock',async()=>{
    const f=await seed('chat',299.5);
    let locked!:()=>void;const ready=new Promise<void>(resolve=>{locked=resolve;});
    const holder=db.transaction(async client=>{await client.query('select 1 from ai_operations where id=$1 for update',[f.id]);locked();await client.query('select pg_sleep(0.7)');});
    await ready;
    const finalizer=new FinalizeReconciledAiOutcomeUseCase(db).execute(outcome(f.id));
    await holder;
    await expect(finalizer).resolves.toMatchObject({status:'technicalError'});
  });
  it('preserves a successful pre-deadline result and never refunds it',async()=>{
    const f=await seed('chat',290);
    await new FinalizeReconciledAiOutcomeUseCase(db).execute(outcome(f.id));
    await new AutomaticRecoveryService(db).sweep();
    expect((await db.query('select status from ai_operations where id=$1',[f.id])).rows[0]?.status).toBe('succeeded');
    expect((await db.query("select entry_type from token_transactions where operation_id=$1 and entry_type in ('aiRefund','aiConfirmation')",[f.id])).rows).toEqual([{entry_type:'aiConfirmation'}]);
  });
  it.each(['chat','food'] as const)('serializes concurrent %s finalization and compensation with one refund',async kind=>{
    const f=await seed(kind,301);
    const late=kind==='chat' ? new FinalizeReconciledAiOutcomeUseCase(db).execute(outcome(f.id)) : (new FoodAnalysisProcessor(db,{provider:'fake',fakeMode:'success',nativeBaseUrl:'https://invalid.example',modelVersion:'synthetic',timeoutMs:1}) as unknown as {finalize(id:string,result:unknown,status:string):Promise<void>}).finalize(f.id,{kind:'success',recognized:{},suitability:{}},'outcomeUnknown');
    await Promise.allSettled([late,db.transaction(client=>compensateExpiredAiRequest(client,kind,f.id)),new AutomaticRecoveryService(db).sweep()]);
    expect((await db.query(`select entry_type from token_transactions where ${f.column}=$1 and entry_type in ('aiRefund','aiConfirmation')`,[f.id])).rows).toEqual([{entry_type:'aiRefund'}]);
    expect((await db.query(`select count(*)::int n from ai_recovery_compensations where ${f.column}=$1`,[f.id])).rows[0]?.n).toBe(1);
    if(kind==='food') {
      const api=new FoodService(db,{execute:async()=>({userId:f.user})} as never,{} as never);
      expect(await api.getAnalysis('synthetic',f.id)).toMatchObject({errorCategory:'recoveryDeadlineExceeded',refundStatus:'refunded'});
      expect((await api.listAnalyses('synthetic',{})).items[0]).toMatchObject({errorCategory:'recoveryDeadlineExceeded',refundStatus:'refunded'});
    }
  });
  it.each(['chat','food'] as const)('does not submit an expired queued %s after restart',async kind=>{
    const f=await seed(kind,301,'queued'),event=randomUUID();
    const type=kind==='chat'?'ai-companion.quick_reply_requested.v1':'food.analysis_requested.v1';
    await db.query("insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values($1,$2,$3,$4,$5,now(),now(),0)",[event,type,kind==='chat'?'aiOperation':'foodAnalysis',f.id,JSON.stringify(kind==='chat'?{operationId:f.id}:{analysisId:f.id})]);
    const network=jest.spyOn(global,'fetch').mockRejectedValue(new Error('must not send'));
    const execute=jest.fn();const processor=kind==='chat'?new AiOperationProcessor(db,{providerName:'genapi',execute} as never,{build:jest.fn()} as never,{process:jest.fn()} as never):new FoodAnalysisProcessor(db,{provider:'genapi',fakeMode:'success',apiKey:'synthetic',nativeBaseUrl:'https://invalid.example',modelVersion:'synthetic',timeoutMs:1});
    await processor.process({data:{outboxId:event}} as never);
    expect(execute).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();network.mockRestore();
    expect((await db.query(`select status from ${f.table} where id=$1`,[f.id])).rows[0]?.status).toBe('technicalError');
  });

  it('retains a late accepted ID without reviving a compensated chat or charging its late answer',async()=>{
    const f=await seed('chat',299.5,'queued'),event=randomUUID();
    await db.query("insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values($1,'ai-companion.quick_reply_requested.v1','aiOperation',$2,$3,now(),now(),0)",[event,f.id,JSON.stringify({operationId:f.id})]);
    const execute=jest.fn(async (_request:unknown,lifecycle:{onAccepted(id:string):Promise<void>})=>{
      await db.query('select pg_sleep(0.7)');
      await lifecycle.onAccepted('late-provider-id');
      return {kind:'success',text:'late synthetic answer'};
    });
    const processor=new AiOperationProcessor(db,{providerName:'fake',execute} as never,{build:async()=>''} as never,{process:jest.fn()} as never);
    await processor.process({data:{outboxId:event}} as never);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await db.query('select submission_state,provider_request_id from ai_operation_request_receipts where operation_id=$1',[f.id])).rows[0]).toEqual({submission_state:'completed',provider_request_id:'late-provider-id'});
    expect((await db.query("select entry_type from token_transactions where operation_id=$1 and entry_type in ('aiRefund','aiConfirmation')",[f.id])).rows).toEqual([{entry_type:'aiRefund'}]);
    expect((await db.query("select count(*)::int n from ai_messages where role='assistant' and conversation_id=(select conversation_id from ai_operations where id=$1)",[f.id])).rows[0]?.n).toBe(0);
  });

  it.each((['chat','food'] as const).flatMap(kind=>['prepared','submitting','accepted','ambiguous'].map(state=>({kind,state}))))('compensates $kind receipt $state without losing its identity or reviving it',async({kind,state})=>{
    const f=await seed(kind,301,state==='prepared'?'queued':'processing');
    const table=kind==='chat'?'ai_operation_request_receipts':'food_analysis_request_receipts';
    const hash='a'.repeat(64),providerId=state==='accepted'?'known-'+f.id:null;
    if(kind==='chat') await db.query(`insert into ${table}(operation_id,user_id,provider,model,prompt_id,prompt_version,request_payload,request_hash,submission_state,provider_request_id) values($1,$2,'genapi','synthetic','quick-reply','1','{}',$3,$4,$5)`,[f.id,f.user,hash,state,providerId]);
    else await db.query(`insert into ${table}(food_analysis_id,user_id,provider,model,request_payload,request_hash,submission_state,provider_request_id) values($1,$2,'genapi','synthetic','{}',$3,$4,$5)`,[f.id,f.user,hash,state,providerId]);
    await Promise.all([new AutomaticRecoveryService(db).sweep(),new AutomaticRecoveryService(db).sweep()]);
    expect((await db.query(`select submission_state,provider_request_id,request_hash from ${table} where ${f.column}=$1`,[f.id])).rows[0]).toEqual({submission_state:'completed',provider_request_id:providerId,request_hash:hash});
    expect((await db.query(`select entry_type from token_transactions where ${f.column}=$1 and entry_type in ('aiRefund','aiConfirmation')`,[f.id])).rows).toEqual([{entry_type:'aiRefund'}]);
  });
  it('retains a late accepted food ID while ignoring the late result after compensation',async()=>{
    const f=await seed('food',299.5,'queued'),event=randomUUID();
    await db.query("insert into outbox_messages(id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values($1,'food.analysis_requested.v1','foodAnalysis',$2,$3,now(),now(),0)",[event,f.id,JSON.stringify({analysisId:f.id})]);
    jest.spyOn(S3Client.prototype,'send').mockImplementation((async()=>({ContentType:'image/png',Body:{transformToByteArray:async()=>new Uint8Array([1,2,3])}})) as never);
    const network=jest.spyOn(global,'fetch').mockImplementation(async(_url,init)=>{
      if(init?.method==='POST'){await db.query('select pg_sleep(0.7)');return new Response(JSON.stringify({request_id:'late-food-id'}));}
      return new Response(JSON.stringify({status:'success',result:[JSON.stringify({recognized:{kind:'food',items:[]},suitability:{status:'insufficientData',source:'none',observations:[],missingData:[]}})]}));
    });
    const processor=new FoodAnalysisProcessor(db,{provider:'genapi',fakeMode:'success',apiKey:'synthetic',nativeBaseUrl:'https://invalid.example',networkId:'gpt-4o',modelVersion:'synthetic',timeoutMs:1500,s3:{endpoint:'https://invalid.example',region:'test',bucket:'private',accessKeyId:'synthetic',secretAccessKey:'synthetic',forcePathStyle:true}});
    await processor.process({data:{outboxId:event}} as never);
    await processor.process({data:{outboxId:event}} as never);
    expect(network.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect((await db.query('select submission_state,provider_request_id from food_analysis_request_receipts where food_analysis_id=$1',[f.id])).rows[0]).toEqual({submission_state:'completed',provider_request_id:'late-food-id'});
    expect((await db.query("select entry_type from token_transactions where food_analysis_id=$1 and entry_type in ('aiRefund','aiConfirmation')",[f.id])).rows).toEqual([{entry_type:'aiRefund'}]);
    expect((await db.query('select recognized_result from food_analyses where id=$1',[f.id])).rows[0]?.recognized_result).toBeNull();
  });

});
