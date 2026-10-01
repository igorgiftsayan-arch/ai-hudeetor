ALTER TABLE food_analyses DROP CONSTRAINT ck_food_analyses_result;
ALTER TABLE food_analyses ADD CONSTRAINT ck_food_analyses_result CHECK (
  (deleted_at IS NOT NULL AND recognized_result IS NULL AND suitability_result IS NULL AND user_correction IS NULL)
  OR (deleted_at IS NULL AND (status <> 'analyzed' OR (recognized_result IS NOT NULL AND suitability_result IS NOT NULL)))
);
ALTER TABLE food_analysis_request_receipts ALTER COLUMN request_payload DROP NOT NULL;
ALTER TABLE food_analysis_request_receipts ADD COLUMN content_deleted_at timestamptz;
ALTER TABLE food_analysis_request_receipts ADD CONSTRAINT ck_food_receipt_content CHECK (
  (request_payload IS NULL) = (content_deleted_at IS NOT NULL)
);
CREATE FUNCTION preserve_food_receipt_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.food_analysis_id,NEW.user_id,NEW.provider,NEW.model,NEW.request_hash)
     IS DISTINCT FROM ROW(OLD.food_analysis_id,OLD.user_id,OLD.provider,OLD.model,OLD.request_hash) THEN
    RAISE EXCEPTION 'food receipt identity is immutable';
  END IF;
  IF NEW.request_payload IS DISTINCT FROM OLD.request_payload OR NEW.content_deleted_at IS DISTINCT FROM OLD.content_deleted_at THEN
    IF OLD.content_deleted_at IS NOT NULL OR NEW.request_payload IS NOT NULL OR NEW.content_deleted_at IS NULL OR
       NOT EXISTS(SELECT 1 FROM food_analyses WHERE id=OLD.food_analysis_id AND deleted_at IS NOT NULL AND status IN ('analyzed','technicalError')) THEN
      RAISE EXCEPTION 'food receipt content may only be erased after terminal deletion';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER food_receipt_content BEFORE UPDATE ON food_analysis_request_receipts
  FOR EACH ROW EXECUTE FUNCTION preserve_food_receipt_content();
ALTER TABLE food_image_cleanup_jobs ADD COLUMN reason text NOT NULL DEFAULT 'retention' CHECK(reason IN ('retention','userRequest'));
ALTER TABLE food_image_cleanup_jobs ADD COLUMN requested_at timestamptz;
ALTER TABLE food_image_cleanup_jobs ADD COLUMN deadline_at timestamptz;
ALTER TABLE food_image_cleanup_jobs ADD CONSTRAINT ck_food_cleanup_request CHECK (
 (reason='retention' AND requested_at IS NULL AND deadline_at IS NULL) OR
 (reason='userRequest' AND requested_at IS NOT NULL AND deadline_at=requested_at+interval '24 hours')
);
