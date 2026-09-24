/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class FoodService {
  private readonly storage: S3Client;
  private readonly publicStorage: S3Client;

  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly config: {
      enabled: boolean;
      endpoint: string;
      publicEndpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
      runtimeAdapter: 'fake' | 'genapi';
      consentVersion: string;
    },
  ) {
    this.storage = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.publicStorage = config.publicEndpoint
      ? new S3Client({
          endpoint: config.publicEndpoint,
          region: config.region,
          forcePathStyle: config.forcePathStyle,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        })
      : this.storage;
  }

  async price(accessToken: string) {
    await this.currentUser.execute(accessToken);
    const result = await this.database.query<{ price_tokens: number; version: number }>(
      `select price_tokens,version from ai_action_prices where action_type='foodPhotoAnalysis' and active=true`,
    );
    const row = result.rows[0];
    if (!row) throw new IdentityError('AI_ACTION_PRICE_UNAVAILABLE', 503, 'Food analysis is unavailable');
    return { actionType: 'foodPhotoAnalysis' as const, tokenPrice: row.price_tokens, priceVersion: row.version };
  }

  async createUploadIntent(accessToken: string, input: { contentType: string; sizeBytes: number; sha256: string }) {
    const user = await this.currentUser.execute(accessToken);
    if (!this.config.enabled) throw new IdentityError('FOOD_STORAGE_UNAVAILABLE', 503, 'Food image storage is not configured');
    if (!ALLOWED_TYPES.has(input.contentType) || input.sizeBytes < 1 || input.sizeBytes > 10_485_760 || !/^[0-9a-f]{64}$/.test(input.sha256))
      throw new IdentityError('FOOD_IMAGE_INVALID', 422, 'The image type, size or checksum is invalid');
    const id = randomUUID();
    const objectKey = `food-staging/${user.userId}/${id}`;
    await this.database.query(
      `insert into uploaded_images (id,user_id,purpose,object_key,content_type,size_bytes,sha256,status) values ($1,$2,'foodAnalysis',$3,$4,$5,$6,'pendingUpload')`,
      [id, user.userId, objectKey, input.contentType, input.sizeBytes, input.sha256],
    );
    const command = new PutObjectCommand({ Bucket: this.config.bucket, Key: objectKey, ContentType: input.contentType, ContentLength: input.sizeBytes, Metadata: { sha256: input.sha256 } });
    const uploadUrl = await getSignedUrl(this.publicStorage, command, { expiresIn: 600 });
    return { id, status: 'pendingUpload' as const, uploadUrl, expiresAt: new Date(Date.now() + 600_000).toISOString(), requiredHeaders: { 'content-type': input.contentType, 'x-amz-meta-sha256': input.sha256 } };
  }

  async completeUpload(accessToken: string, imageId: string) {
    const user = await this.currentUser.execute(accessToken);
    if (!this.config.enabled) throw new IdentityError('FOOD_STORAGE_UNAVAILABLE', 503, 'Food image storage is not configured');
    const found = await this.database.query<{ object_key: string; content_type: string; size_bytes: number; sha256: string; status: string }>(
      `select object_key,content_type,size_bytes,sha256,status from uploaded_images where id=$1 and user_id=$2 and deleted_at is null`, [imageId, user.userId]);
    const image = found.rows[0];
    if (!image) throw new IdentityError('FOOD_IMAGE_NOT_FOUND', 404, 'Image not found');
    if (image.status === 'available') return { id: imageId, status: 'available' as const };
    const head = await this.storage.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: image.object_key }));
    if (head.ContentLength !== image.size_bytes || head.ContentType !== image.content_type || head.Metadata?.sha256 !== image.sha256) {
      await this.database.query(`update uploaded_images set status='quarantined' where id=$1 and user_id=$2 and status='pendingUpload' and deleted_at is null`, [imageId, user.userId]);
      throw new IdentityError('FOOD_IMAGE_VALIDATION_FAILED', 422, 'Uploaded image metadata does not match the intent');
    }
    const bytes = await this.storage.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: image.object_key }));
    const body = bytes.Body ? Buffer.from(await bytes.Body.transformToByteArray()) : Buffer.alloc(0);
    const digest = createHash('sha256').update(body).digest('hex');
    let decoded: boolean;
    try {
      const metadata = await sharp(body, { limitInputPixels: 40_000_000 }).metadata();
      decoded = Boolean(metadata.width && metadata.height && metadata.format);
    } catch { decoded = false; }
    if (body.length !== image.size_bytes || digest !== image.sha256 || !matchesMagic(body, image.content_type) || !decoded) {
      await this.database.query(`update uploaded_images set status='quarantined' where id=$1 and user_id=$2 and status='pendingUpload' and deleted_at is null`, [imageId, user.userId]);
      throw new IdentityError('FOOD_IMAGE_VALIDATION_FAILED', 422, 'Uploaded file is not a supported image');
    }
    return this.database.transaction(async (client) => {
      await lockFoodMutations(client, user.userId);
      const current = (await client.query<{status:string}>(`select status from uploaded_images where id=$1 and user_id=$2 and deleted_at is null for update`,[imageId,user.userId])).rows[0];
      if (!current) throw new IdentityError('FOOD_IMAGE_NOT_FOUND',404,'Image not found');
      if (current.status === 'available') return { id: imageId, status: 'available' as const };
      const immutableKey = `food/${user.userId}/${imageId}/${digest}`;
      await this.storage.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: immutableKey, Body: body, ContentType: image.content_type, ContentLength: body.length, Metadata: { sha256: digest } }));
      await this.storage.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: image.object_key }));
      await client.query(`update uploaded_images set object_key=$1,status='available',uploaded_at=now() where id=$2 and user_id=$3`, [immutableKey,imageId,user.userId]);
      return { id: imageId, status: 'available' as const };
    });
  }

  async createAnalysis(accessToken: string, idempotencyKey: string, input: { uploadedImageId: string; expectedTokenPrice: number; expectedPriceVersion: number }) {
    const user = await this.currentUser.execute(accessToken);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.database.transaction(async (client) => {
      await lockFoodMutations(client, user.userId);
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodAnalysisCreate',$3,$4,'processing') on conflict do nothing`, [randomUUID(), user.userId, idempotencyKey, hash]);
      const idem = (await client.query<{ request_hash: string; state: string; response_body: any }>(`select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='foodAnalysisCreate' and idempotency_key=$2 for update`, [user.userId, idempotencyKey])).rows[0]!;
      if (idem.request_hash !== hash) throw new IdentityError('IDEMPOTENCY_KEY_REUSED', 409, 'The idempotency key was used with another request');
      if (idem.state === 'completed') return replayFoodResponse(idem.response_body);
      const price = (await client.query<{ id: string; price_tokens: number; version: number }>(`select id,price_tokens,version from ai_action_prices where action_type='foodPhotoAnalysis' and active=true for share`)).rows[0];
      if (!price || price.price_tokens !== input.expectedTokenPrice || price.version !== input.expectedPriceVersion)
        throw new IdentityError('AI_ACTION_PRICE_CHANGED', 409, 'Food analysis price changed');
      const image = (await client.query<{ id: string }>(`select id from uploaded_images where id=$1 and user_id=$2 and status='available' and deleted_at is null for update`, [input.uploadedImageId, user.userId])).rows[0];
      if (!image) throw new IdentityError('FOOD_IMAGE_NOT_READY', 409, 'Image is not ready for analysis');
      if (this.config.runtimeAdapter === 'genapi') {
        const consent = await client.query(`select 1 from user_consents where user_id=$1 and consent_type='aiProviderProcessing' and document_version=$2`, [user.userId,this.config.consentVersion]);
        if (!consent.rowCount) throw new IdentityError('AI_PROVIDER_CONSENT_REQUIRED',409,'External AI provider consent is required');
      }
      const walletRow = (await client.query<{ id: string }>(`select id from token_wallets where user_id=$1 for update`, [user.userId])).rows[0];
      if (!walletRow) throw new IdentityError('TOKEN_WALLET_NOT_FOUND',409,'Token wallet is unavailable');
      const balance = (await client.query<{ balance: number }>(`select coalesce(sum(amount_tokens),0)::int balance from token_transactions where wallet_id=$1`, [walletRow.id])).rows[0]?.balance ?? 0;
      const wallet = { id: walletRow.id, balance };
      if (!wallet || wallet.balance < price.price_tokens) throw new IdentityError('TOKEN_BALANCE_INSUFFICIENT', 409, 'Insufficient token balance');
      const analysisId = randomUUID();
      const reservationId = randomUUID();
      await client.query(`insert into food_analyses (id,user_id,uploaded_image_id,status,runtime_adapter) values ($1,$2,$3,'queued',$4)`, [analysisId, user.userId, image.id, this.config.runtimeAdapter]);
      await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,food_analysis_id) values ($1,$2,$3,'aiReservation',$4,'foodAnalysis',$5,$5)`, [reservationId, wallet.id, user.userId, -price.price_tokens, analysisId]);
      await client.query(`insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values ($1,'food.analysis_requested.v1','foodAnalysis',$2,$3::jsonb,now(),now(),0)`, [randomUUID(), analysisId, JSON.stringify({ analysisId })]);
      const response = { id: analysisId, status: 'queued', reservedTokens: price.price_tokens, priceVersion: price.version, pollingUrl: `/api/v1/food-analyses/${analysisId}` };
      await client.query(`update idempotency_records set state='completed',response_status=202,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='foodAnalysisCreate' and idempotency_key=$3`, [JSON.stringify(response), user.userId, idempotencyKey]);
      return response;
    });
  }

  async listAnalyses(accessToken: string, query: { limit?: number; cursor?: string; consumptionStatus?: 'notConfirmed' } = {}) {
    const user = await this.currentUser.execute(accessToken);
    const limit = query.limit ?? 20;
    const filter = query.consumptionStatus ?? 'all';
    const invalid = () => new IdentityError('VALIDATION_ERROR', 422, 'Invalid food analysis pagination');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !['all', 'notConfirmed'].includes(filter)) throw invalid();
    let cursor: { time: string; id: string } | null = null;
    if (query.cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,512}$/.test(query.cursor)) throw invalid();
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
        if (decoded.version !== 1 || decoded.filter !== filter || decoded.order !== 'createdAtIdDesc' ||
          typeof decoded.time !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-](?:0\d|1[0-5])(?::[0-5]\d)?$/.test(decoded.time) ||
          !Number.isFinite(Date.parse(decoded.time)) || typeof decoded.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.id)) throw invalid();
        const [year,month,day] = decoded.time.slice(0,10).split('-').map(Number);
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year,month,0)).getUTCDate() ||
          Number(decoded.time.slice(11,13)) > 23 || Number(decoded.time.slice(14,16)) > 59 || Number(decoded.time.slice(17,19)) > 59) throw invalid();
        cursor = decoded;
      } catch { throw invalid(); }
    }
    const result = await this.database.query<any>(`
      select a.id,a.uploaded_image_id,a.status,a.runtime_adapter,a.created_at,a.created_at::text cursor_time,
        case when a.deleted_at is null then coalesce(a.user_correction->>'dishName',a.recognized_result->>'dishName') else null end dish_name,
        exists(select 1 from food_consumptions c where c.food_analysis_id=a.id and c.deleted_at is null) consumed,
        case when i.status='deleted' then 'deleted' when i.deleted_at is not null then 'pending' else 'available' end photo_status,
        case when a.deleted_at is null then 'available' else 'deleted' end analysis_status
      from food_analyses a join uploaded_images i on i.id=a.uploaded_image_id
      where a.user_id=$1 and ($2::text='all' or not exists(select 1 from food_consumptions c where c.food_analysis_id=a.id and c.deleted_at is null))
        and ($3::timestamptz is null or (a.created_at,a.id)<($3::timestamptz,$4::uuid))
      order by a.created_at desc,a.id desc limit $5`, [user.userId,filter,cursor?.time ?? null,cursor?.id ?? null,limit + 1]);
    const rows = result.rows.slice(0,limit);
    const last = rows.at(-1);
    return {
      items: rows.map(row => ({ id:row.id,uploadedImageId:row.uploaded_image_id,
        status:row.analysis_status === 'deleted' ? 'deleted' : row.status,runtimeAdapter:row.runtime_adapter,
        createdAt:new Date(row.created_at).toISOString(),consumptionStatus:row.consumed ? 'consumed' : 'notConfirmed',dishName:row.dish_name,
        deletionStatus:{analysisId:row.id,photoStatus:row.photo_status,analysisStatus:row.analysis_status,cancellationStatus:row.status === 'cancelled' ? 'cancelledRefunded' : 'notCancelled'} })),
      nextCursor:result.rows.length > limit && last ? Buffer.from(JSON.stringify({version:1,filter,order:'createdAtIdDesc',time:last.cursor_time,id:last.id})).toString('base64url') : null,
    };
  }

  async getAnalysis(accessToken: string, analysisId: string) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query<any>(`select a.id,a.uploaded_image_id,a.status,a.runtime_adapter,a.recognized_result,a.suitability_result,a.user_correction,a.error_category,a.created_at,exists(select 1 from food_consumptions c where c.food_analysis_id=a.id and c.deleted_at is null) consumed from food_analyses a where a.id=$1 and a.user_id=$2 and a.deleted_at is null`, [analysisId, user.userId]);
    const row = result.rows[0];
    if (!row) throw new IdentityError('FOOD_ANALYSIS_NOT_FOUND', 404, 'Food analysis not found');
    return mapAnalysis(row);
  }

  async deletionStatus(accessToken: string, analysisId: string) {
    const user = await this.currentUser.execute(accessToken);
    return readDeletionStatus(this.database, user.userId, analysisId);
  }

  async deletePhoto(accessToken: string, idempotencyKey: string, analysisId: string) {
    return this.deleteTerminalContent(accessToken, idempotencyKey, analysisId, 'photo');
  }

  async deleteAnalysis(accessToken: string, idempotencyKey: string, analysisId: string) {
    return this.deleteTerminalContent(accessToken, idempotencyKey, analysisId, 'analysis');
  }

  private async deleteTerminalContent(accessToken: string, key: string, analysisId: string, target: 'photo' | 'analysis') {
    const user = await this.currentUser.execute(accessToken);
    const scope = target === 'photo' ? 'foodPhotoDelete' : 'foodAnalysisDelete';
    const hash = createHash('sha256').update(JSON.stringify({ analysisId, target })).digest('hex');
    return this.database.transaction(async (client) => {
      await lockFoodMutations(client, user.userId);
      await client.query(`insert into idempotency_records(id,user_id,operation_scope,idempotency_key,request_hash,state) values($1,$2,$3,$4,$5,'processing') on conflict do nothing`, [randomUUID(),user.userId,scope,key,hash]);
      const idem = (await client.query<{request_hash:string}>(`select request_hash from idempotency_records where user_id=$1 and operation_scope=$2 and idempotency_key=$3 for update`,[user.userId,scope,key])).rows[0]!;
      if (idem.request_hash !== hash) throw new IdentityError('IDEMPOTENCY_KEY_REUSED',409,'The idempotency key was used with another request');
      const found = (await client.query<{status:string;provider_reference:string|null;uploaded_image_id:string;object_key:string}>(`select a.status,a.provider_reference,a.uploaded_image_id,i.object_key from food_analyses a join uploaded_images i on i.id=a.uploaded_image_id where a.id=$1 and a.user_id=$2 for update of a`,[analysisId,user.userId])).rows[0];
      if (!found) throw new IdentityError('FOOD_ANALYSIS_NOT_FOUND',404,'Food analysis not found');
      if (!['analyzed','technicalError','cancelled'].includes(found.status)) {
        // The operation row is the same fence used by claim, submit and finalize.
        // Missing provider ID alone never proves the request was not sent.
        const receipt = (await client.query<{submission_state:string;submitted_at:Date|null;provider_request_id:string|null}>(`select submission_state,submitted_at,provider_request_id from food_analysis_request_receipts where food_analysis_id=$1 for update`,[analysisId])).rows[0];
        const unsent = found.provider_reference === null && (
          (!receipt && found.status === 'queued') ||
          (['queued','processing'].includes(found.status) && receipt?.submission_state === 'prepared' && receipt.submitted_at === null && receipt.provider_request_id === null)
        );
        if (!unsent) throw new IdentityError('FOOD_ANALYSIS_ALREADY_SUBMITTED',409,'The analysis may have been submitted; wait for its result');
        const reservation = (await client.query<{id:string;wallet_id:string;amount_tokens:number}>(`select id,wallet_id,amount_tokens from token_transactions where food_analysis_id=$1 and entry_type='aiReservation' for update`,[analysisId])).rows[0];
        if (!reservation) throw new IdentityError('FOOD_RESERVATION_NOT_FOUND',409,'The reservation could not be verified');
        await client.query(`insert into token_transactions(id,wallet_id,user_id,entry_type,amount_tokens,reference_type,reference_id,food_analysis_id,reservation_id) values(gen_random_uuid(),$1,$2,'aiRefund',$3,'foodAnalysisCancellation',$4,$4,$5)`,[reservation.wallet_id,user.userId,-reservation.amount_tokens,analysisId,reservation.id]);
        await client.query(`update food_analyses set status='cancelled',cancellation_reason='knownUnsentUserRequest',processing_attempt_id=null,updated_at=now() where id=$1`,[analysisId]);
        await client.query(`update food_analysis_request_receipts set submission_state='cancelled',updated_at=now() where food_analysis_id=$1`,[analysisId]);
      }
      if (target === 'photo') {
        // Match cleanup's job -> image order; preserve any live lease and first deadline.
        await client.query(`insert into food_image_cleanup_jobs(image_id,original_object_key,staging_object_key,reason,requested_at,deadline_at)
          values($1,$2,$3,'userRequest',now(),now()+interval '24 hours')
          on conflict(image_id) do update set reason='userRequest',requested_at=coalesce(food_image_cleanup_jobs.requested_at,now()),deadline_at=coalesce(food_image_cleanup_jobs.deadline_at,now()+interval '24 hours'),available_at=least(food_image_cleanup_jobs.available_at,now())`,[found.uploaded_image_id,found.object_key,`food-staging/${user.userId}/${found.uploaded_image_id}`]);
        await client.query(`select id from uploaded_images where id=$1 for update`,[found.uploaded_image_id]);
        const unsafe = await client.query(`select 1 from food_analyses where uploaded_image_id=$1 and status not in ('analyzed','technicalError','cancelled')`,[found.uploaded_image_id]);
        if (unsafe.rowCount) throw new IdentityError('FOOD_ANALYSIS_NOT_TERMINAL',409,'Only terminal analyses can be deleted');
        await client.query(`update uploaded_images set deleted_at=coalesce(deleted_at,now()) where id=$1`,[found.uploaded_image_id]);
      } else {
        await client.query(`update food_analyses set deleted_at=coalesce(deleted_at,now()),recognized_result=null,suitability_result=null,user_correction=null,updated_at=now() where id=$1 and user_id=$2 and status in ('analyzed','technicalError','cancelled')`,[analysisId,user.userId]);
        await client.query(`update food_analysis_request_receipts set request_payload=null,content_deleted_at=now() where food_analysis_id=$1 and content_deleted_at is null`,[analysisId]);
        await client.query(`update idempotency_records set response_body='{"contentDeleted":true}'::jsonb where user_id=$1 and
          ((operation_scope in ('foodConsumptionConfirm','foodConsumptionUpdate') and response_body->>'foodAnalysisId'=$2) or
           (operation_scope='foodAnalysisCreate' and response_body->>'id'=$2))`,[user.userId,analysisId]);
      }
      const response = await readDeletionStatus(client,user.userId,analysisId);
      await client.query(`update idempotency_records set state='completed',response_status=202,response_body=$1::jsonb,completed_at=coalesce(completed_at,now()) where user_id=$2 and operation_scope=$3 and idempotency_key=$4`,[JSON.stringify(response),user.userId,scope,key]);
      return response;
    });
  }

  async correct(accessToken: string, analysisId: string, correctedResult: { dishName?: string; items: Array<{ name: string; confidence?: number }>; note?: string }) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query(`update food_analyses set user_correction=$1::jsonb,updated_at=now() where id=$2 and user_id=$3 and status='analyzed' and deleted_at is null and not exists(select 1 from food_consumptions where food_analysis_id=$2 and deleted_at is null)`, [JSON.stringify(correctedResult), analysisId, user.userId]);
    if (!result.rowCount) throw new IdentityError('FOOD_ANALYSIS_NOT_EDITABLE', 409, 'Analysis is not editable');
    return this.getAnalysis(accessToken, analysisId);
  }

  async confirmConsumption(accessToken: string, idempotencyKey: string, analysisId: string, consumedAt: string, timezone: string) {
    const user = await this.currentUser.execute(accessToken);
    const instant = new Date(consumedAt);
    if (Number.isNaN(instant.valueOf())) throw new IdentityError('VALIDATION_ERROR', 422, 'consumedAt is invalid');
    const localDate = localCalendarDate(instant, timezone);
    const payload = { analysisId, consumedAt: instant.toISOString(), timezone };
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.database.transaction(async (client) => {
      await lockFoodMutations(client, user.userId);
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodConsumptionConfirm',$3,$4,'processing') on conflict do nothing`, [randomUUID(), user.userId, idempotencyKey, hash]);
      const idem = (await client.query<any>(`select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='foodConsumptionConfirm' and idempotency_key=$2 for update`, [user.userId, idempotencyKey])).rows[0]!;
      if (idem.request_hash !== hash) throw new IdentityError('IDEMPOTENCY_KEY_REUSED', 409, 'The idempotency key was used with another request');
      if (idem.state === 'completed') return replayFoodResponse(idem.response_body);
      const analysis = (await client.query<any>(`select id,coalesce(user_correction,recognized_result) confirmed_result from food_analyses where id=$1 and user_id=$2 and status='analyzed' and deleted_at is null for update`, [analysisId, user.userId])).rows[0];
      if (!analysis) throw new IdentityError('FOOD_ANALYSIS_NOT_CONFIRMABLE', 409, 'Analysis is not ready for confirmation');
      const id = randomUUID();
      const saved = (await client.query<any>(`insert into food_consumptions (id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result) values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (food_analysis_id) where deleted_at is null do update set updated_at=food_consumptions.updated_at returning id,food_analysis_id,consumed_at,local_date::text,timezone,confirmed_result`, [id, user.userId, analysisId, instant, localDate, timezone, JSON.stringify(analysis.confirmed_result)])).rows[0]!;
      const response = mapConsumption(saved);
      await client.query(`update idempotency_records set state='completed',response_status=201,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='foodConsumptionConfirm' and idempotency_key=$3`, [JSON.stringify(response), user.userId, idempotencyKey]);
      return response;
    });
  }

  async listConsumptions(accessToken: string) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query<any>(`select id,food_analysis_id,consumed_at,local_date::text,timezone,confirmed_result from food_consumptions where user_id=$1 and deleted_at is null order by consumed_at desc,id desc limit 100`, [user.userId]);
    return { items: result.rows.map(mapConsumption) };
  }

  async updateConsumption(accessToken:string,idempotencyKey:string,id:string,input:{consumedAt:string;timezone:string;confirmedResult:{dishName?:string;items:Array<{name:string;confidence?:number}>;note?:string}}){
    const user=await this.currentUser.execute(accessToken); const instant=new Date(input.consumedAt); if(Number.isNaN(instant.valueOf()))throw new IdentityError('VALIDATION_ERROR',422,'consumedAt is invalid'); const localDate=localCalendarDate(instant,input.timezone);
    const hash=createHash('sha256').update(JSON.stringify({id,...input,consumedAt:instant.toISOString()})).digest('hex');
    return this.database.transaction(async(client)=>{
      await lockFoodMutations(client, user.userId);
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodConsumptionUpdate',$3,$4,'processing') on conflict do nothing`,[randomUUID(),user.userId,idempotencyKey,hash]);
      const idem=(await client.query<any>(`select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='foodConsumptionUpdate' and idempotency_key=$2 for update`,[user.userId,idempotencyKey])).rows[0]!;
      if(idem.request_hash!==hash)throw new IdentityError('IDEMPOTENCY_KEY_REUSED',409,'The idempotency key was used with another request'); if(idem.state==='completed')return replayFoodResponse(idem.response_body);
      const saved=(await client.query<any>(`update food_consumptions set consumed_at=$1,local_date=$2,timezone=$3,confirmed_result=$4::jsonb,updated_at=now() where id=$5 and user_id=$6 and deleted_at is null returning id,food_analysis_id,consumed_at,local_date::text,timezone,confirmed_result`,[instant,localDate,input.timezone,JSON.stringify(input.confirmedResult),id,user.userId])).rows[0];
      if(!saved)throw new IdentityError('FOOD_CONSUMPTION_NOT_FOUND',404,'Food consumption not found'); const response=mapConsumption(saved);
      await client.query(`update idempotency_records set state='completed',response_status=200,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='foodConsumptionUpdate' and idempotency_key=$3`,[JSON.stringify(response),user.userId,idempotencyKey]); return response;
    });
  }

  async deleteConsumption(accessToken:string,idempotencyKey:string,id:string){
    const user=await this.currentUser.execute(accessToken); const hash=createHash('sha256').update(JSON.stringify({id})).digest('hex');
    await this.database.transaction(async(client)=>{
      await lockFoodMutations(client, user.userId);
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodConsumptionDelete',$3,$4,'processing') on conflict do nothing`,[randomUUID(),user.userId,idempotencyKey,hash]);
      const idem=(await client.query<any>(`select request_hash,state from idempotency_records where user_id=$1 and operation_scope='foodConsumptionDelete' and idempotency_key=$2 for update`,[user.userId,idempotencyKey])).rows[0]!; if(idem.request_hash!==hash)throw new IdentityError('IDEMPOTENCY_KEY_REUSED',409,'The idempotency key was used with another request'); if(idem.state==='completed')return;
      const owned=await client.query(`select 1 from food_consumptions where id=$1 and user_id=$2`,[id,user.userId]); if(!owned.rowCount)throw new IdentityError('FOOD_CONSUMPTION_NOT_FOUND',404,'Food consumption not found');
      await client.query(`update food_consumptions set deleted_at=coalesce(deleted_at,now()),updated_at=now() where id=$1 and user_id=$2`,[id,user.userId]);
      await client.query(`update idempotency_records set state='completed',response_status=204,response_body='{}'::jsonb,completed_at=now() where user_id=$1 and operation_scope='foodConsumptionDelete' and idempotency_key=$2`,[user.userId,idempotencyKey]);
    });
  }
}

