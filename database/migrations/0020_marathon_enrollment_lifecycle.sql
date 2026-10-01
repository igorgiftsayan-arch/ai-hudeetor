DO $$
DECLARE
  unfinished_count integer;
  invalid_duration_count integer;
BEGIN
  SELECT count(*)
    INTO unfinished_count
    FROM marathons
   WHERE ends_on >= (now() AT TIME ZONE timezone)::date;

  IF unfinished_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0020 requires at most one unfinished legacy marathon';
  END IF;

  SELECT count(*)
    INTO invalid_duration_count
    FROM marathons
   WHERE (ends_on - starts_on + 1) NOT BETWEEN 1 AND 365;

  IF invalid_duration_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = '0020 requires legacy marathon duration between 1 and 365 days';
  END IF;
END;
$$;

ALTER TABLE marathons
  ADD COLUMN status text,
  ADD COLUMN duration_days integer,
  ADD COLUMN enrollment_opened_at timestamptz,
  ADD COLUMN enrollment_closed_at timestamptz,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz;

UPDATE marathons AS marathon
   SET status = CASE
         WHEN marathon.ends_on < (now() AT TIME ZONE marathon.timezone)::date THEN 'completed'
         ELSE 'inProgress'
       END,
       duration_days = (marathon.ends_on - marathon.starts_on + 1),
       enrollment_opened_at = marathon.created_at,
       enrollment_closed_at = marathon.created_at,
       started_at = marathon.created_at,
       completed_at = CASE
         WHEN marathon.ends_on < (now() AT TIME ZONE marathon.timezone)::date THEN now()
         ELSE NULL
       END;

ALTER TABLE marathons
  ALTER COLUMN starts_on DROP NOT NULL,
  ALTER COLUMN ends_on DROP NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN duration_days SET NOT NULL,
  ALTER COLUMN enrollment_opened_at SET NOT NULL,
  ADD CONSTRAINT ck_marathons_status CHECK (
    status IN ('enrollmentOpen','enrollmentClosed','inProgress','completed')
  ),
  ADD CONSTRAINT ck_marathons_duration_days CHECK (
    duration_days BETWEEN 1 AND 365
  ),
  ADD CONSTRAINT ck_marathons_lifecycle_dates CHECK (
    (status IN ('enrollmentOpen','enrollmentClosed') AND starts_on IS NULL AND ends_on IS NULL)
    OR
    (status IN ('inProgress','completed') AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on >= starts_on)
  );

CREATE UNIQUE INDEX uq_marathons_single_unfinished
  ON marathons ((true))
  WHERE status IN ('enrollmentOpen','enrollmentClosed','inProgress');

CREATE INDEX idx_marathons_status_created_at
  ON marathons(status,created_at DESC);

-- The old trigger already ignores NULL date ranges through SQL's three-valued
-- BETWEEN semantics. This explicit guard makes the enrollment invariant durable.
CREATE OR REPLACE FUNCTION capture_marathon_baseline_from_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  baseline_entry weight_entries%ROWTYPE;
BEGIN
  SELECT entry.*
  INTO baseline_entry
  FROM weight_entries AS entry
  JOIN marathons AS marathon ON marathon.id = NEW.marathon_id
  WHERE entry.user_id = NEW.user_id
    AND entry.is_current
    AND marathon.status IN ('inProgress','completed')
    AND marathon.starts_on IS NOT NULL
    AND marathon.ends_on IS NOT NULL
    AND entry.local_date BETWEEN marathon.starts_on AND marathon.ends_on
  ORDER BY entry.local_date, entry.created_at, entry.id
  LIMIT 1;

  IF baseline_entry.id IS NOT NULL THEN
    UPDATE marathon_memberships
    SET baseline_weight_kg = baseline_entry.weight_kg,
        baseline_weight_entry_id = baseline_entry.id,
        baseline_captured_at = now()
    WHERE id = NEW.id
      AND baseline_weight_entry_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION capture_marathon_baseline_from_weight()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_weight numeric(6,2);
  source_entry_id uuid;
  source_local_date date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    source_weight := OLD.weight_kg;
    source_entry_id := OLD.id;
    source_local_date := OLD.local_date;
  ELSE
    source_weight := NEW.weight_kg;
    source_entry_id := NEW.id;
    source_local_date := NEW.local_date;
  END IF;

  UPDATE marathon_memberships AS membership
  SET baseline_weight_kg = source_weight,
      baseline_weight_entry_id = source_entry_id,
      baseline_captured_at = now()
  FROM marathons AS marathon
  WHERE membership.marathon_id = marathon.id
    AND membership.user_id = NEW.user_id
    AND membership.baseline_weight_entry_id IS NULL
    AND marathon.status IN ('inProgress','completed')
    AND marathon.starts_on IS NOT NULL
    AND marathon.ends_on IS NOT NULL
    AND source_local_date BETWEEN marathon.starts_on AND marathon.ends_on;

  RETURN NEW;
END;
$$;
