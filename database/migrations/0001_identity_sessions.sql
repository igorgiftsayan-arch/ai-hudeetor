CREATE TABLE users (
  id uuid PRIMARY KEY,
  email_normalized text NOT NULL,
  status text NOT NULL,
  onboarding_status text NOT NULL,
  registration_idempotency_key text NOT NULL,
  registration_request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_users_status CHECK (status IN ('active', 'disabled', 'deleted')),
  CONSTRAINT ck_users_onboarding_status CHECK (
    onboarding_status IN ('registered', 'profileReady', 'personaReady', 'completed')
  )
);

CREATE UNIQUE INDEX uq_users_email_normalized ON users (email_normalized);
CREATE UNIQUE INDEX uq_users_registration_idempotency_key
  ON users (registration_idempotency_key);

CREATE TABLE password_credentials (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_consents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  document_version text NOT NULL,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_consents_type CHECK (
    consent_type IN ('terms', 'privacy', 'aiWellnessNotice', 'aiProviderProcessing')
  ),
  CONSTRAINT ck_user_consents_source CHECK (source IN ('web'))
);

CREATE UNIQUE INDEX uq_user_consents_user_type_version
  ON user_consents (user_id, consent_type, document_version);
CREATE INDEX idx_user_consents_user_id ON user_consents (user_id);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  registration_idempotency_key text,
  access_token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  rotated_from_id uuid,
  replaced_by_id uuid,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_sessions_expiry CHECK (refresh_expires_at > access_expires_at),
  CONSTRAINT fk_user_sessions_rotated_from_id
    FOREIGN KEY (rotated_from_id) REFERENCES user_sessions (id),
  CONSTRAINT fk_user_sessions_replaced_by_id
    FOREIGN KEY (replaced_by_id) REFERENCES user_sessions (id)
);

CREATE UNIQUE INDEX uq_user_sessions_access_token_hash
  ON user_sessions (access_token_hash);
CREATE UNIQUE INDEX uq_user_sessions_refresh_token_hash
  ON user_sessions (refresh_token_hash);
CREATE UNIQUE INDEX uq_user_sessions_rotated_from_id
  ON user_sessions (rotated_from_id) WHERE rotated_from_id IS NOT NULL;
CREATE UNIQUE INDEX uq_user_sessions_replaced_by_id
  ON user_sessions (replaced_by_id) WHERE replaced_by_id IS NOT NULL;
CREATE INDEX idx_user_sessions_user_id ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_family_id ON user_sessions (family_id);
CREATE INDEX idx_user_sessions_registration_idempotency_key
  ON user_sessions (registration_idempotency_key);
CREATE INDEX idx_user_sessions_access_expires_at ON user_sessions (access_expires_at);
CREATE INDEX idx_user_sessions_refresh_expires_at ON user_sessions (refresh_expires_at);
