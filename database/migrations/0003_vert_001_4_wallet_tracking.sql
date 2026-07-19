CREATE TABLE token_wallets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE token_transactions (
  id uuid PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES token_wallets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  amount_tokens integer NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_token_transactions_entry_type CHECK (entry_type IN ('starterGrant')),
  CONSTRAINT ck_token_transactions_starter_grant_amount CHECK (entry_type <> 'starterGrant' OR amount_tokens = 100),
  CONSTRAINT uq_token_transactions_starter_grant_user UNIQUE (user_id, entry_type)
);
CREATE INDEX idx_token_transactions_wallet_id_created_at ON token_transactions (wallet_id, created_at);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ck_idempotency_records_state CHECK (state IN ('processing', 'completed')),
  CONSTRAINT uq_idempotency_records_user_scope_key UNIQUE (user_id, operation_scope, idempotency_key)
);

CREATE TABLE weight_entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg numeric(4,1) NOT NULL,
  recorded_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_weight_entries_weight_range CHECK (weight_kg >= 20.0 AND weight_kg <= 500.0),
  CONSTRAINT ck_weight_entries_source CHECK (source = 'manual')
);
CREATE INDEX idx_weight_entries_user_id_recorded_at ON weight_entries (user_id, recorded_at DESC, id DESC);
