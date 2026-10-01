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
    AND source_local_date BETWEEN marathon.starts_on AND marathon.ends_on;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_weight_entries_capture_marathon_baseline
AFTER INSERT OR UPDATE OF weight_kg, recorded_at, local_date
ON weight_entries
FOR EACH ROW
EXECUTE FUNCTION capture_marathon_baseline_from_weight();

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

CREATE TRIGGER trg_marathon_memberships_capture_baseline
AFTER INSERT
ON marathon_memberships
FOR EACH ROW
EXECUTE FUNCTION capture_marathon_baseline_from_membership();

WITH baseline_candidates AS (
  SELECT membership.id AS membership_id,
    (
      SELECT entry.id
      FROM weight_entries AS entry
      JOIN marathons AS marathon ON marathon.id = membership.marathon_id
      WHERE entry.user_id = membership.user_id
        AND entry.is_current
        AND entry.local_date BETWEEN marathon.starts_on AND marathon.ends_on
      ORDER BY entry.local_date, entry.created_at, entry.id
      LIMIT 1
    ) AS entry_id
  FROM marathon_memberships AS membership
  WHERE membership.baseline_weight_entry_id IS NULL
)
UPDATE marathon_memberships AS membership
SET baseline_weight_kg = entry.weight_kg,
    baseline_weight_entry_id = entry.id,
    baseline_captured_at = now()
FROM baseline_candidates AS candidate
JOIN weight_entries AS entry ON entry.id = candidate.entry_id
WHERE membership.id = candidate.membership_id;
