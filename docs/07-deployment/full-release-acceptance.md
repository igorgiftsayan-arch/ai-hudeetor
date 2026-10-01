# Rebody: full release acceptance

Status: IN PROGRESS. Publication alone is not acceptance.

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
  passed in backend; actual production provisioning remains pending.

## Required evidence

| Requirement | Acceptance evidence | Current boundary |
| --- | --- | --- |
| Email ownership | Public signup delivers real email; fragment token explicitly confirmed; session reports verified | Implemented and isolated-tested; Jino SMTP restriction blocks real delivery |
| Recovery | Real reset email; one-use token expires after 30 minutes; new password works; old password and sessions rejected | Implemented; database one-use/session-revocation tests passed; public real-email flow pending |
| Existing accounts | Login, onboarding and weight remain available; no automatic verified backfill; resend available | Additive migration and regression tests passed; production migration not applied |
| Real AI | Verified synthetic user explicitly consents, receives GenAPI response in browser; ledger confirms one charge on idempotent retry | Model listing and one direct synthetic generation returned 200; application journey remains unverified |
| AI failures | Integration evidence for technical-error refund and outcomeUnknown without automatic refund/retry | Revalidate against integrated release |
| Abuse protection | Enumeration-safe reset responses, resend/reset limits, unverified AI rejected before reservation/outbox, owner isolation | Identity API/database checks passed; final public gateway journey still pending |
| Backup | Encrypted scheduled copy outside production host; freshness/failure alert; restore from that copy into isolated DB | External destination/access requested; local host backup is insufficient |
| Documents | Published claims match actual email, AI provider and backup behavior; consent versions consistent | Existing pages published; final text must follow actual release configuration |
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

## Backup decision pending

Proposed initial policy, not yet configured or approved: nightly encrypted
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
Before activation, resolve downstream processing geography and data-use terms;
this draft does not substitute for those facts.
