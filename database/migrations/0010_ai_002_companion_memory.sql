ALTER TABLE user_profiles
  ADD COLUMN display_name text,
  ADD COLUMN target_weight_kg numeric(5,2);

ALTER TABLE user_profiles
  ADD CONSTRAINT ck_user_profiles_display_name
    CHECK (
      display_name IS NULL
      OR (
        length(trim(display_name)) BETWEEN 1 AND 80
        AND display_name !~ '[[:cntrl:]]'
      )
    ),
  ADD CONSTRAINT ck_user_profiles_target_weight
    CHECK (
      target_weight_kg IS NULL
      OR target_weight_kg BETWEEN 20.00 AND 500.00
    );

CREATE TABLE ai_memory_extractions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES ai_messages (id) ON DELETE CASCADE,
  status text NOT NULL,
  facts_written integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ai_memory_extractions_status
    CHECK (status IN ('completed')),
  CONSTRAINT ck_ai_memory_extractions_facts_written
    CHECK (facts_written >= 0),
  CONSTRAINT uq_ai_memory_extractions_user_source
    UNIQUE (user_id, source_message_id)
);

CREATE INDEX idx_ai_memory_extractions_user_created
  ON ai_memory_extractions (user_id, created_at DESC, id DESC);

CREATE TABLE ai_memories (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  source text NOT NULL,
  confidence numeric(3,2) NOT NULL,
  source_message_id uuid REFERENCES ai_messages (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_ai_memories_category CHECK (
    category IN (
      'preference',
      'restriction',
      'trigger',
      'supportStrategy',
      'goal',
      'communicationPreference'
    )
  ),
  CONSTRAINT ck_ai_memories_source
    CHECK (source IN ('conversation', 'profile', 'system')),
  CONSTRAINT ck_ai_memories_confidence
    CHECK (confidence BETWEEN 0.00 AND 1.00),
  CONSTRAINT ck_ai_memories_key
    CHECK (length(trim(key)) BETWEEN 1 AND 120),
  CONSTRAINT ck_ai_memories_value
    CHECK (
      length(trim(value)) BETWEEN 1 AND 240
      AND value !~ '[[:cntrl:]]'
    )
);

CREATE UNIQUE INDEX uq_ai_memories_user_category_key_active
  ON ai_memories (user_id, category, key)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_ai_memories_user_active
  ON ai_memories (user_id, category, updated_at DESC, id)
  WHERE deleted_at IS NULL;

