# GERBI local ledger/recovery checkpoint — 2026-09-24

## Current checkpoint: integrated `f360290`, deletion/list fixes locally independently reviewed

The user approved continuing local development while increasing server RAM and
storage. Remote capacity is pending. This update changes documentation only;
product scope and `main` are unchanged. Local progress does not establish remote
runtime acceptance.

### User-requested deletion and known-unsent cancellation

| Checkpoint | Local evidence | Acceptance boundary |
| --- | --- | --- |
| Terminal deletion `b9a60be` | **32/32** targeted PG/runner PASS; independent reviewer found no P1/P2 and reran **7/7 actual PG** | Local terminal checkpoint reviewed; no real S3/SLA assertion |
| Cancellation `5a08efb` | **41/41** across six suites; latest cancellation subset **10/10** after strict-NULL/empty-ID and repeated-delete checks | Independent reviewer: no concrete P1/P2, **10/10 actual PG** PASS; remote acceptance pending |
| Food UI `1c6a234` | **43/43** food tests, full web typecheck and scoped lint PASS; official generated DTO | Browser/runtime acceptance pending |

The counts overlap; do not add them into a new aggregate test count. Migration0016
and0017, followed by repeated migration runner invocations, passed on the dedicated
local PostgreSQL database. Backend/worker/API typecheck, scoped lint, generated
OpenAPI/Orval and committed-tree contracts:check passed. Tests use actual migrations
and synthetic PostgreSQL schemas; external S3/provider transport is stubbed.

Terminal deletion provides independent photo/result commands and owner-scoped status
after tombstone. Result deletion clears structured content, erasable receipt payload
and old content-bearing idempotency responses while retaining receipt identity/hash,
ledger and the separately confirmed diary snapshot. Photo deletion immediately
blocks reuse and durably retries original/staging cleanup; a live lease and the first
24-hour deadline survive repeat requests. ADR-012 records the invariant split.

Owner-approved cancellation is implemented only for queued/no-receipt or a prepared
receipt with strictly NULL submission time/provider references. The transaction locks
the operation row used by worker claim/submit/finalize, refunds the full reservation
once with a distinct cancellation reason, clears the attempt and marks the receipt
cancelled. Actual PG barriers cover both outcomes: cancellation wins and resumed
worker sends nothing; submission wins before provider ID and cancellation rejects
without refund. Missing provider ID alone is insufficient. Pre-ID unknown goodwill
policy remains TBD. Independent financial-race review found no concrete P1/P2 and reran the10-case
actual-PG cancellation suite successfully. This is local verification only.

Evidence in backend worktree `work/gerbi-backend-verification/`:
`terminal-delete-evidence.md`, `terminal-delete-final-pg.log`,
`food-cancellation-evidence.md`, `food-cancellation-final-pg.log`,
`food-cancellation-targeted-pg.log`, `food-cancellation-contract-check.log`,
and corresponding `*-migration.log`, `*-migration-repeat.log`, `*-typecheck.log`,
`*-lint.log`. No remote objects were deleted; main/remote remain unchanged.

### Owner-scoped prior-analysis discovery and review fixes

`a355311` adds GET `/food-analyses` before the existing exact-id route. All data
queries retain owner filtering and parameterized values. Keyset pagination uses
PostgreSQL timestamp text (microseconds retained) plus UUID and bounded page sizes;
confirmed-diary filtering happens before pagination. Tombstones remain discoverable
for independent photo cleanup but have no dishName/full result/storage keys.
`6bc9292` adds on-demand paginated UI with same-cursor retry and owner remount guards.

Initial scoped gates were API **6/6 actual PG**, food UI **46/46**. Independent
review found two P2 issues, fixed before this checkpoint:

- `74a20d7`: cursor offsets beyond PostgreSQL's supported range passed Date.parse
  and caused22009/500. Explicit offset bounds now reject malformed cursors422 while
  preserving microsecond text. API **7/7 actual PG**, backend typecheck/scoped lint
  PASS; independent reviewer reran only the new offset test **1/1 PG PASS** with
  six other tests intentionally skipped.
- `f360290`: current-result deletion could leave a rendered history title or let an
  in-flight list response restore it. Parent owner-scoped monotone deletion state
  now overlays every history render; confirmed IDs suppress stale notConfirmed
  rows after confirmation. Cursor continuation is preserved. Three regressions
  reproduced the old behavior before the fix; food UI **49/49**, web typecheck/
  scoped lint PASS. Independent reviewer reran these **3/3 UI PASS**, with three
  unrelated file tests intentionally skipped.

No concrete P1/P2 remains in the requested route/owner/cursor/tombstone/account-switch/
mutation scope. These are overlapping scoped test counts, not repeated full API/web
suites or proof of runtime acceptance. The previous lack of a list for old unconfirmed/
technicalError analyses is closed locally. Never-analyzed upload cleanup, deletion
while provider submission may have occurred, and pre-ID unknown goodwill remain
outside this completed scope; external-provider deletion is not implemented or claimed.

