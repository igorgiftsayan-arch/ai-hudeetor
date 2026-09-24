import { createHash, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import type { DatabaseService } from '../../infrastructure/database/database.service';
import type { GetCurrentUserUseCase } from '../../identity/application/get-current-user.use-case';
import { IdentityError } from '../../identity/domain/identity-error';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class FoodService {
  private readonly storage: S3Client;

  constructor(
    private readonly database: DatabaseService,
    private readonly currentUser: GetCurrentUserUseCase,
    private readonly config: {
      enabled: boolean;
      endpoint: string;
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
    const uploadUrl = await getSignedUrl(this.storage, command, { expiresIn: 600 });
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
      await this.database.query(`update uploaded_images set status='quarantined' where id=$1 and user_id=$2`, [imageId, user.userId]);
      throw new IdentityError('FOOD_IMAGE_VALIDATION_FAILED', 422, 'Uploaded image metadata does not match the intent');
    }
    const bytes = await this.storage.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: image.object_key }));
    const body = bytes.Body ? Buffer.from(await bytes.Body.transformToByteArray()) : Buffer.alloc(0);
    const digest = createHash('sha256').update(body).digest('hex');
    let decoded = false;
    try {
      const metadata = await sharp(body, { limitInputPixels: 40_000_000 }).metadata();
      decoded = Boolean(metadata.width && metadata.height && metadata.format);
    } catch { decoded = false; }
    if (body.length !== image.size_bytes || digest !== image.sha256 || !matchesMagic(body, image.content_type) || !decoded) {
      await this.database.query(`update uploaded_images set status='quarantined' where id=$1 and user_id=$2`, [imageId, user.userId]);
      throw new IdentityError('FOOD_IMAGE_VALIDATION_FAILED', 422, 'Uploaded file is not a supported image');
    }
    const immutableKey = `food/${user.userId}/${imageId}/${digest}`;
    await this.storage.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: immutableKey, Body: body, ContentType: image.content_type, ContentLength: body.length, Metadata: { sha256: digest } }));
    await this.storage.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: image.object_key }));
    await this.database.query(`update uploaded_images set object_key=$1,status='available',uploaded_at=now() where id=$2 and user_id=$3`, [immutableKey,imageId,user.userId]);
    return { id: imageId, status: 'available' as const };
  }

  async createAnalysis(accessToken: string, idempotencyKey: string, input: { uploadedImageId: string; expectedTokenPrice: number; expectedPriceVersion: number }) {
    const user = await this.currentUser.execute(accessToken);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.database.transaction(async (client) => {
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodAnalysisCreate',$3,$4,'processing') on conflict do nothing`, [randomUUID(), user.userId, idempotencyKey, hash]);
      const idem = (await client.query<{ request_hash: string; state: string; response_body: any }>(`select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='foodAnalysisCreate' and idempotency_key=$2 for update`, [user.userId, idempotencyKey])).rows[0]!;
      if (idem.request_hash !== hash) throw new IdentityError('IDEMPOTENCY_KEY_REUSED', 409, 'The idempotency key was used with another request');
      if (idem.state === 'completed') return idem.response_body;
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
      await client.query(`insert into token_transactions (id,wallet_id,user_id,entry_type,amount_tokens,reason,food_analysis_id) values ($1,$2,$3,'aiReservation',$4,'foodPhotoAnalysis',$5)`, [reservationId, wallet.id, user.userId, -price.price_tokens, analysisId]);
      await client.query(`insert into outbox_messages (id,event_type,aggregate_type,aggregate_id,payload,occurred_at,available_at,attempts) values ($1,'food.analysis_requested.v1','foodAnalysis',$2,$3::jsonb,now(),now(),0)`, [randomUUID(), analysisId, JSON.stringify({ analysisId })]);
      const response = { id: analysisId, status: 'queued', reservedTokens: price.price_tokens, priceVersion: price.version, pollingUrl: `/api/v1/food-analyses/${analysisId}` };
      await client.query(`update idempotency_records set state='completed',response_status=202,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='foodAnalysisCreate' and idempotency_key=$3`, [JSON.stringify(response), user.userId, idempotencyKey]);
      return response;
    });
  }

  async getAnalysis(accessToken: string, analysisId: string) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query<any>(`select a.id,a.uploaded_image_id,a.status,a.runtime_adapter,a.recognized_result,a.suitability_result,a.user_correction,a.error_category,a.created_at,exists(select 1 from food_consumptions c where c.food_analysis_id=a.id and c.deleted_at is null) consumed from food_analyses a where a.id=$1 and a.user_id=$2 and a.deleted_at is null`, [analysisId, user.userId]);
    const row = result.rows[0];
    if (!row) throw new IdentityError('FOOD_ANALYSIS_NOT_FOUND', 404, 'Food analysis not found');
    return mapAnalysis(row);
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
      await client.query(`insert into idempotency_records (id,user_id,operation_scope,idempotency_key,request_hash,state) values ($1,$2,'foodConsumptionConfirm',$3,$4,'processing') on conflict do nothing`, [randomUUID(), user.userId, idempotencyKey, hash]);
      const idem = (await client.query<any>(`select request_hash,state,response_body from idempotency_records where user_id=$1 and operation_scope='foodConsumptionConfirm' and idempotency_key=$2 for update`, [user.userId, idempotencyKey])).rows[0]!;
      if (idem.request_hash !== hash) throw new IdentityError('IDEMPOTENCY_KEY_REUSED', 409, 'The idempotency key was used with another request');
      if (idem.state === 'completed') return idem.response_body;
      const analysis = (await client.query<any>(`select id,coalesce(user_correction,recognized_result) confirmed_result from food_analyses where id=$1 and user_id=$2 and status='analyzed' and deleted_at is null for update`, [analysisId, user.userId])).rows[0];
      if (!analysis) throw new IdentityError('FOOD_ANALYSIS_NOT_CONFIRMABLE', 409, 'Analysis is not ready for confirmation');
      const id = randomUUID();
      const saved = (await client.query<any>(`insert into food_consumptions (id,user_id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result) values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (food_analysis_id) where deleted_at is null do update set updated_at=food_consumptions.updated_at returning id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result`, [id, user.userId, analysisId, instant, localDate, timezone, JSON.stringify(analysis.confirmed_result)])).rows[0]!;
      const response = mapConsumption(saved);
      await client.query(`update idempotency_records set state='completed',response_status=201,response_body=$1::jsonb,completed_at=now() where user_id=$2 and operation_scope='foodConsumptionConfirm' and idempotency_key=$3`, [JSON.stringify(response), user.userId, idempotencyKey]);
      return response;
    });
  }

  async listConsumptions(accessToken: string) {
    const user = await this.currentUser.execute(accessToken);
    const result = await this.database.query<any>(`select id,food_analysis_id,consumed_at,local_date,timezone,confirmed_result from food_consumptions where user_id=$1 and deleted_at is null order by consumed_at desc,id desc limit 100`, [user.userId]);
    return { items: result.rows.map(mapConsumption) };
  }
}

