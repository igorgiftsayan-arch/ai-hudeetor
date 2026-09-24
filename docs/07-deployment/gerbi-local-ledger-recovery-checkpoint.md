# GERBI local ledger/recovery checkpoint — 2026-09-24

## Current checkpoint: integrated base `1ffd048`, worker fixes `ca3d612`

The user approved continuing local development while increasing server RAM and
storage. Remote capacity is pending. This update changes documentation only;
product scope and `main` are unchanged. Local progress does not establish remote
runtime acceptance.

Recorded gates: API **92/92**, worker **44/44**, including actual PostgreSQL
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
