# Gerbi full food runtime — 2026-09-25

## Environment and boundaries

One active stack: atlas-gerbi-expanded on the existing2GB server; old Daily Coach
containers stopped, all historical volumes preserved. Main unchanged. API and
worker chat=genapi, food=genapi, PUSH_ENABLED=false. API/worker backend f952948;
worker composition41b80f6, API compositionda9e837. Current web update is recorded below. See constrained-runtime provenance for dependency
images, private MinIO locally built upstream binaries and resource caps.

Public HTTP Safari lacks crypto.subtle. The failed preflight created no upload,
reservation or provider request. Desktop acceptance used an SSH forward bound only
127.0.0.1:13114 to server127.0.0.1:3114, with temporary API_CORS_ORIGIN and
S3_PUBLIC_ENDPOINT=http://localhost:13114. Same gateway, database, storage and
provider; no mock or weaker checksum. The public origin was restored after browser acceptance and the exact owned SSH
process34180 was stopped; port13114 no longer listens. This is not physical-phone HTTPS or push acceptance.

## Defects found by the real path

- Onboarding1204907 replaced local-only false personaReady with actual profile,
  persona and completion calls. Independent6/6 tests, build/typecheck/lint PASS;
  actual DBcompleted /AsiaIrkutsk/gentleFriend, exactly one100-token starter grant.
- Preview4a997e2 keeps selected photo mounted while accepting consent. Independent
  25/25 targeted PASS; live browser preview and5-token managed price verified.
- Signingd9ba57c fixes the required checksum metadata header being hoisted into
  the query but also sent unsigned. Actual2653194byte syntheticPNG with exact
  browser metadata header reproduced400, then passed200 with the fix; anonymous
  GET403 retained. RealSDK regression2red→3/3green, APItypecheck/lint and independent
  3/3 review PASS. Original failed pendingUpload intent retained; no paid call then.
- Correction969dd85 retains authoritative PATCH result through confirmation.
  Independent23/23 targeted PASS. Live second-operation correction→confirm→full reload PASS; corrected composition
  retained and stale suitability suppressed. Second photo/result/one consumption
  preserved. No third food generation.

## Exactly two authorized full-app provider operations

Both used the unchanged synthetic fixture, configured gpt-4o-2024-08-06 and actual
upload→completion→reservation→worker→provider→structured result path. No synthetic
weight/goal/diet restriction was invented. First result recognized chicken,
lettuce, tomato and cucumber, and reported insufficient profile data honestly.
No additional standalone provider GET or paid request was made for these checks.

| Operation | Provider ID | Final receipt | Reservation | Confirmation | Refund |
| --- | --- | --- | --- | --- | --- |
| ec545d0e-6037-401b-b582-14c475d65d9d |54129307|completed|1 (-5)|1 (0)|0|
| ad3d3340-96af-4c66-b5c0-c2bb80699775 |54130142|completed|1 (-5)|1 (0)|0|

Wallet100→95→90. Two food analyses total. Managed price5/version1. Provider usage
or monetary cost was not returned by this application evidence; do not estimate.

First request hash94d3a75e075c75c3acbc81dfe78a68c773f9b25507a7bf1ac2e2be7a24c03be1.
Graceful restart began while pending but original worker finished at18:43:37Z;
new worker started18:44:00Z. This proves terminal persistence/no duplicate effect,
not interrupted-pending recovery.

Second request hash416f2afa89d3368e98d9f98fccad14f4410670ed1d22a37fe19d5fbf71c74162.
Owner authorized one immediate stop of exactly expanded worker after durable
accepted ID. Read-only DB snapshot WHILE STOPPED still showed processing/accepted,
ID54130142 and the same hash. Worker restarted18:54:21Z; normal stale-operation
reconciliation completed18:56:25Z with that sameID/hash. Outbox has one original
request and one reconciliation event. No DB status/time/ledger rewrite occurred.
Each operation still has exactly one reservation/confirmation and zero refunds.