function mapAnalysis(row: any) { return { id: row.id, uploadedImageId: row.uploaded_image_id, status: row.status, runtimeAdapter: row.runtime_adapter, recognizedResult: row.recognized_result, suitabilityResult: row.suitability_result, userCorrection: row.user_correction, errorCategory: row.error_category, consumptionStatus: row.consumed ? 'consumed' : 'notConfirmed', createdAt: new Date(row.created_at).toISOString() }; }
function mapConsumption(row: any) { return { id: row.id, foodAnalysisId: row.food_analysis_id, consumedAt: new Date(row.consumed_at).toISOString(), localDate: String(row.local_date), timezone: row.timezone, confirmedResult: row.confirmed_result }; }
function localCalendarDate(value: Date, timezone: string) { try { const parts = new Intl.DateTimeFormat('en-CA',{ timeZone: timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value); const get=(t:string)=>parts.find((p)=>p.type===t)?.value; return `${get('year')}-${get('month')}-${get('day')}`; } catch { throw new IdentityError('PROFILE_TIMEZONE_INVALID',409,'Timezone is invalid'); } }
function matchesMagic(body: Buffer, type: string) { if (type === 'image/jpeg') return body[0]===0xff && body[1]===0xd8 && body[2]===0xff; if (type === 'image/png') return body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])); if (type === 'image/webp') return body.subarray(0,4).toString()==='RIFF' && body.subarray(8,12).toString()==='WEBP'; return false; }

async function lockFoodMutations(client: PoolClient, userId: string) {
  await client.query("select pg_advisory_xact_lock(hashtextextended('food-content:'||$1::text,0))",[userId]);
}
function replayFoodResponse(response: any) {
  if (response?.contentDeleted === true) throw new IdentityError('FOOD_CONTENT_DELETED',410,'The original food content was deleted');
  return response;
}
async function readDeletionStatus(db: { query(text: string, values: any[]): Promise<{rows: any[]}> }, userId: string, analysisId: string) {
  const row = (await db.query(`select case when i.status='deleted' then 'deleted' when i.deleted_at is not null then 'pending' else 'available' end photo_status,case when a.deleted_at is null then 'available' else 'deleted' end analysis_status,case when a.status='cancelled' then 'cancelledRefunded' else 'notCancelled' end cancellation_status from food_analyses a join uploaded_images i on i.id=a.uploaded_image_id where a.id=$1 and a.user_id=$2`,[analysisId,userId])).rows[0];
  if (!row) throw new IdentityError('FOOD_ANALYSIS_NOT_FOUND',404,'Food analysis not found');
  return {analysisId,photoStatus:row.photo_status,analysisStatus:row.analysis_status,cancellationStatus:row.cancellation_status};
}
