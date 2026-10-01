ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE identity_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_identity_tokens_hash UNIQUE (token_hash),
  CONSTRAINT ck_identity_tokens_purpose CHECK (purpose IN ('emailVerification', 'passwordReset')),
  CONSTRAINT ck_identity_tokens_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_identity_tokens_user_purpose
  ON identity_tokens (user_id, purpose, created_at DESC);

CREATE TABLE identity_email_deliveries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES identity_tokens(id) ON DELETE CASCADE,
  template text NOT NULL,
  token_ciphertext text NOT NULL,
  token_iv text NOT NULL,
  token_auth_tag text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claim_id uuid,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_identity_email_deliveries_token UNIQUE (token_id),
  CONSTRAINT ck_identity_email_deliveries_template CHECK (template IN ('verifyEmail', 'passwordReset')),
  CONSTRAINT ck_identity_email_deliveries_status CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  CONSTRAINT ck_identity_email_deliveries_attempts CHECK (attempts >= 0)
);

CREATE INDEX idx_identity_email_deliveries_pending
  ON identity_email_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'sending');