## First result and photo deletion

Browser corrected and confirmed once at25Sep02:30Asia/Irkutsk, then edited the
consumption composition. Actual DB persisted one row and the corrected items.
Photo tombstone and result-content deletion preserved the consumption and ledger;
only the later explicit diary deletion removed the active consumption. Receipt
financial identity/hash/providerID remain; request/result/correction content erased.

Physical photo purge was honestly pending until normal600s upload eligibility.
Then durable cleanup completed with attempts1/errornull, and authenticated MinIO
HEAD returned404 for BOTH original and staging keys. No manual timestamp change or
external-provider deletion claim. The earlier failed never-analyzed pending upload
is retained; no retention policy was invented for it.

## Core acceptance completed (bounded synthetic checks)

Existing API created a clearly synthetic25–26Sep2026 marathon/team and assigned
the same synthetic owner captain. Bootstrap was temporarily allowlisted only for
that owner, then verified disabled with empty allowlist. Current-day captain task
created through existing API. First fixture captain task completed in UI and persisted; team Tasks view reflected it.
First-day wellness correctly refused yesterday outside the marathon period.
Owner then authorized a second clearly synthetic24–26Sep fixture through the same
create API (no date update endpoint exists); old fixture/task retained. Temporary
allowlist again restored false/empty. UI yesterday wellness saved4/8, survived
reload, and team displayed4. Current fixture name: Synthetic yesterday wellness
acceptance, team Synthetic wellness team. These are test dates, not launch dates.

Daily weight first80.50 succeeded; edit80.4 exposed binary-float multiplication
validation. Fix141b784 uses exact decimal round-trip; isolated realPG7/7 plus
APItypecheck/lint and independent7/7 review PASS. Real browser edit and full reload
then displayed80.4 with exactly one current history row for25Sep. No yesterday
weight delta is claimed. No paid AI call was used for these core checks.

Actual team API recursive inspection found no raw weightKg/currentWeightKg/
startWeightKg/targetWeightKg, chat/messages, memory or cumulativeTotals fields.
A separate synthetic account was registered through the API (no starter grant or
AI): foreign analysis/detail-deletion-state each404, analysis list and consumption
list200 with zero items. Owner food data and wallet remained unchanged.

Final notifications UI8a0e72d shows disabled unavailable state and sender-not-
configured explanation; no spinner/permission prompt. Independent9/9 review,
production build/typecheck/lint passed. This is truthful unavailability, not delivery.

## Final deployed components and operational cleanup

- Web8a0e72d BuildID0-gRA0yVTCt9m3OtlWFXN, artifact SHA256
  4e7ea5a4c96c21fc372278a2e01698cbf038159d3fda8ec8014dfec5532fe132.
- API backend141b784 compiled Node24.18.0/pnpm11.14.0, artifact SHA256
  3dd116c4e6fe6ea2a770c04c5e64ad45caedbfe567be8d56c9f380bbc515f0a0.
- API composition and worker/base applicationda9e837; only API backend and web
  read-only mounts changed after initial cutover. Dependency images unchanged.
- Running API origin and S3 signer restored http://5.42.126.71:3114;
  bootstrap=false, allowlist empty. Own localhost SSH tunnel closed.
- Final public login/APIready200. Exactly7expanded services healthy, OOMKilled=false,
  automatic restartCount0; intentional graceful/crash stop/start separately recorded.
- Snapshot availableRAM1024MiB/1967, disk3882MiB; final observed RSS about487MiB.
  Resource caps unchanged. This is bounded acceptance, not a concurrency/load test.
- Server root-only compose-current.sh preserves base+expanded+artifact, current
  web-revision/api-revision/native-chat-revision and disabled bootstrap overlays. It deliberately omits
  desktop-origin.yaml. Config validates quietly; operators must use current mounts.
  Old artifacts, old stack volumes and backup are preserved; no broad prune/delete.

## Remaining limits

