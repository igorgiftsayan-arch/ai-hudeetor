CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_user_profiles_timezone_not_blank CHECK (length(trim(timezone)) > 0),
  CONSTRAINT ck_user_profiles_timezone_length CHECK (length(timezone) <= 64)
);

CREATE TABLE ai_preferences (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  persona_id text NOT NULL,
  strictness text NOT NULL,
  response_length text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_preferences_persona_id CHECK (
    persona_id IN ('gentleFriend', 'strictCoach', 'russianLuli', 'glamorousFriend', 'analyst')
  ),
  CONSTRAINT ck_ai_preferences_strictness CHECK (strictness IN ('low', 'medium', 'high')),
  CONSTRAINT ck_ai_preferences_response_length CHECK (response_length IN ('short', 'medium', 'long'))
);

CREATE TABLE outbox_messages (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_outbox_messages_attempts_nonnegative CHECK (attempts >= 0)
);

CREATE INDEX idx_outbox_messages_pending
  ON outbox_messages (available_at, created_at)
  WHERE published_at IS NULL;
