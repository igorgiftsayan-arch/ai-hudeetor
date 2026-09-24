import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { DatabaseService } from '@atlas/backend';
import { DatabaseService as DatabaseToken } from '@atlas/backend';

@Injectable()
export class FoodAnalysisProcessor {
  constructor(@Inject(DatabaseToken) private readonly db: DatabaseService, private readonly mode: 'success'|'technicalError'|'outcomeUnknown' = 'success') {}

  async process(job: Job<{outboxId:string}>): Promise<void> {
    const event = await this.db.query<{payload:{analysisId:string}}>(`select payload from outbox_messages where id=$1 and event_type='food.analysis_requested.v1'`,[job.data.outboxId]);
    const analysisId = event.rows[0]?.payload.analysisId;
    if (!analysisId) return;
    const claimed = await this.db.transaction(async (client) => {
      const row = (await client.query<any>(`update food_analyses set status='processing',updated_at=now() where id=$1 and status='queued' returning id,user_id,runtime_adapter`,[analysisId])).rows[0];
      if (!row) return null;
      const source = (await client.query<any>(`select i.object_key,i.sha256,p.target_weight_kg,coalesce(jsonb_agg(jsonb_build_object('category',m.category,'key',m.key,'value',m.value)) filter (where m.id is not null),'[]'::jsonb) facts from uploaded_images i join food_analyses a on a.uploaded_image_id=i.id left join user_profiles p on p.user_id=a.user_id left join ai_memories m on m.user_id=a.user_id and m.deleted_at is null and m.category in ('preference','restriction','goal') where a.id=$1 group by i.object_key,i.sha256,p.target_weight_kg`,[analysisId])).rows[0];
      const payload = { analysisId, objectKey: source.object_key, imageSha256: source.sha256, knownProfile: { targetWeightKg: source.target_weight_kg ?? null, facts: source.facts } };
      const serialized = JSON.stringify(payload);
      const hash = createHash('sha256').update(serialized).digest('hex');
      await client.query(`insert into food_analysis_request_receipts (food_analysis_id,user_id,provider,model,request_payload,request_hash,submission_state) values ($1,$2,$3,$4,$5::jsonb,$6,'prepared') on conflict (food_analysis_id) do nothing`,[analysisId,row.user_id,row.runtime_adapter,row.runtime_adapter==='fake'?'fake-food-v1':process.env.GENAPI_MODEL ?? 'unconfigured',serialized,hash]);
      const receipt = (await client.query<any>(`select request_hash,submission_state from food_analysis_request_receipts where food_analysis_id=$1 for update`,[analysisId])).rows[0];
      if (receipt.request_hash !== hash || receipt.submission_state !== 'prepared') throw new Error('Food request receipt is not safely claimable');
      await client.query(`update food_analysis_request_receipts set submission_state='submitting',submitted_at=now(),updated_at=now() where food_analysis_id=$1`,[analysisId]);
      return { ...row, payload };
    });
    if (!claimed) return;

    // V1 pilot uses deterministic fake vision until a model-specific image schema is accepted.
    const result = this.mode;
    await this.db.transaction(async (client) => {
      const operation = (await client.query<any>(`select id,user_id from food_analyses where id=$1 and status='processing' for update`,[analysisId])).rows[0];
      if (!operation) return;
      const reservation = (await client.query<any>(`select id,wallet_id,amount_tokens from token_transactions where food_analysis_id=$1 and entry_type='aiReservation' for update`,[analysisId])).rows[0];
      if (result === 'success') {
        const facts = claimed.payload.knownProfile.facts as Array<{category:string;key:string;value:string}>;
        const hasKnownProfile = Boolean(claimed.payload.knownProfile.targetWeightKg || facts.length);
        const recognized = { kind:'food',dishName:'Тестовое блюдо',items:[{name:'Тестовый продукт',confidence:1}],uncertaintyNotes:[] };
        const suitability = hasKnownProfile
          ? { status:'mixed',source:'profile',observations:['Оценка основана только на сохранённых целях и предпочтениях пользователя.'],missingData:[] }
          : { status:'insufficientData',source:'none',observations:[],missingData:['Не хватает подтверждённых целей или ограничений питания.'] };
        await client.query(`update food_analyses set status='analyzed',recognized_result=$2::jsonb,suitability_result=$3::jsonb,analyzed_at=now(),updated_at=now() where id=$1`,[analysisId,JSON.stringify(recognized),JSON.stringify(suitability)]);
        await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reason,reference_type,reference_id,food_analysis_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiConfirmation',0,'foodPhotoAnalysis','foodAnalysis',$3,$3,$4)`,[reservation.wallet_id,operation.user_id,analysisId,reservation.id]);
        await client.query(`update food_analysis_request_receipts set submission_state='completed',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      } else if (result === 'technicalError') {
        await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reason,reference_type,reference_id,food_analysis_id,reservation_id) values (gen_random_uuid(),$1,$2,'aiRefund',$3,'foodPhotoAnalysis','foodAnalysis',$4,$4,$5)`,[reservation.wallet_id,operation.user_id,-reservation.amount_tokens,analysisId,reservation.id]);
        await client.query(`update food_analyses set status='technicalError',error_category='providerUnavailable',updated_at=now() where id=$1`,[analysisId]);
        await client.query(`update food_analysis_request_receipts set submission_state='completed',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      } else {
        await client.query(`update food_analyses set status='outcomeUnknown',updated_at=now() where id=$1`,[analysisId]);
        await client.query(`update food_analysis_request_receipts set submission_state='ambiguous',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      }
    });
  }
}
