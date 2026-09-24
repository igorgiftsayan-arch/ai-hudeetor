CREATE TABLE ai_operation_request_receipts (
  operation_id uuid PRIMARY KEY REFERENCES ai_operations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL,
  request_payload jsonb NOT NULL,
  request_hash text NOT NULL,
  submission_state text NOT NULL DEFAULT 'prepared',
  provider_request_id text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_operation_request_receipts_submission_state
    CHECK (submission_state IN ('prepared','submitting','accepted','ambiguous')),
  CONSTRAINT ck_ai_operation_request_receipts_hash
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_ai_operation_request_receipts_provider_reference
    CHECK ((submission_state = 'accepted' AND provider_request_id IS NOT NULL) OR submission_state <> 'accepted')
);

CREATE INDEX idx_ai_operation_request_receipts_user_prepared
  ON ai_operation_request_receipts(user_id, prepared_at DESC, operation_id);
CREATE UNIQUE INDEX uq_ai_operation_request_receipts_provider_request
  ON ai_operation_request_receipts(provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE TABLE uploaded_images (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT uq_uploaded_images_object_key UNIQUE (object_key),
  CONSTRAINT ck_uploaded_images_purpose CHECK (purpose = 'foodAnalysis'),
  CONSTRAINT ck_uploaded_images_content_type CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT ck_uploaded_images_size CHECK (size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT ck_uploaded_images_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_uploaded_images_status CHECK (status IN ('pendingUpload','uploaded','quarantined','available','deleted'))
);
CREATE INDEX idx_uploaded_images_user_created
  ON uploaded_images(user_id, created_at DESC, id);

CREATE TABLE food_analyses (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_image_id uuid NOT NULL REFERENCES uploaded_images(id) ON DELETE RESTRICT,
  status text NOT NULL,
  runtime_adapter text NOT NULL,
  recognized_result jsonb,
  suitability_result jsonb,
  user_correction jsonb,
  error_category text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  analyzed_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT uq_food_analyses_image UNIQUE (uploaded_image_id),
  CONSTRAINT ck_food_analyses_status CHECK (status IN ('queued','processing','analyzed','technicalError','outcomeUnknown','deleted')),
  CONSTRAINT ck_food_analyses_runtime_adapter CHECK (runtime_adapter IN ('fake','genapi')),
  CONSTRAINT ck_food_analyses_result CHECK (
    (status = 'analyzed' AND recognized_result IS NOT NULL AND suitability_result IS NOT NULL)
    OR status <> 'analyzed'
  )
);
CREATE INDEX idx_food_analyses_user_created
  ON food_analyses(user_id, created_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE TABLE food_analysis_request_receipts (
  food_analysis_id uuid PRIMARY KEY REFERENCES food_analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  request_payload jsonb NOT NULL,
  request_hash text NOT NULL,
  submission_state text NOT NULL DEFAULT 'prepared',
  provider_request_id text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_food_analysis_request_receipts_submission_state
    CHECK (submission_state IN ('prepared','submitting','accepted','ambiguous')),
  CONSTRAINT ck_food_analysis_request_receipts_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_food_analysis_request_receipts_provider_reference
    CHECK ((submission_state = 'accepted' AND provider_request_id IS NOT NULL) OR submission_state <> 'accepted')
);
CREATE UNIQUE INDEX uq_food_analysis_request_receipts_provider_request
  ON food_analysis_request_receipts(provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

ALTER TABLE ai_action_prices DROP CONSTRAINT ck_ai_action_prices_action_type;
ALTER TABLE ai_action_prices ADD CONSTRAINT ck_ai_action_prices_action_type
  CHECK (action_type IN ('quickReply','foodPhotoAnalysis'));
INSERT INTO ai_action_prices (id, action_type, version, price_tokens, active)
VALUES (gen_random_uuid(), 'foodPhotoAnalysis', 1, 5, true);

ALTER TABLE token_transactions ADD COLUMN food_analysis_id uuid;
ALTER TABLE token_transactions ADD CONSTRAINT fk_token_transactions_food_analysis
  FOREIGN KEY (food_analysis_id) REFERENCES food_analyses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX uq_token_transactions_food_analysis_reservation
  ON token_transactions(food_analysis_id)
  WHERE entry_type = 'aiReservation' AND food_analysis_id IS NOT NULL;

CREATE TABLE food_consumptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_analysis_id uuid NOT NULL REFERENCES food_analyses(id) ON DELETE RESTRICT,
  consumed_at timestamptz NOT NULL,
  local_date date NOT NULL,
  timezone text NOT NULL,
  confirmed_result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_food_consumptions_timezone CHECK (length(timezone) BETWEEN 1 AND 64)
);
CREATE UNIQUE INDEX uq_food_consumptions_analysis_active
  ON food_consumptions(food_analysis_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_food_consumptions_user_local_date
  ON food_consumptions(user_id, local_date DESC, consumed_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE TABLE push_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  reminder_type text NOT NULL DEFAULT 'dailyCheckin',
  local_time time,
  timezone text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_push_notification_preferences_type CHECK (reminder_type = 'dailyCheckin'),
  CONSTRAINT ck_push_notification_preferences_schedule CHECK (
    (enabled = false) OR (local_time IS NOT NULL AND timezone IS NOT NULL)
  )
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  endpoint_hash text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT uq_push_subscriptions_endpoint_hash UNIQUE (endpoint_hash),
  CONSTRAINT ck_push_subscriptions_platform CHECK (platform IN ('iosPwa','androidPwa','desktopPwa','unknown')),
  CONSTRAINT ck_push_subscriptions_status CHECK (status IN ('active','revoked','expired'))
);
CREATE INDEX idx_push_subscriptions_user_active
  ON push_subscriptions(user_id, created_at DESC, id)
  WHERE status = 'active';

CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  CONSTRAINT uq_push_deliveries_schedule UNIQUE (subscription_id, reminder_type, scheduled_for),
  CONSTRAINT ck_push_deliveries_type CHECK (reminder_type = 'dailyCheckin'),
  CONSTRAINT ck_push_deliveries_status CHECK (status IN ('queued','processing','delivered','technicalError','expired')),
  CONSTRAINT ck_push_deliveries_attempt_count CHECK (attempt_count >= 0)
);
CREATE INDEX idx_push_deliveries_due
  ON push_deliveries(status, scheduled_for, id);