Real storage round trip/deletion, GenAPI food, browser/runtime and physical phone
delivery remain **PENDING / NOT ACCEPTED**. Local tests do not establish the24-hour
physical-deletion SLA. Main/remote remained unchanged throughout this review.

### Earlier scoped checkpoints

New scoped verification integrated into `fa13d8d`:

| Package | Behavior and evidence | Limit |
| --- | --- | --- |
| Food UI `f231fed` | Account-switch fence; food **33/33**, web typecheck/scoped lint PASS | No new real browser/GenAPI acceptance |
| Push `e226448` + `156a138` | Midnight catch-up and separate scheduled occurrence; actual PostgreSQL **9/9** PASS | Scheduler/persistence proof, no physical phone delivery |
| Prepared replay `01832ac` | Saved immutable request payload/hash survives changed profile/context; current consent and attempt locking retained; submitting/ambiguous never resubmitted or refunded; targeted **14/14** in three suites, including actual PostgreSQL **9/9**; worker typecheck/scoped lint PASS | Provider/storage were stubbed; no remote restart/user-path acceptance |

Prepared-replay regressions first reproduced three failures on the old code
(food profile mutation and chat with current consent present/absent). After the
fix, the saved snapshot/hash remains unchanged; missing current chat consent
blocks the provider and settles the known-unsent operation once. Additional
submitting/ambiguous cases preserve reservation without resubmission. Existing
real PostgreSQL race regressions also pass.

These scoped results overlap earlier suites. Do not add their counts to create
a new full-worker total or claim a new full API/UI/worker run on the merged head.
Terminal photo retention is now implemented locally in `ea4525f`, as recorded
below; review fix `3531480` is locally independently verified. Real S3/runtime
acceptance is still pending. Main and remote
remain unchanged.

### Terminal-photo retention — `ea4525f`, locally reviewed with `3531480`

Migration0015 adds immutable `food_analyses.terminal_at`. New terminal transitions
capture database time; later edits cannot extend retention. Historical backfill
uses `analyzed_at` or terminal confirmation/refund ledger time only; missing
evidence remains NULL and is skipped with a count, not an invented timestamp.

The durable PostgreSQL cleanup queue captures immutable original/staging keys,
one job per image and reclaimable five-minute leases. Eligibility requires actual
associated analyses all terminal for 30 days and upload/creation at least 600
seconds old. Pending/outcomeUnknown, recently terminal, never-analyzed and unknown
terminal times are excluded. State is checked again under the image row lock.
Logical deletion blocks reuse before dispatch; final deleted status follows both
S3 deletions. Partial failures retry after one minute; expired leases allow safe
replay. Upload completion holds the same image lock through its final writes so
an old request cannot recreate the object. Ledger, receipt, analysis results and
confirmed consumption are preserved. Runner batches up to 20, runs only with
configured storage, prevents overlap and drains before database shutdown.

Scoped verification: **12/12 PASS** = 7 actual-PostgreSQL retention cases,
3 runner lifecycle cases and 2 existing actual-PG food lifecycle regressions.
Backend build, worker typecheck and scoped lint PASS; actual `migrate.ts` and
repeat invocation PASS on the separate local verification database. Unique test
schemas use actual migrations; S3 transport/deletion is stubbed. No live object
deletions, remote deployment or restart occurred.

Evidence: backend worktree
`work/gerbi-backend-verification/food-retention-evidence.md`; logs
`retention-final-tests.log`, `retention-backend-build.log`,
`retention-worker-typecheck.log`, `retention-lint.log`, `retention-migration.log`,
`retention-migration-repeat.log` in that directory. The follow-up below closes the local review finding;
these results still do not establish real S3/runtime acceptance. Voluntary user-requested
photo/analysis deletion was absent at that historical checkpoint (current implementation above); no new retention period was set for
never-analyzed uploads. Real S3/provider/browser/phone/runtime gates remain pending.

### Closed review finding — `3531480`

P2: stale invalid HEAD metadata/body validation could overwrite a newer
`available` or retention-`deleted` image with `quarantined`, preventing cleanup.
Four actual-PG barrier cases reproduced the state corruption on `ea4525f` while
the previous seven retention cases passed. Both quarantine UPDATEs now require
`status='pendingUpload' AND deleted_at IS NULL`; PostgreSQL rechecks the predicate
after concurrent writers. The old request still reports validation failure,
without overwriting successful completion or a deletion tombstone.

