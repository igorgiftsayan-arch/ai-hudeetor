ALTER TABLE token_transactions
  DROP CONSTRAINT uq_token_transactions_starter_grant_user;

CREATE UNIQUE INDEX uq_token_transactions_starter_grant_user
  ON token_transactions (user_id)
  WHERE entry_type = 'starterGrant';
