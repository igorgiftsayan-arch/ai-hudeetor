ALTER TABLE food_analyses ADD COLUMN terminal_at timestamptz;
-- Backfill only observed terminal evidence, never mutable updated_at.
UPDATE food_analyses a SET terminal_at = coalesce(a.analyzed_at,
  (SELECT min(t.created_at) FROM token_transactions t
   WHERE t.food_analysis_id=a.id AND t.entry_type IN ('aiConfirmation','aiRefund')))
WHERE a.status IN ('analyzed','technicalError');

CREATE FUNCTION preserve_food_terminal_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.terminal_at IS NOT NULL THEN
    IF NEW.terminal_at IS DISTINCT FROM OLD.terminal_at THEN
      RAISE EXCEPTION 'food terminal timestamp is immutable';
    END IF;
  ELSIF NEW.status IN ('analyzed','technicalError') AND
    (TG_OP = 'INSERT' OR OLD.status NOT IN ('analyzed','technicalError')) THEN
    NEW.terminal_at := now();
  ELSIF NEW.terminal_at IS NOT NULL THEN
    RAISE EXCEPTION 'food terminal timestamp requires terminal transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER food_terminal_time BEFORE INSERT OR UPDATE ON food_analyses
  FOR EACH ROW EXECUTE FUNCTION preserve_food_terminal_time();
CREATE INDEX idx_food_terminal_retention ON food_analyses(terminal_at)
  WHERE status IN ('analyzed','technicalError') AND terminal_at IS NOT NULL;

CREATE TABLE food_image_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL UNIQUE REFERENCES uploaded_images(id) ON DELETE RESTRICT,
  original_object_key text NOT NULL,
  staging_object_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_category text CHECK (last_error_category IS NULL OR last_error_category='storageUnavailable'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_food_image_cleanup_due ON food_image_cleanup_jobs(status,available_at,lease_expires_at);
CREATE FUNCTION preserve_food_cleanup_keys() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.image_id IS DISTINCT FROM OLD.image_id OR
     NEW.original_object_key IS DISTINCT FROM OLD.original_object_key OR
     NEW.staging_object_key IS DISTINCT FROM OLD.staging_object_key THEN
    RAISE EXCEPTION 'food cleanup target is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER food_cleanup_keys BEFORE UPDATE ON food_image_cleanup_jobs
  FOR EACH ROW EXECUTE FUNCTION preserve_food_cleanup_keys();
