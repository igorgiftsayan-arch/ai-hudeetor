CREATE OR REPLACE FUNCTION guard_ai_ledger_transaction() RETURNS trigger AS $$
DECLARE reservation token_transactions%ROWTYPE;
DECLARE current_balance integer;
BEGIN
  PERFORM 1 FROM token_wallets WHERE id = NEW.wallet_id FOR UPDATE;
  SELECT COALESCE(SUM(amount_tokens), 0) INTO current_balance FROM token_transactions WHERE wallet_id = NEW.wallet_id;
  IF current_balance + NEW.amount_tokens < 0 THEN RAISE EXCEPTION 'token balance cannot be negative'; END IF;
  IF NEW.entry_type IN ('aiConfirmation', 'aiRefund') THEN
    SELECT * INTO reservation FROM token_transactions WHERE id = NEW.reservation_id AND entry_type = 'aiReservation';
    IF NOT FOUND OR reservation.wallet_id <> NEW.wallet_id OR reservation.user_id <> NEW.user_id THEN RAISE EXCEPTION 'terminal effect must reference its reservation'; END IF;
    IF NEW.entry_type = 'aiRefund' AND NEW.amount_tokens <> -reservation.amount_tokens THEN RAISE EXCEPTION 'refund must equal reservation'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_token_transactions_guard BEFORE INSERT ON token_transactions FOR EACH ROW EXECUTE FUNCTION guard_ai_ledger_transaction();

ALTER TABLE token_transactions
  ADD CONSTRAINT fk_token_transactions_operation
  FOREIGN KEY (operation_id) REFERENCES ai_operations(id) ON DELETE RESTRICT;

ALTER TABLE token_transactions
  ADD CONSTRAINT fk_token_transactions_reservation
  FOREIGN KEY (reservation_id) REFERENCES token_transactions(id) ON DELETE RESTRICT;
