# ADR-013: Durable AI recovery deadline compensation

Status: implementation of owner decision2026-09-25; runtime acceptance pending.

The economic deadline is300seconds from immutable operation.created_at, in the
transaction that accepts the request/reserves tokens. Use PostgreSQL
clock_timestamp after acquiring the operation lock; now() would retain the time
before a lock wait. Queued, processing and outcomeUnknown all qualify when no
usable result has committed. Successful terminal operations are excluded.

Token-economy application owns a shared compensation transaction for chat and
food; worker composes it at recovery, submission, callback and finalization
boundaries. Operation lock precedes reservation lock, matching existing writers.
Append one full aiRefund and an immutable ai_recovery_compensations audit record.
Database unique terminal reservation constraint remains the final guard. Mark
local operation technicalError/recoveryDeadlineExceeded; this describes missing
user result, not provider failure/billing. No new analytics event is invented.

Receipt identity/hash/payload and provider cost remain; local receipt processing
ends. A late accepted ID may fill the receipt ID only, never revive its processing
or enqueue reconciliation after compensation. Late results cannot charge again.

Automatic recovery runs every30seconds, at most50 expired requests per kind per
pass, no overlapping runs per instance, startup catch-up, shutdown timer cleanup.
Eligibility is exactly300seconds, not a promise of wall-clock delivery during
outage/backlog. Active submit/finalize paths compensate immediately when due.
No public administrative endpoint, new provider POST or financial-record rewrite.

Food detail/list expose ledger-derived refundStatus plus existing errorCategory;
chat detail/history retain their corresponding refundStatus/errorCode contract.
UI must not infer refund from technicalError alone.