function mapAnalysis(row: any) { return { id: row.id, uploadedImageId: row.uploaded_image_id, status: row.status, runtimeAdapter: row.runtime_adapter, recognizedResult: row.recognized_result, suitabilityResult: row.suitability_result, userCorrection: row.user_correction, errorCategory: row.error_category, consumptionStatus: row.consumed ? 'consumed' : 'notConfirmed', createdAt: new Date(row.created_at).toISOString() }; }
function mapConsumption(row: any) { return { id: row.id, foodAnalysisId: row.food_analysis_id, consumedAt: new Date(row.consumed_at).toISOString(), localDate: String(row.local_date), timezone: row.timezone, confirmedResult: row.confirmed_result }; }
function localCalendarDate(value: Date, timezone: string) { try { const parts = new Intl.DateTimeFormat('en-CA',{ timeZone: timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value); const get=(t:string)=>parts.find((p)=>p.type===t)?.value; return `${get('year')}-${get('month')}-${get('day')}`; } catch { throw new IdentityError('PROFILE_TIMEZONE_INVALID',409,'Timezone is invalid'); } }
function matchesMagic(body: Buffer, type: string) { if (type === 'image/jpeg') return body[0]===0xff && body[1]===0xd8 && body[2]===0xff; if (type === 'image/png') return body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])); if (type === 'image/webp') return body.subarray(0,4).toString()==='RIFF' && body.subarray(8,12).toString()==='WEBP'; return false; }
