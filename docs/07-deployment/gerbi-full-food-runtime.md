# Gerbi full food runtime — 2026-09-25

## Environment and boundaries

One active stack: atlas-gerbi-expanded on the existing2GB server; old Daily Coach
containers stopped, all historical volumes preserved. Main unchanged. API and
worker chat=fake, food=genapi, PUSH_ENABLED=false. Web969dd85, API backendd9ba57c;
worker/base applicationda9e837. See constrained-runtime provenance for dependency
images, private MinIO locally built upstream binaries and resource caps.

Public HTTP Safari lacks crypto.subtle. The failed preflight created no upload,
reservation or provider request. Desktop acceptance used an SSH forward bound only
127.0.0.1:13114 to server127.0.0.1:3114, with temporary API_CORS_ORIGIN and
S3_PUBLIC_ENDPOINT=http://localhost:13114. Same gateway, database, storage and
provider; no mock or weaker checksum. The temporary origin must be restored after
browser acceptance. This is not physical-phone HTTPS or push acceptance.

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
  Independent23/23 targeted PASS. Live regression uses the second authorized
  operation; final browser result is recorded below when complete.

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

## Core acceptance in progress

Existing API created a clearly synthetic25–26Sep2026 marathon/team and assigned
the same synthetic owner captain. Bootstrap was temporarily allowlisted only for
that owner, then verified disabled with empty allowlist. Current-day captain task
created through existing API. Browser weight/wellness/task reload checks remain
pending; no yesterday delta will be claimed without a supported dated entry.
