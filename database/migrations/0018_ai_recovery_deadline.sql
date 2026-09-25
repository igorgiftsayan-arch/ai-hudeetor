-- Owner-approved 300-second deadline; this records user compensation, not provider billing outcome.
CREATE TABLE ai_recovery_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid UNIQUE REFERENCES ai_operations(id) ON DELETE RESTRICT,
  food_analysis_id uuid UNIQUE REFERENCES food_analyses(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL UNIQUE REFERENCES token_transactions(id) ON DELETE RESTRICT,
  refund_id uuid NOT NULL UNIQUE REFERENCES token_transactions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(reason='projectExpenseRecoveryDeadline'),
  deadline_at timestamptz NOT NULL,
  compensated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(num_nonnulls(operation_id,food_analysis_id)=1)
);
CREATE FUNCTION preserve_ai_recovery_compensation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AI recovery compensation is immutable'; END $$;
CREATE TRIGGER ai_recovery_compensation_immutable BEFORE UPDATE OR DELETE ON ai_recovery_compensations FOR EACH ROW EXECUTE FUNCTION preserve_ai_recovery_compensation();
CREATE FUNCTION preserve_ai_recovery_anchor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'AI request creation time is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ai_operation_recovery_anchor BEFORE UPDATE ON ai_operations FOR EACH ROW EXECUTE FUNCTION preserve_ai_recovery_anchor();
CREATE TRIGGER food_analysis_recovery_anchor BEFORE UPDATE ON food_analyses FOR EACH ROW EXECUTE FUNCTION preserve_ai_recovery_anchor();
