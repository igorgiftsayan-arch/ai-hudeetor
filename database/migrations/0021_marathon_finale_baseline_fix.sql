-- Public enrollment baseline starts at the actual start timestamp, not at the
-- beginning of its local calendar date. Legacy code-based marathons retain the
-- historical trigger semantics established by migrations 0014 and 0020.
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
    AND (entry.recorded_at AT TIME ZONE marathon.timezone)::date
        BETWEEN marathon.starts_on AND marathon.ends_on
    AND (
      marathon.enrollment_mode = 'legacyCode'
      OR (
        marathon.enrollment_mode = 'publicEnrollment'
        AND marathon.started_at IS NOT NULL
        AND entry.recorded_at >= marathon.started_at
      )
    )
  ORDER BY entry.recorded_at, entry.created_at, entry.id
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
  legacy_weight numeric(6,2);
  legacy_entry_id uuid;
  legacy_recorded_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    legacy_weight := OLD.weight_kg;
    legacy_entry_id := OLD.id;
    legacy_recorded_at := OLD.recorded_at;
  ELSE
    legacy_weight := NEW.weight_kg;
    legacy_entry_id := NEW.id;
    legacy_recorded_at := NEW.recorded_at;
  END IF;

  -- Serialize a weight write with startMarathon's FOR UPDATE lock. If start
  -- wins, this trigger observes inProgress and captures NEW. If the weight
  -- write wins, start observes the committed row and applies started_at.
  PERFORM marathon.id
  FROM marathons AS marathon
  JOIN marathon_memberships AS membership
    ON membership.marathon_id = marathon.id
  WHERE membership.user_id = NEW.user_id
    AND membership.baseline_weight_entry_id IS NULL
    AND marathon.status IN ('enrollmentClosed','inProgress','completed')
  ORDER BY marathon.id
  FOR SHARE OF marathon;

  UPDATE marathon_memberships AS membership
  SET baseline_weight_kg = CASE
        WHEN marathon.enrollment_mode = 'publicEnrollment' THEN NEW.weight_kg
        ELSE legacy_weight
      END,
      baseline_weight_entry_id = CASE
        WHEN marathon.enrollment_mode = 'publicEnrollment' THEN NEW.id
        ELSE legacy_entry_id
      END,
      baseline_captured_at = now()
  FROM marathons AS marathon
  WHERE membership.marathon_id = marathon.id
    AND membership.user_id = NEW.user_id
    AND membership.baseline_weight_entry_id IS NULL
    AND marathon.status IN ('inProgress','completed')
    AND marathon.starts_on IS NOT NULL
    AND marathon.ends_on IS NOT NULL
    AND (
      (
        marathon.enrollment_mode = 'legacyCode'
        AND (legacy_recorded_at AT TIME ZONE marathon.timezone)::date
            BETWEEN marathon.starts_on AND marathon.ends_on
      )
      OR
      (
        marathon.enrollment_mode = 'publicEnrollment'
        AND NEW.is_current
        AND marathon.started_at IS NOT NULL
        AND NEW.recorded_at >= marathon.started_at
        AND (NEW.recorded_at AT TIME ZONE marathon.timezone)::date
            BETWEEN marathon.starts_on AND marathon.ends_on
      )
    );

  RETURN NEW;
END;
$$;
