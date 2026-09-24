ALTER TABLE food_analyses DROP CONSTRAINT ck_food_analyses_status;
ALTER TABLE food_analyses ADD CONSTRAINT ck_food_analyses_status CHECK(status IN ('queued','processing','analyzed','technicalError','outcomeUnknown','deleted','cancelled'));
ALTER TABLE food_analyses ADD COLUMN cancellation_reason text;
ALTER TABLE food_analyses ADD CONSTRAINT ck_food_cancellation_reason CHECK (
 (status='cancelled' AND cancellation_reason IS NOT NULL AND cancellation_reason='knownUnsentUserRequest') OR
 (status<>'cancelled' AND cancellation_reason IS NULL)
);
ALTER TABLE food_analysis_request_receipts DROP CONSTRAINT ck_food_analysis_request_receipts_submission_state;
ALTER TABLE food_analysis_request_receipts ADD CONSTRAINT ck_food_analysis_request_receipts_submission_state CHECK(submission_state IN ('prepared','submitting','accepted','completed','ambiguous','cancelled'));
CREATE OR REPLACE FUNCTION preserve_food_terminal_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.terminal_at IS NOT NULL THEN
    IF NEW.terminal_at IS DISTINCT FROM OLD.terminal_at THEN
      RAISE EXCEPTION 'food terminal timestamp is immutable';
    END IF;
  ELSIF NEW.status IN ('analyzed','technicalError','cancelled') AND
    (TG_OP = 'INSERT' OR OLD.status NOT IN ('analyzed','technicalError','cancelled')) THEN
    NEW.terminal_at := now();
  ELSIF NEW.terminal_at IS NOT NULL THEN
    RAISE EXCEPTION 'food terminal timestamp requires terminal transition';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION preserve_food_receipt_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.food_analysis_id,NEW.user_id,NEW.provider,NEW.model,NEW.request_hash)
     IS DISTINCT FROM ROW(OLD.food_analysis_id,OLD.user_id,OLD.provider,OLD.model,OLD.request_hash) THEN
    RAISE EXCEPTION 'food receipt identity is immutable';
  END IF;
  IF NEW.request_payload IS DISTINCT FROM OLD.request_payload OR NEW.content_deleted_at IS DISTINCT FROM OLD.content_deleted_at THEN
    IF OLD.content_deleted_at IS NOT NULL OR NEW.request_payload IS NOT NULL OR NEW.content_deleted_at IS NULL OR
       NOT EXISTS(SELECT 1 FROM food_analyses WHERE id=OLD.food_analysis_id AND deleted_at IS NOT NULL AND status IN ('analyzed','technicalError','cancelled')) THEN
      RAISE EXCEPTION 'food receipt content may only be erased after terminal deletion';
    END IF;
  END IF;
  RETURN NEW;
END $$;