Public HTTP Safari cannot prepare photoSHA256; the full food desktop proof used
localhost secure context through the real SSH tunnel. A real HTTPS hostname and
phone browser acceptance are still required for participant use and Web Push.
Current chat and food use real GenAPI; one chat and two food generations are
observed. No broad real-model quality or interrupted-chat recovery claim.
Pre-ID unknown/possibly-sent goodwill-refund policy remains owner-dependent; known-
unsent cancellation is a different approved rule. No automatic refund promise is
made for ambiguous provider submission. Prior local recovery/cancellation tests
remain separate from these two observed runtime operations.

## Real chat and recovery metadata — 2026-09-25

Native transport41b80f6 persists exact messages/is_sync body before submission,
omits proxy-only model selector, retains proxy behavior. Independent16/16 adapter
and reconciliation tests plus actualPG5/5 receipt subset passed.

- First operation08707198-5a80-4621-b9e4-6e323343d1c7 was rejected locally:
  safetyRejected, no provider POST or ID. API consent requiredtest-v1 while worker
  defaultedv1. Its one reservation(-1)/refund(+1) remains unchanged. Configbf8d050
  now gives API and worker the same explicit version; actualenv bothtest-v1.
  Rendered default and custom-version equality plus independent review passed.
- One separately authorized fresh operation10cd223a-d773-47b0-8d37-7be5edd4cd5b
  succeeded with provider54133216. Receipt completed, hash
  ccdf9061fb74d235146e7896790b1e74f8012f12019d91bfa38253bac435a69b.
  One reservation(-1), one confirmation, no refund; wallet90→89. Browser reply
  and full reload passed. Two user messages (local rejection + real success),
  one assistant. No further provider POST and no third food generation.
- One read-only GET of that existing ID saved a root-only600 envelope. Observed
  networkgrok-4-5, parameters.modelgrok-4.5, result.modelx-ai/grok-4.5. Fixf952948
  adds only that exact alias; ID/network/ordered messages/time guards retained.
  Regression red→green9/9 incl six correlation negatives; independent9/9 passed.
  Saved actual envelope passed the fixed production client offline against the
  persisted request. Returned usage546input/177output/723total; no monetary cost
  inference. This is envelope compatibility, not real interrupted-chat recovery.
- History128bccd exposes owner-bound input-message operation summaries and
  ledger-derived refundStatus, including GEToperation. ActualPG5/5 independently
  passed; APItypecheck/build/lint/generatedcontracts passed. No refund inferred
  merely from technicalError. Final web8694435 re-login/fullreload PASS: first failed/refunded message and
  second real assistant answer both persist; no new POST.

Backend artifactf952948 SHA256
70c78bda0f6e5c67d73e8d24f8fab4c3a2bd85c2ccf54c581980047f54469e85
contains compiled backend only, built locally Node24.18; API/worker mount it
read-only using previously verified Linux dependencies. Worker composition
artifact41b80f6 SHA2564e1f5d5024d43b4e52f04656df6c6984e27cfbc7db963e3a17cc2296fa6cb9ac.

Final web8694435 artifact SHA256
a46f4551f633b8394596124426c9f2b7c1dce41dee9725135ca0e59ac67ebafd,
BuildIDfbNdEso3sB3cAzUkZZYpG. Superseded e097e2a archive was staged but never
activated; its stale-context review finding was fixed before deployment.
After current component updates: exactly7healthy services, OOMfalse/restarts0;
API256/worker256/web192/Postgres128/Redis64/MinIO256/gateway32MiB caps unchanged.
Hostavailable972MiB, disk3863MiB; RSS approximately455MiB, MinIO229MiB of256.
Public login200. Bootstrap remainsfalse, publicorigin retained, no localhosttunnel.

Next bounded gates: focused actualPG chat prepared-context inclusion/exclusion
for corrected confirmed food; controlled known-unsent API cancellation acceptance
before worker submission (requires planned pause/readiness). These are not claimed
as completed by the chat/history checkpoint.
