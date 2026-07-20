ALTER TABLE token_transactions DROP CONSTRAINT ck_token_transactions_entry_type;
ALTER TABLE token_transactions DROP CONSTRAINT ck_token_transactions_starter_grant_amount;
ALTER TABLE token_transactions ADD COLUMN operation_id uuid;
ALTER TABLE token_transactions ADD COLUMN reservation_id uuid;
ALTER TABLE token_transactions ADD CONSTRAINT ck_token_transactions_entry_type CHECK (entry_type IN ('starterGrant','aiReservation','aiConfirmation','aiRefund'));
ALTER TABLE token_transactions ADD CONSTRAINT ck_token_transactions_amount CHECK ((entry_type='starterGrant' AND amount_tokens=100) OR (entry_type='aiReservation' AND amount_tokens<0) OR (entry_type='aiConfirmation' AND amount_tokens=0) OR (entry_type='aiRefund' AND amount_tokens>0));

CREATE TABLE ai_action_prices (
  id uuid PRIMARY KEY,
  action_type text NOT NULL,
  version integer NOT NULL,
  price_tokens integer NOT NULL,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_action_prices_action_type CHECK (action_type='quickReply'),
  CONSTRAINT ck_ai_action_prices_price CHECK (price_tokens >= 1),
  CONSTRAINT uq_ai_action_prices_action_version UNIQUE (action_type, version)
);
CREATE UNIQUE INDEX uq_ai_action_prices_active_action ON ai_action_prices(action_type) WHERE active;
INSERT INTO ai_action_prices (id, action_type, version, price_tokens, active) VALUES (gen_random_uuid(),'quickReply',1,1,true);

CREATE TABLE ai_conversations (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_ai_conversations_user_id_created_at ON ai_conversations(user_id, created_at DESC);
CREATE TABLE ai_messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE, role text NOT NULL, content text NOT NULL, prompt_version text, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ck_ai_messages_role CHECK (role IN ('user','assistant')));
CREATE INDEX idx_ai_messages_conversation_id_created_at ON ai_messages(conversation_id, created_at);
CREATE TABLE ai_operations (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE, input_message_id uuid NOT NULL REFERENCES ai_messages(id) ON DELETE RESTRICT, output_message_id uuid REFERENCES ai_messages(id) ON DELETE RESTRICT, status text NOT NULL, action_type text NOT NULL, price_version integer NOT NULL, reserved_tokens integer NOT NULL, runtime_adapter text NOT NULL, prompt_version text NOT NULL, error_class text, provider_reference text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ck_ai_operations_status CHECK (status IN ('queued','processing','succeeded','technicalError','outcomeUnknown')), CONSTRAINT ck_ai_operations_action CHECK (action_type='quickReply'), CONSTRAINT ck_ai_operations_adapter CHECK (runtime_adapter='fake'));
CREATE UNIQUE INDEX uq_ai_operations_active_user ON ai_operations(user_id) WHERE status IN ('queued','processing','outcomeUnknown');
CREATE UNIQUE INDEX uq_token_transactions_operation_reservation ON token_transactions(operation_id) WHERE entry_type='aiReservation';
CREATE UNIQUE INDEX uq_token_transactions_terminal ON token_transactions(reservation_id) WHERE entry_type IN ('aiConfirmation','aiRefund');
