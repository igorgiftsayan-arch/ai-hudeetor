# Rebody: full release acceptance

Status: IN PROGRESS. Publication alone is not acceptance.

Current production: `bef0680`, deployed successfully on 2026-10-01. See the
dated production acceptance section below for deployed image digests and current
browser evidence. Build and integration checkpoints are historical evidence,
not statements that deployment is still pending.

Server image build on 2026-10-01 completed for release `2b274b6` in the
separate `/opt/projects/rebody38-release-build` checkout, with legal v2 build
versions. At that build-only checkpoint production containers/tags were not replaced:

- API `sha256:5941a7bac91c7205a9c472daae842fee1ba31558d3f8e726bd901140112069a2`
- Worker `sha256:bc4b8ddbc0cb3e6bdab138904bedbbfd031ac63b5fcf7ad78b0bd894fda5f676`
- Web `sha256:ace46ee00bdb94e5ba49e38fd21deb544e0ed0b9825cfdd3f4c54e0e87a8d865`

Superseding web artifact after UI-only fix `29be3df`, integrated release
`3a54e16`: `rebody38-release-web:3a54e16`, image
`sha256:ed564a9ffd2bdd0a72e168845dc46f901be6c3c88a832994d6d4a60e47c1851e`.
Server build exited 0. The badge now marks only known fake operations as test
AI; unknown/GenAPI uses a neutral error warning. Frontend reports 64/64 tests,
typecheck and lint passing. API/worker code is unchanged from the images above.

## Owner scope update — 2026-10-01

Latest instruction supersedes the backup deferral below: the owner requested
S3 backups. Destination and scoped credentials are requested; implementation
preparation can proceed, but no unrelated project storage may be used.

SMTP update: with the newly provided password, TLS465 authentication passed.
One synthetic service message sent from help@rebody38.ru to the same mailbox
was accepted by SMTP and found through read-only IMAP. SMTP fields and a
distinct persistent email-payload secret were saved atomically in the existing
root-only production runtime env (mode600), outside Git. The later production
deployment loaded these settings. Real application verification/reset flows remain unverified.

The owner initially deferred backups, subsequently requested S3, and clarified
that missing S3 access must not stop all other release work. Off-host backup,
restore drill and RPO/RTO remain incomplete, not passed, but do not block
deployment or verification of the other work. Loss of the
production host may cause unrecoverable data loss; no durability promise is
introduced. Existing backups are not deleted. Provider confirmation is an
owner decision, not independent proof of specific countries, retention or
training exclusions that were not supplied; public text must not invent them.

Historical SMTP failure: the earlier mailbox password returned 535; no message
was submitted in that attempt. This was resolved by the subsequent successful
authentication and same-mailbox delivery check recorded above.

Coordinator verification on 2026-10-01, integrated revision
`46bf4a89d35d6075df3716adc88de2b86bdcb7cc`: full monorepo build passed with
synthetic legal build versions; contracts generation/drift passed; web tests
12 files / 61 tests passed. This is a local build/test artifact, not a
production-ready image with final document versions.

Backend full database regression completed on 2026-10-01: 18/18 API suites,
97/97 tests, zero skipped/failed. PostgreSQL 17, migrations applied twice
(13 metadata entries). Application image digest:
`sha256:cbe71b01cc80bb3f42b348e9aa561271d389fd2a2b4b6078d937676708eb0473`,
source `5e8753b`, with test-only assertion update `7ee0395` mounted read-only.
The initial 96/97 result was an outdated exact-object assertion missing
`emailVerified:false`; production code was unchanged. Disposable DB/network
were removed after verification. This supersedes the local skipped-test gap.

## Integration checkpoints

- Integrated release candidate: `7d9df89`, including backend code
  `5e8753bad32e7c36424a9a599088fd6cef734ea4` and frontend `4e0d29c`.
- Frontend acceptance report for `5728c420c7445e504bea8eff301a8d7637173fde`
  (same backend update): root lint/typecheck, contracts/client drift and web
  tests 61/61 passed. Earlier mocked Chromium checks: 3/3. These are not
  deployed/public email or real-provider evidence.
