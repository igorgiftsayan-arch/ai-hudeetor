import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '@atlas/backend';
import { FoodService } from '../../../packages/backend/src/food/application/food.service';
import { FoodImageRetentionService } from '../../../packages/backend/src/food/application/food-image-retention.service';
import { S3Client } from '@aws-sdk/client-s3';
import { FoodAnalysisProcessor } from '../src/food-analysis.processor';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  'Known-unsent food cancellation on PostgreSQL',
  () => {
    let admin: DatabaseService;
    let database: DatabaseService;
    let schema: string;
    let userId: string;
    let imageId: string;
    let service: FoodService;
    const config = {
      enabled: true,
      endpoint: 'http://127.0.0.1:1',
      region: 'test',
      bucket: 'test',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      forcePathStyle: true,
      runtimeAdapter: 'fake' as const,
      consentVersion: 'test',
    };
    beforeEach(async () => {
      admin = new DatabaseService(databaseUrl!);
      schema = `food_cancel_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`create schema "${schema}"`);
      const url = new URL(databaseUrl!);
      url.searchParams.set('options', `-c search_path=${schema},public`);
      database = new DatabaseService(url.toString());
      const migrations = resolve(__dirname, '../../../database/migrations');
      for (const name of (await readdir(migrations))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        await database.query(await readFile(resolve(migrations, name), 'utf8'));
      }
      userId = randomUUID();
      imageId = randomUUID();
      const walletId = randomUUID();
      await database.query(
        "insert into users(id,email_normalized,status,onboarding_status,registration_idempotency_key,registration_request_hash) values($1,$2,'active','completed',$3,'hash')",
        [userId, `${userId}@example.test`, randomUUID()],
      );
      await database.query(
        'insert into token_wallets(id,user_id) values($1,$2)',
        [walletId, userId],
      );
      await database.query(
        "insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id) values($1,$2,$3,'starterGrant',100,'onboardingCompletion',$4)",
        [randomUUID(), walletId, userId, randomUUID()],
      );
      await database.query(
        "insert into uploaded_images(id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values($1,$2,'foodAnalysis',$3,'image/jpeg',3,$4,'available')",
        [imageId, userId, `test/${imageId}`, '0'.repeat(64)],
      );
      service = new FoodService(
        database,
        { execute: async () => ({ userId }) } as never,
        config,
      );
    });
    afterEach(async () => {
      await database?.onApplicationShutdown();
      if (schema) await admin.query(`drop schema "${schema}" cascade`);
      await admin?.onApplicationShutdown();
    });
    async function queued() {
      const price=await service.price('owner');
      const created=await service.createAnalysis('owner',randomUUID(),{uploadedImageId:imageId,expectedTokenPrice:price.tokenPrice,expectedPriceVersion:price.priceVersion});
      const outbox=(await database.query('select id from outbox_messages where aggregate_id=$1',[created.id])).rows[0]!;
      return {id:created.id,price:price.tokenPrice,job:{data:{outboxId:outbox.id}} as Parameters<FoodAnalysisProcessor['process']>[0]};
    }
    async function refunds(id:string) {
      return (await database.query("select amount_tokens,reference_type from token_transactions where food_analysis_id=$1 and entry_type='aiRefund'",[id])).rows;
    }
    function realProcessor() {
      return new FoodAnalysisProcessor(database,{provider:'genapi',fakeMode:'success',apiKey:'synthetic',nativeBaseUrl:'http://provider.invalid',networkId:'gpt-4o',modelVersion:'gpt-4o',timeoutMs:200,s3:config});
    }
    it.each(['photo','analysis'] as const)('cancels queued %s deletion exactly once and ignores stale queued deliveries',async(target)=>{
      const {id,price,job}=await queued();
      await database.query("update uploaded_images set uploaded_at=now()-interval '11 minutes',created_at=now()-interval '11 minutes' where id=$1",[imageId]);
      const key=randomUUID();
      const remove=()=>target==='photo'?service.deletePhoto('owner',key,id):service.deleteAnalysis('owner',key,id);
      expect((await remove()).cancellationStatus).toBe('cancelledRefunded');
      await remove();
      if(target==='photo'){
        const deleteObject=jest.fn().mockResolvedValue(undefined);
        await new FoodImageRetentionService(database,{deleteObject}).processOne(new Date(Date.now()+1000));
        expect(deleteObject).toHaveBeenCalledTimes(2);
        expect((await service.deletionStatus('owner',id)).photoStatus).toBe('deleted');
      }
      await new FoodAnalysisProcessor(database,{provider:'fake',fakeMode:'success',nativeBaseUrl:'http://127.0.0.1:1',modelVersion:'test',timeoutMs:100}).process(job);
      await service.deletePhoto('owner',randomUUID(),id);
      await service.deleteAnalysis('owner',randomUUID(),id);
      expect(await refunds(id)).toEqual([{amount_tokens:price,reference_type:'foodAnalysisCancellation'}]);
      expect((await database.query('select status,cancellation_reason,processing_attempt_id,terminal_at from food_analyses where id=$1',[id])).rows[0]).toEqual({status:'cancelled',cancellation_reason:'knownUnsentUserRequest',processing_attempt_id:null,terminal_at:expect.any(Date)});
      expect((await database.query('select count(*)::int count from food_analysis_request_receipts where food_analysis_id=$1',[id])).rows[0]!.count).toBe(0);
    });
    it.each(['submitting','accepted','ambiguous','preparedWithSubmittedAt','preparedWithProviderId','preparedWithEmptyProviderId'] as const)('never cancels receipt evidence %s just because operation is queued',async(evidence)=>{
      const {id}=await queued();
      const state=evidence.startsWith('prepared')?'prepared':evidence;
      await database.query(`insert into food_analysis_request_receipts(food_analysis_id,user_id,provider,model,request_payload,request_hash,submission_state,submitted_at,provider_request_id) values($1,$2,'fake','test','{}',repeat('a',64),$3,$4,$5)`,[id,userId,state,evidence==='preparedWithSubmittedAt'?new Date():null,evidence==='preparedWithEmptyProviderId'?'':['accepted','preparedWithProviderId'].includes(evidence)?'synthetic-provider-id':null]);
      await expect(service.deletePhoto('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED'});
      expect(await refunds(id)).toEqual([]);
      expect((await service.deletionStatus('owner',id)).photoStatus).toBe('available');
    });
    it('cancel wins prepared-vs-submit race: no provider request after stale attempt resumes',async()=>{
      const {id,price,job}=await queued();
      await database.query("update food_analyses set runtime_adapter='genapi' where id=$1",[id]);
      let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
      let reached!:()=>void;const started=new Promise<void>(resolve=>{reached=resolve;});
      const s3=jest.spyOn(S3Client.prototype,'send').mockImplementation((async()=>{reached();await blocked;return {ContentType:'image/jpeg',Body:{transformToByteArray:async()=>new Uint8Array([1,2,3])}};}) as never);
      const fetchMock=jest.spyOn(globalThis,'fetch').mockRejectedValue(new Error('must not submit'));
      const running=realProcessor().process(job);
      try {
        await started;
        const receipt=(await database.query('select submission_state from food_analysis_request_receipts where food_analysis_id=$1',[id])).rows[0];
        expect(receipt!.submission_state).toBe('prepared');
        expect((await service.deleteAnalysis('owner',randomUUID(),id)).cancellationStatus).toBe('cancelledRefunded');
        release();await running;
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await refunds(id)).toEqual([{amount_tokens:price,reference_type:'foodAnalysisCancellation'}]);
        expect((await database.query('select submission_state,request_payload from food_analysis_request_receipts where food_analysis_id=$1',[id])).rows[0]).toEqual({submission_state:'cancelled',request_payload:null});
      } finally {release();await running;s3.mockRestore();fetchMock.mockRestore();}
    });
    it('submit wins race: cancellation rejects even before provider ID and does not refund',async()=>{
      const {id,job}=await queued();
      await database.query("update food_analyses set runtime_adapter='genapi' where id=$1",[id]);
      const s3=jest.spyOn(S3Client.prototype,'send').mockResolvedValue({ContentType:'image/jpeg',Body:{transformToByteArray:async()=>new Uint8Array([1,2,3])}} as never);
      let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
      let reached!:()=>void;const started=new Promise<void>(resolve=>{reached=resolve;});
      const fetchMock=jest.spyOn(globalThis,'fetch').mockImplementation(async()=>{reached();await blocked;throw new Error('synthetic ambiguous timeout');});
      const running=realProcessor().process(job);
      try {
        await started;
        expect((await database.query('select submission_state,provider_request_id from food_analysis_request_receipts where food_analysis_id=$1',[id])).rows[0]).toEqual({submission_state:'submitting',provider_request_id:null});
        await expect(service.deletePhoto('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED'});
        await expect(service.deleteAnalysis('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED'});
        release();await running;
        expect(await refunds(id)).toEqual([]);
        expect((await database.query('select status,deleted_at from food_analyses where id=$1',[id])).rows[0]).toEqual({status:'outcomeUnknown',deleted_at:null});
        expect((await service.deletionStatus('owner',id)).photoStatus).toBe('available');
        await expect(service.deletePhoto('owner',randomUUID(),id)).rejects.toMatchObject({code:'FOOD_ANALYSIS_ALREADY_SUBMITTED'});
      } finally {release();await running;s3.mockRestore();fetchMock.mockRestore();}
    });
  },
);