Backend verification: eleven retention plus two existing food lifecycle cases
**13/13 PASS**, backend typecheck and scoped lint PASS. Independent reviewer
reran **4/4 actual-PG cases PASS**, closing P2. Tests preserve exact image
metadata/timestamps and analyzed results and exercise synthetic original/staging
cleanup after 30 days. No live S3 operation or remote restart occurred. Logs in
the backend verification directory: `stale-invalid-upload-red.log`,
`stale-invalid-upload-green.log`, `stale-invalid-upload-typecheck.log`,
`stale-invalid-upload-lint.log`. Counts are scoped, not an aggregate worker run.

The earlier policy-only checkpoint `e1472a7` recorded owner authorization for
proven-unsent full cancellation refund; implementation and local independent
review are now recorded at the top of this document. Missing provider ID alone
remains insufficient; possibly submitted/accepted/ambiguous states remain excluded.
Pre-ID unknown goodwill/refund policy remains owner TBD. Real storage/provider/
browser/phone/runtime gates remain pending.

Earlier recorded gates: API **92/92**, worker **44/44**, including actual PostgreSQL
lifecycle/concurrency checks; provider-prompt **15/15**; food UI **24/24** on
`d52eb9f`. These are the proven scoped results carried into integrated head
`1ffd048`, not a fresh combined suite invocation. Real storage upload/download,
GenAPI food analysis, new browser/runtime journey and physical phone delivery
remain **PENDING / NOT ACCEPTED**.

Subsequent food UI checkpoint `cd48570` shows `matches`, `doesNotMatch`, `mixed`
and `insufficientData` explicitly and preserves exact server `missingData`
entries. When composition changes, the old assessment/missing-data list is
hidden behind the retained stale-assessment guard. Food **29/29**, web typecheck
and scoped lint PASS. This updates the earlier 24-test food checkpoint; it does
not establish real GenAPI output quality or browser/runtime acceptance.

Latest live root inspection of `5.42.126.71`:

- Host: **1 CPU / 2 GB RAM**.
- API containers for `atlas-gerbi-marathon` and `atlas-v01` report
  `State.OOMKilled=true`. The two diagnosed worker exits have `OOMKilled=false`
  and distinct causes documented below; they must not be attributed to API OOM.
- Only **unused Docker build cache** was removed. Docker reported **4.721 GB**
  reclaimed; `df` then reported **4.2 GB free / 85% used**. The same **24 running
  containers** remained; no active-container change was part of this cleanup.
- Available memory was about **510 MiB**, swap about **1.5 GiB used**. Reclaimed
  disk does not prove adequate RAM headroom or recovery of failed services.

Earlier SSH-no-banner/server-down reports and the 656 MB disk snapshot are
historical. The host can now be inspected, but this is not evidence that all
old stands are healthy. Baseline runtime, real-provider, storage, browser and
phone gates still require the actual isolated environment after capacity and
service issues are resolved. No new deployment is claimed here.

## Worker exit diagnosis and local fixes — `ca3d612`

Read-only server evidence identifies two distinct exit-1 failures. No restart,
deployment or remote environment change was made during this diagnosis.

- `atlas-gerbi-marathon-worker-1`: unhandled `getaddrinfo EAI_AGAIN postgres`
  rejection from `OutboxPublisherService.publish`/pg-pool. Both initial and
  periodic publication promises lacked rejection handling. This proves the
  crash path, not why DNS failed. The local fix allows only one scheduled
  publication at a time, catches failures with a fixed safe event/allowlisted
  error code, retries next tick, marks durable outbox published only after queue
  acceptance, retains the same BullMQ job ID and clears/drains work on shutdown.
- `atlas-daily-coach-worker-1`: `AI_PROVIDER=fake` with empty optional
  `GENAPI_API_KEY`, `GENAPI_BASE_URL`, `GENAPI_MODEL` from Compose failed Zod
  validation; optional accepts undefined, not an empty string. The local fix
  normalizes exactly empty optional chat fields, retaining rejection of invalid
  nonempty values and required real GenAPI configuration. It also removes an
  early return that skipped independent real food/push validation under fake
  chat. No real-provider key or silent fallback was introduced to fix fake mode.

Both workers reported `OOMKilled=false`. Before the publisher fix, 3/7 targeted
regressions failed; a separate red configuration test demonstrated the bypass.
After the fixes: full worker **12 suites / 52 tests PASS**, including actual
PostgreSQL recovery/lifecycle cases; backend/worker typecheck and scoped lint
**PASS**. These replace the earlier 44-test worker count for this checkpoint,
without implying a fresh API/UI rerun.

Privacy-safe source report: backend worktree
`work/gerbi-backend-verification/worker-exit-root-cause.md`; corresponding logs
`outbox-red.log`, `worker-config-red.log`, `worker-independent-config-red.log`,
`worker-exit-fixes-all-tests.log`, `worker-exit-fixes-typecheck.log`,
`worker-exit-fixes-backend-typecheck.log`, `worker-exit-fixes-lint.log`.
No raw server application content or secrets are included in this document.

