-- BACK-UI-001. Keep existing measurements for audit/history, but designate one
-- current value per user-local calendar date. No historical row is deleted.
ALTER TABLE weight_entries
  ADD COLUMN local_date date,
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN is_current boolean NOT NULL DEFAULT true;

UPDATE weight_entries
SET updated_at = created_at
WHERE updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM weight_entries AS entry
    LEFT JOIN user_profiles AS profile ON profile.user_id = entry.user_id
    WHERE profile.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot derive local weight dates without user profile timezones';
  END IF;
END $$;

UPDATE weight_entries AS entry
SET local_date = (entry.recorded_at AT TIME ZONE profile.timezone)::date
FROM user_profiles AS profile
WHERE profile.user_id = entry.user_id;

ALTER TABLE weight_entries
  ALTER COLUMN local_date SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

WITH ranked_entries AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, local_date
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS position
  FROM weight_entries
)
UPDATE weight_entries AS entry
SET is_current = ranked_entries.position = 1
FROM ranked_entries
WHERE entry.id = ranked_entries.id;

CREATE UNIQUE INDEX uq_weight_entries_user_local_date_current
  ON weight_entries (user_id, local_date)
  WHERE is_current;

CREATE INDEX idx_weight_entries_user_local_date_current
  ON weight_entries (user_id, local_date DESC, recorded_at DESC, id DESC)
  WHERE is_current;
