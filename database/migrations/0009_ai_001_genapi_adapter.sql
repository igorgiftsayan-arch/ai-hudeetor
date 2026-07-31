ALTER TABLE ai_operations DROP CONSTRAINT ck_ai_operations_adapter;
ALTER TABLE ai_operations
  ADD CONSTRAINT ck_ai_operations_adapter
  CHECK (runtime_adapter IN ('fake', 'genapi'));

ALTER TABLE ai_operations
  ADD COLUMN provider_model text,
  ADD COLUMN provider_input_tokens integer,
  ADD COLUMN provider_output_tokens integer,
  ADD COLUMN provider_total_tokens integer,
  ADD COLUMN provider_cost numeric(14,6),
  ADD COLUMN provider_latency_ms integer;

ALTER TABLE ai_operations
  ADD CONSTRAINT ck_ai_operations_provider_usage
  CHECK (
    (provider_input_tokens IS NULL OR provider_input_tokens >= 0)
    AND (provider_output_tokens IS NULL OR provider_output_tokens >= 0)
    AND (provider_total_tokens IS NULL OR provider_total_tokens >= 0)
    AND (provider_cost IS NULL OR provider_cost >= 0)
    AND (provider_latency_ms IS NULL OR provider_latency_ms >= 0)
  );
