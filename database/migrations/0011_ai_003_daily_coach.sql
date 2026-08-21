CREATE TABLE ai_daily_states (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_daily_states_user_local_date UNIQUE (user_id, local_date),
  CONSTRAINT ck_ai_daily_states_status
    CHECK (status IN ('notStarted', 'inProgress', 'completed')),
  CONSTRAINT ck_ai_daily_states_timestamps CHECK (
    (status = 'notStarted' AND started_at IS NULL AND completed_at IS NULL)
    OR (status = 'inProgress' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_ai_daily_states_user_local_date
  ON ai_daily_states (user_id, local_date DESC, id);