**Remote boundary:** corrected code has not been deployed and the workers have
not been restarted. The deployed defects remain; actual DNS outage recovery,
worker startup and user journeys still need remote verification. Capacity and
real storage/GenAPI/browser/phone gates remain pending.

## Historical implementation and verification record

The sections below retain evidence from earlier commits. Their resource numbers,
FAIL/SKIPPED outcomes and healthy observations describe those points in time.
Use the current checkpoint above for current operational decisions.

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


## Historical isolated runtime preparation and blocker

After source commit `aee4755`, `/opt/projects/ai-hudeetor-gerbi-expanded` was fast-forwarded from `56885d2` to `aee4755` using a Git bundle. No expanded project containers were started and no remote build was run.

The existing `atlas-gerbi-expanded-api:latest` image (ID `sha256:f381d484eadbe3f57e0dee60f5daa07b3fb46447f9ab6ea1a610064be6194d02`) contains Linux Node 24.18.0 and dependencies. Its lockfile SHA256 `c4fff4ce645c0e80a33578b83e23d4afd5f674b77b0ca43d639d70371169e372` and backend/web package hashes exactly match current source. Linux `sharp` and `argon2` load successfully. This proves dependency compatibility, not current source deployment. Read-only diagnostic containers exited and were removed.

API/worker/web builds also passed locally using Node 24.19.0 and pnpm 11.19.0 (within repository engine ranges); web uses `/api/v1`. Platform-neutral built JS and `.next` archive is 1.9MB compressed, about 10MB unpacked, excludes local native dependencies. Artifact SHA256: `022aa2a43c8249394109bf44c4827d1a3a27c7e3d44371133e72965307f827ff`. Local path: `work/gerbi-backend-verification/runtime-aee4755-artifacts.tar.gz`.

At that earlier inspection, runtime was blocked as follows (resource values and health below are superseded by the current checkpoint):

- Server disk: **656MB free / 29GB, 98% used** after Docker unpacked its existing image for inspection. Available RAM about **476MB / 1.97GB**, with **1.37GB swap used**. A safe allowance for isolated PostgreSQL, object storage and application services has not been established. A full build was intentionally not launched. Suggested operational headroom before proceeding: at least 2GB free disk and 1GB available RAM, with compilation kept off-host; these are conservative planning allowances, not measured application minima.
- Neither pinned MinIO nor mc image is cached. Read-only manifest inspection of `minio/minio:RELEASE.2025-04-22T22-12-26Z` failed with `denied: requested access to the resource is denied / unauthorized: authentication required` using the server's current Docker access. Consequently expanded/unpacked image footprint is unknown. No replacement storage, mock upload, or image-source change was introduced.
- Other projects were preserved; `atlas-v01` and `atlas-ui-001` were observed healthy in that historical snapshot only. No cache, image or volume pruning had been performed at that point. The later targeted unused-build-cache cleanup and current OOM observations are recorded above.

Raw local evidence: `work/gerbi-backend-verification/runtime-capacity.log` plus `{web,api,worker}-build.log`. Server manifest error: `/opt/projects/ai-hudeetor-gerbi-expanded-runtime/minio-manifest-error.log`. There is no new browser URL or real GenAPI photo acceptance from this checkpoint.


## Subsequent review fixes

Both GenAPI chat and food-photo system prompts now explicitly forbid attributing weight gain/loss to a food or meal based on correlations or individual changes. They require stating insufficient or temporally incomparable evidence. Targeted tests inspect the actual serialized provider messages with confirmed meal/weight context and synthetic photo submission: **15/15 passed**, scoped lint PASS. This verifies prompt delivery, not generated-model behavior.

The earlier `aee4755` runtime artifact is now **stale** after these review fixes and subsequent frontend integration. It must not be presented as the final integrated build.

MinIO access diagnosis was narrowed through anonymous manifest reads: the exact release tags exist in official Quay and return Linux amd64 manifests without credentials. [Official MinIO container instructions](https://min.io/docs/minio/container/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html) identify `quay.io/minio/minio`. DockerHub denial does not establish missing owner credentials or a nonexistent release. Compose now pins the same releases on official Quay, with explicit `linux/amd64` matching the test server:

- MinIO: `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:3f97c5651cb6662b880c787a232b6b34fec8d8922e08d6617b25d241a21164bb` (manifest layers 61.0MB compressed).
- mc: `quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z@sha256:2582c2f48b1e31545143ba5285c67d7b38c8b8f6912142d0630686dc7aaac28b` (28.2MB compressed).

No images were pulled. These compressed sizes do not establish unpacked/runtime disk requirements. The active deployment blocker is resource headroom; owner registry credentials are not required by the verified public manifests.