- Backend reports isolated PostgreSQL identity 6/6 and delivery worker 4/4
  against `5e8753b`, with migrations applied twice. Final backend evidence is
  committed in `6b7902f` and integrated into release: API 55 passed (42 other
  DB-dependent tests skipped locally), worker 34 passed (4 DB tests skipped
  locally and separately covered by the isolated delivery suite). These
  results are not proof of public SMTP delivery or all DB regression coverage.
- Backend final build, lint/typecheck and contract drift passed. The earlier
  command exit 1 was missing legal build configuration, not a failing test.
- Reviewed new configuration diff: production SMTP enforced, public email-link
  origin HTTPS enforced, STARTTLS required when not using implicit TLS, and
  new secret/consent/SMTP values forwarded into Compose. Configuration tests
  passed in backend; production provisioning was completed in the later deployment.

## Required evidence

| Requirement | Acceptance evidence | Current boundary |
| --- | --- | --- |
| Email ownership | Public signup delivers real email; fragment token explicitly confirmed; session reports verified | Implemented, deployed and isolated-tested; SMTP delivery confirmed independently; public signup flow pending |
| Recovery | Real reset email; one-use token expires after 30 minutes; new password works; old password and sessions rejected | Implemented; database one-use/session-revocation tests passed; public real-email flow pending |
| Existing accounts | Login, onboarding and weight remain available; no automatic verified backfill; resend available | Additive migration and regression tests passed; production migration applied twice, 13 metadata entries; existing-user public journey pending |
| Real AI | Verified synthetic user explicitly consents, receives GenAPI response in browser; ledger confirms one charge on idempotent retry | Model listing and one direct synthetic generation returned 200; application journey remains unverified |
| AI failures | Integration evidence for technical-error refund and outcomeUnknown without automatic refund/retry | Real PostgreSQL processor suite 3/3 and full worker41/41 passed at d12d9b4; exact one refund for technicalError, no refund/retry for outcomeUnknown, sequential duplicate jobs have no second provider/ledger effect |
| Abuse protection | Enumeration-safe reset responses, resend/reset limits, unverified AI rejected before reservation/outbox, owner isolation | Identity API/database checks passed; final public gateway journey still pending |
| Backup | Owner reinstated S3 backup after the earlier deferral | Tooling implemented and isolated-tested; destination/credentials pending; no upload, restore or measured RPO/RTO |
| Documents | Published claims match actual email, AI provider and backup behavior; consent versions consistent | Legal v2 published with matching configured versions; complete live consent journey pending |
| Public journey | Signup → real email → verification → onboarding → weight/update → real AI → logout/login → recovery, desktop/mobile | Earlier tests cover pre-verification/fake release only |

## Operational boundaries

Pre-deploy configuration audit must verify that Compose explicitly forwards
the new shared email encryption secret, consent version/disclosure, SMTP
settings and public HTTPS link origin. A value in an env file alone is not
proof that the container receives it. Production must not silently select
fake email transport; do not log rendered Compose configuration with secrets.

Contract integration originally found WIP OpenAPI request-email endpoints
declared 200 instead of agreed 202. Corrected backend contract is now integrated;
frontend reports generated-client drift check passing on the corrected revision.

- Do not merge `main`, change stable deployments, or modify unrelated services.
- Do not mark existing accounts verified without evidence of email ownership.
- Never put passwords, API keys, raw email tokens or personal message content in
  this record, Git, logs or screenshots used as acceptance artifacts.
- Token-bearing links use URL fragments, removed by the browser before explicit
  POST; GET must not consume tokens.
- Email validation stores token hashes. Durable delivery needs encrypted payloads
  and removes secret payload after successful delivery.
