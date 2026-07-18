# Наблюдаемость

## Корреляция и логи

Структурированные логи содержат timestamp, environment, service, version, request/job/operation ID, safe error code. Запрещены password/session/recovery secrets, authorization/cookies, signed URLs, фотографии, полный prompt/response и лишний PII. Admin audit — отдельный append-only контур, не application log.

## Метрики

- HTTP throughput/error/latency и readiness.
- Queue depth/wait/retry/dead-letter и worker heartbeat.
- PostgreSQL/Redis/S3 availability, pools и capacity.
- AI queue time, latency, success/technical failure/unknown, retries, usage, calculated cost и context size.
- Token reserves/confirms/refunds, зависшие резервы и wallet/ledger reconciliation.
- Payment/referral deduplication failures.
- CPU/RAM/disk, migration status, backup freshness и restore drill.

## Health

Liveness проверяет процесс и не зависит от AI. Readiness проверяет критические внутренние зависимости с коротким timeout. Dependency diagnostics закрыты. Worker публикует heartbeat. Smoke использует fake/sandbox adapters и не создаёт реальный платный AI-вызов.

## Alerts и tracing

Алерты обязательны для error/latency/cost spike, budget threshold, queue lag/DLQ, зависших операций, capacity, backup failure и migration failure. Correlation охватывает web request → API operation → outbox/job → AI/storage adapter → ledger. Полный distributed tracing и конкретные инструменты выбираются позже.
