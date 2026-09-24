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


## Isolated runtime preparation and blocker

After source commit `aee4755`, `/opt/projects/ai-hudeetor-gerbi-expanded` was fast-forwarded from `56885d2` to `aee4755` using a Git bundle. No expanded project containers were started and no remote build was run.

The existing `atlas-gerbi-expanded-api:latest` image (ID `sha256:f381d484eadbe3f57e0dee60f5daa07b3fb46447f9ab6ea1a610064be6194d02`) contains Linux Node 24.18.0 and dependencies. Its lockfile SHA256 `c4fff4ce645c0e80a33578b83e23d4afd5f674b77b0ca43d639d70371169e372` and backend/web package hashes exactly match current source. Linux `sharp` and `argon2` load successfully. This proves dependency compatibility, not current source deployment. Read-only diagnostic containers exited and were removed.

API/worker/web builds also passed locally using Node 24.19.0 and pnpm 11.19.0 (within repository engine ranges); web uses `/api/v1`. Platform-neutral built JS and `.next` archive is 1.9MB compressed, about 10MB unpacked, excludes local native dependencies. Artifact SHA256: `022aa2a43c8249394109bf44c4827d1a3a27c7e3d44371133e72965307f827ff`. Local path: `work/gerbi-backend-verification/runtime-aee4755-artifacts.tar.gz`.

Runtime remains blocked:

- Server disk: **656MB free / 29GB, 98% used** after Docker unpacked its existing image for inspection. Available RAM about **476MB / 1.97GB**, with **1.37GB swap used**. A safe allowance for isolated PostgreSQL, object storage and application services has not been established. A full build was intentionally not launched. Suggested operational headroom before proceeding: at least 2GB free disk and 1GB available RAM, with compilation kept off-host; these are conservative planning allowances, not measured application minima.
- Neither pinned MinIO nor mc image is cached. Read-only manifest inspection of `minio/minio:RELEASE.2025-04-22T22-12-26Z` failed with `denied: requested access to the resource is denied / unauthorized: authentication required` using the server's current Docker access. Consequently expanded/unpacked image footprint is unknown. No replacement storage, mock upload, or image-source change was introduced.
- Other projects were preserved; `atlas-v01` and `atlas-ui-001` remained healthy in the final snapshot. No cache, image or volume pruning was performed.

Raw local evidence: `work/gerbi-backend-verification/runtime-capacity.log` plus `{web,api,worker}-build.log`. Server manifest error: `/opt/projects/ai-hudeetor-gerbi-expanded-runtime/minio-manifest-error.log`. There is no new browser URL or real GenAPI photo acceptance from this checkpoint.


## Subsequent review fixes

Both GenAPI chat and food-photo system prompts now explicitly forbid attributing weight gain/loss to a food or meal based on correlations or individual changes. They require stating insufficient or temporally incomparable evidence. Targeted tests inspect the actual serialized provider messages with confirmed meal/weight context and synthetic photo submission: **15/15 passed**, scoped lint PASS. This verifies prompt delivery, not generated-model behavior.

The earlier `aee4755` runtime artifact is now **stale** after these review fixes and subsequent frontend integration. It must not be presented as the final integrated build.

MinIO access diagnosis was narrowed through anonymous manifest reads: the exact release tags exist in official Quay and return Linux amd64 manifests without credentials. [Official MinIO container instructions](https://min.io/docs/minio/container/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html) identify `quay.io/minio/minio`. DockerHub denial does not establish missing owner credentials or a nonexistent release. Compose now pins the same releases on official Quay, with explicit `linux/amd64` matching the test server:

- MinIO: `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:3f97c5651cb6662b880c787a232b6b34fec8d8922e08d6617b25d241a21164bb` (manifest layers 61.0MB compressed).
- mc: `quay.io/minio/mc:RELEASE.2025-04-16T18-13-26Z@sha256:2582c2f48b1e31545143ba5285c67d7b38c8b8f6912142d0630686dc7aaac28b` (28.2MB compressed).

No images were pulled. These compressed sizes do not establish unpacked/runtime disk requirements. The active deployment blocker is resource headroom; owner registry credentials are not required by the verified public manifests.
