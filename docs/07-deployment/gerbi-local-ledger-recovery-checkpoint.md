# GERBI local ledger/recovery checkpoint — 2026-09-24

Branch: `back/gerbi-expanded-pilot`, based on `30a6be2` (independent PostgreSQL concurrency tests) and integrated UI/docs `56885d2`. Main/stable/deployed images were not changed.

## Changes

- Submission, receipt acceptance and recovery acquire the same operation-row lock before inspecting/updating the receipt. Recovery uses bounded `FOR UPDATE SKIP LOCKED` selection then reads receipt state under the lock.
- Food ledger statements remove nonexistent `reason` and provide required `reference_type`/`reference_id`; the actual migrations remain unchanged.
- Food consumption SQL returns PostgreSQL `date` as text, preserving `YYYY-MM-DD` both in fresh responses and saved idempotency responses. A real database test first reproduced the previous timezone-bearing Date string.
- API noEmit config overrides inherited `composite: true`: tests directly import backend source outside API include patterns. Build already used `composite: false`. Daily-state test double has an explicit boundary cast consistent with adjacent mocks. Neither failure was attributed to Node version.

## Verified locally

PostgreSQL 16.14 local cluster, separate `gerbi_backend_verification` database; actual SQL migrations applied. Concurrency tests create independent schemas. No shared application database was truncated.

- API suite: **20 suites, 92/92 tests passed**, including all previously skipped PostgreSQL cases. Run after actual migration through `database/migrate.ts`.
- Worker suite: **12 suites, 44/44 tests passed**, including two actual PostgreSQL submit/recovery races and two new FoodService lifecycle cases.
- Backend build, backend/worker/API typecheck and scoped lint: **PASS**.
- Food lifecycle proves create idempotency, one reservation/outbox, one confirmation after repeated worker delivery, no diary record before consumption confirmation, recognition correction, explicit confirmation and exact replay, owner read isolation, edit persistence through a fresh service instance, delete/replay, technical-error refund once. The calendar assertion is exactly `2026-09-24` for `2026-09-23T18:00:00Z` in Asia/Irkutsk.

Local raw logs: `work/gerbi-backend-verification/{worker-tests,backend-build,backend-typecheck,worker-typecheck,api-typecheck,scoped-lint}.log`. Initial 92-test API result is recorded in the executor tool output (exit 0, 20/20 suites, 92/92 tests); it was not rerun solely to create another log.

## Limits

Local Node is 26.0.0; approved deployment baseline remains Node 24. These gates do not replace verification in the approved runtime. Food lifecycle deliberately uses fake provider and seeded available image; race tests stub provider/S3. Real GenAPI photo analysis, real upload storage round trip, browser reload journey, external HTTPS and physical phone push are **NOT RUN in this checkpoint**. No claim of complete expanded-pilot or release acceptance.