- SMTP provider configuration: `smtp.jino.ru`, port 465, TLS, full mailbox login;
  see [Jino settings](https://o.jino.ru/help/faq/email-clients/common-settings/).
- The owner supplied the panel error: SMTP is unavailable for this mailbox and
  Jino requires contacting support. The mailbox exists; changing ports does not
  resolve this provisioning restriction. Support request text provided to owner.
- Owner authorized at most 15 paid synthetic GenAPI calls for release testing.
  The coordinator owns the shared counter; delegated tasks must obtain an
  allocation before making paid calls. No paid load tests or real user content.

## Paid smoke ledger

| Slot | Date | Scope | Status |
| --- | --- | --- | --- |
| 1/15 | 2026-10-01 | Direct provider, configured grok-4-5, synthetic one-sentence wellness prompt, max_tokens 128 | HTTP 200, nonempty Russian answer; reported usage 257 input / 147 completion / 404 total |

An ambiguous timeout consumes its slot; never repeat it automatically.
This direct call does not verify application consent, ledger or browser UI.
Provider reported completion usage above requested max_tokens; do not treat
that parameter as a verified billing cap.

## Backup deferred by owner

Future proposed policy, not a requirement for the current owner-approved release: nightly encrypted
logical backup, seven daily copies, RPO at most 24 hours. RTO must be measured
from a real off-host restore drill, including application readiness and data
checks, not inferred from archive creation. Destination credentials and alert
delivery must be available before declaring this requirement complete.

## Completion rule

Record integrated Git revision, deployed image digests, migration count,
dated command/test artifacts and results for every row. A running container,
HTTP 200, provider model listing or passing fake transport test does not prove
the complete user journey. Leave the goal active while any row lacks evidence.

## Provider consent review

Release worker checks `aiProviderProcessing` in `user_consents`, but initial
inspection found no public acceptance flow for that consent. Backend has been
assigned a versioned disclosure/status and explicit authenticated acceptance
contract, with checks before reservation and again before provider execution.
Never insert acceptance directly into the database for real users.

Provider source reviewed 2026-10-01:
[GenAPI offer](https://gen-api.ru/ru/documents), section 4.3 states retention
of requests/content/results up to 24 hours; sections 4.1/4.5 refer to model
rightsholder terms. This does not establish downstream geography or training
rules. Do not promise those properties without separate evidence.

Code review of the current provider payload: conversation message history plus
system context including display name (when supplied), timezone, selected
persona, target/start/current weight and change, last measurement, and up to
12 selected memory facts within a 1,600-code-point context. Account email,
password and cookie are not explicit payload fields. However, message text is
not anonymized: users may include identifiers or sensitive data themselves.
Do not describe this flow as anonymous or claim memory filtering sanitizes
the entire conversation.

Draft disclosure content for final legal reconciliation (not yet published):
«Для ответа сообщения текущего диалога и контекст вашего профиля, веса и
сохранённой памяти передаются в GenAPI (ООО ИНФИМУМ) и используемую модель.
Не отправляйте пароли, документы, медицинские сведения и чужие персональные
данные. AI может ошибаться и не заменяет врача. Вы можете пользоваться
дневником веса без согласия на AI-обработку».
The owner subsequently confirmed the GenAPI processing information for release.
This does not supply unmentioned factual details; do not invent those in the
published disclosure or claim independent legal certification.

## Production deployment and public acceptance — 2026-10-01

This dated section supersedes earlier pending-deployment status. S3 is an
independent unfinished requirement, not a blocker for deploying or checking the
other release work. No off-host backup or measured RPO/RTO is claimed.

Backend deployment receipt confirms production checkout `bef068079fb23b2b91966b789e6b35b2f45bfc4a`,
13 migration metadata rows, migration 0012 applied twice, and six healthy
services with zero restarts. Main, stable, other projects and data volumes were
not changed. Running immutable images:

- API: `sha256:5941a7bac91c7205a9c472daae842fee1ba31558d3f8e726bd901140112069a2`
- Worker: `sha256:bc4b8ddbc0cb3e6bdab138904bedbbfd031ac63b5fcf7ad78b0bd894fda5f676`
- Web: `sha256:ed564a9ffd2bdd0a72e168845dc46f901be6c3c88a832994d6d4a60e47c1851e`

Rollback env and local custom-format dump are in the protected runtime directory;
the dump passed `pg_restore --list`. This is same-host rollback protection only.
Backend receipt confirms published legal v2 pages and worker GenAPI configuration;
no paid provider call was made during deployment.

Coordinator independently observed public login HTTP 200 and readiness response
with PostgreSQL/Redis OK. Live in-app browser checks:

- Fresh tab: registration toggle and reverse toggle work; age, terms and privacy
  checkboxes initially unchecked, submit disabled with empty fields.
- At 393 x 852 viewport, registration DOM content width equals viewport width
  (393 px), with no horizontal document overflow.
- Visible forgotten-password link opens the correct form. A request using an
  intentionally nonexistent `example.invalid` address shows the generic response:
  `Если такой адрес зарегистрирован, мы отправили ссылку для смены пароля.`
  This is only the unknown-account path, not proof of real reset mail delivery.
- A tab open before rollout did not switch registration after reload; fresh tab
  does. Frontend read-only investigation confirms the public bundle contains the
  mode-switch handler and service worker does not cache login/API/static chunks.
  Stale browser state remains a hypothesis, not a proved root cause. No
  speculative fix applied; asset-to-running-image comparison requested.

Real signup is awaiting action-time confirmation to accept the published terms
for the synthetic help mailbox account. App-generated verification/reset mail,
authenticated diary, real AI ledger/consent path and full mobile journey remain
unverified. Paid GenAPI budget remains 1/15 used.

Additional public negative check at 2026-10-01 05:16 UTC: POST to
`/api/v1/password-reset-requests` for the same nonexistent synthetic address,
with an untrusted `Origin`, returned HTTP 403 `ORIGIN_VALIDATION_FAILED`.
This verifies the public origin guard for this route, not all rate-limit,
authenticated CSRF or proxy-IP boundaries. No real email or paid AI call was
triggered by this check.

Public reset request limiter check (same date): running API safe allowlist
inspection confirms registration limiter 10 attempts / 3600 seconds and
`API_TRUST_PROXY_HOPS=1`. Source scopes reset requests by IP plus normalized
email. Eleven sequential requests for a distinct nonexistent `example.invalid`
address returned ten HTTP 202 responses followed by HTTP 429. No real account
was targeted. This verifies enforcement for one IP/email key, not resistance
to distributed or many-address abuse; proxy-chain correctness remains to audit.

Confirmed blocker from proxy-chain audit: host nginx appends visitor IP, then
Docker gateway appends host-side address `172.26.0.1`, while API trusts only one
hop. Read-only lookup of the exact SHA256 reset limiter key for our synthetic
address and `172.26.0.1` returned 11 (matching all eleven public requests);
the alternative loopback key was absent. Thus the application currently groups
visitors by proxy address. Host-level registration/session limits still use
visitor addresses, but application limits can be shared across users.
Fix must include trusted-chain/spoofed-header tests and verification of actual
deployment topology; simply trusting arbitrary forwarded headers is unsafe.

Proxy blocker resolved in `5b28252`: production checkout updated and only API
recreated, using unchanged approved image. Runtime hop count is 2, API healthy,
public readiness PostgreSQL/Redis OK. Real Express on Node 24 regression failed
with the old config (proxy IP instead of visitor), then passed with the fixed
config, including distinct visitors and spoofed XFF prefix. Public follow-up:
two synthetic requests (normal and spoofed XFF) both returned 202; read-only
exact Redis lookup using the visitor from only matching nginx probe log lines
found visitor counter 2, proxy counter absent, spoofed counter absent. Visitor
IP was not printed. Direct API ports remain unpublished and gateway is bound
only to 127.0.0.1:3340. This verification assumes that fixed ingress topology.

Public deployment asset consistency: all nine JavaScript URLs referenced by a
fresh `/login` HTML response were fetched over public HTTPS. Their SHA256 values
matched the corresponding files inside the running web image (9/9). No mixed
HTML/static deployment was observed. The earlier stale-tab symptom has no
confirmed application-code root cause and no speculative patch was applied.

Next blocked acceptance steps: action-time permission to accept legal terms for
the synthetic mailbox account has been requested but not received. Do not use a
different tool to bypass that confirmation. Real signup/email/consent/AI/reset
desktop/mobile acceptance therefore remains pending. S3 destination and scoped
access also remain unavailable; do not claim off-host protection or measured
RPO/RTO. These are separate dependencies, not reasons to undo completed rollout.

## Owner-approved synthetic account acceptance — 2026-10-01

Owner granted action-time permission to accept terms for `help@rebody38.ru`.
Browser signup accepted explicit age/terms/privacy checkboxes, then displayed
the verification screen. App-generated email was found in the controlled inbox
using read-only IMAP. The link token was consumed via the public verification
API without printing it; emailVerified=true, HTTP 201. Reuse returned 400.
This verifies actual delivery and one-use API consumption, not clicking a real
email fragment through the browser. HTTP 201 differs from documented 200 and
needs contract reconciliation.

Browser onboarding (Asia/Irkutsk, wellness notice, gentle persona) completed.
Weight create 80.25 then update 80.20 retained one visible daily row and survived
reload and logout/login. Found formatting defect: display shows 80,2 rather than
canonical 80,20; frontend patch requested.

Before provider consent, actual browser AI submission displayed the disclosure.
Scoped database check: zero AI operations, only starterGrant +100, no charge.
After explicit disclosure acknowledgement, one real browser AI request succeeded
with provider_model grok-4-5 and a nonempty Russian response. Ledger: one
aiReservation -1 and one aiConfirmation 0, no extra reservation/refund. History
survived reload at 393x852; logout/login returned the saved weight. This is
responsive desktop-browser evidence, not a physical mobile-device test.

Paid call budget now 2/15 used (one earlier direct smoke plus one application
request); 13 remaining. No request was retried to obtain this successful answer.
Pending-response badge briefly showed test AI, then correctly changed after
success. API has no AI_PROVIDER env while worker has genapi; investigate source
before any fix. Frontend was informed; root owns backend/config investigation.
Full reset, idempotent live replay, off-host restore and remaining UI fixes are
not yet accepted. No full-release claim.

Follow-up integration: weight fix `626510b` cherry-picked as `a1efa1d`;
backend contract fix `771fb4c` as `7bde2a9`. Backend verification receipt
`e612a15`: isolated PostgreSQL API 102/102, worker 38/38, migrations twice,
OpenAPI/client no drift. Coordinator reran web 65/65, full workspace lint PASS
after moving the proxy regression to ESM (same regression passes on Node 24).
New API/web images for exact `7bde2a9` requested; not yet deployed.

Real password reset request submitted from browser for synthetic account;
app-generated reset email delivered with correct HTTPS fragment link. No token
was printed or consumed. Browser password-change step handed to owner as required;
waiting for owner to set new password, then verify old session/password rejection.

Release `7bde2a9` deployed API/web only after successful Node24 builds:
API `sha256:8ad743ec043c58bf368c9043d7b1629ebfec7075fdd0784160dcb0c2761a9b04`,
web `sha256:9c7020e9b1eb62e3ae3199c8947273016bdea1331bf5fa9c91efe127b98db859`.
Backend receipt confirms both healthy, legal v2/ready/login HTTP200, no migration
or worker/gateway/database recreation. Rollback tags retained for prior images.
Coordinator fresh browser login succeeded with the original synthetic password:
password reset therefore has not yet been demonstrated. Today summary, existing
record label and history now render 80,20; input80.20, one daily row. Chart label
still renders80,2; small follow-up requested. Processor PostgreSQL refund/replay
integration work is active separately; no production fault injection.

Postdeploy real AI check: second browser conversation message succeeded and
correctly referred to the previous answer. While pending, badge stayed neutral
(`AI может ошибаться`), not fake. Scoped DB: two succeeded genapi/grok-4-5
operations, exactly two reservations totaling -2 and two confirmations totaling
0, starter grant100. Paid budget now 3/15 (one direct smoke, two app requests),
12 remaining. Graph fix b1d592c reviewed and integrated separately; UI reports
66/66 tests with a RED-before/GREEN-after SVG precision regression.

Backend receipt for tests-only `d12d9b44d4bed784991b57f491e5908ab2f3fc55`
confirms isolated PostgreSQL17, migrations twice (13 metadata entries), focused
processor3/3 and full worker9 suites/41 tests PASS. Root inspected test coverage:
actual repository, transaction service and processor, synthetic provider only;
assertions include balance99 on success, balance100 with one reservation-linked
refund on technicalError, balance99/no refund on outcomeUnknown, and no repeated
provider/effect after sequential job replay. Initial fixture failure (strictness
50) corrected to schema value medium; no application change required. Test
integrated into release. No paid call, production mutation or off-host claim.
