# Changelog

## Chat consent runtime correction — 2026-09-25

First synthetic chat was rejected locally before any provider POST: API required
`test-v1`, worker omitted the variable and required default `v1`. Operation
`08707198-5a80-4621-b9e4-6e323343d1c7` remains technicalError/safetyRejected,
no provider ID, exactly one reservation/refund; wallet remains90. Expanded Compose
now supplies the same configured consent version to API and worker. The current
consent guard is unchanged. A fresh operation requires separate acceptance; no
successful real chat or recovery is claimed by this configuration correction.


Все заметные изменения проекта документируются здесь. Формат основан на Keep a Changelog; версии появятся с релизами.

## [Unreleased]

- Native chat request now omits the proxy model selector and persists its exact
  wire body before submission; saved receipt replay and reconciliation use that
  snapshot. Documented native result strings/full_response arrays are parsed;
  request echoes are rejected, proxy behavior retained. Targeted16/16 and actual
  PG chat receipt subset5/5, worker typecheck/scoped lint PASS. Independent review
  and one real native chat acceptance remain pending; no new provider call yet.


### Runtime checkpoint — 2026-09-25

- Final current components web8a0e72d/API backend141b784/workerda9e837.
  Second food correction/confirm/reload and core weight/wellness/captain checks
  passed through browser+API+PG; owner-negative lists/details do not leak data.
  Public origin restored, owned SSH tunnel closed, bootstrap disabled.
  PublicHTTP WebCrypto and real phoneHTTPS/push remain explicit readiness gaps.


- Fixed valid daily weights such as80.4 rejected by floating-point multiplication.
  Decimal round-trip preserves strict2decimal precision/ranges. Actual isolatedPG
  regression red→green; dailyweight7/7, APItypecheck/scopedlint PASS. Independently reviewed7/7; API deployed and actual80.4 edit/reload PASS.


- Actual full-app food analyses2/2 completed with exactly one reservation and
  confirmation each, no refunds (wallet100→90). Second operation recovered from
  observed known-ID pending worker crash with unchanged providerID/hash. First
  photo physically purged after natural eligibility; result/diary deletes preserved
  ledger. Details and still-open desktop/core/phone gates in
  `docs/07-deployment/gerbi-full-food-runtime.md`.


- Fixed actual browser S3 upload signing: checksum metadata stays in SignedHeaders
  instead of being hoisted to query while also required as a browser header.
  Actual full-size synthetic PNG2653194bytes reproduced400 before and passed200
  after; anonymousGET403 retained. Real SDK regression2red→3/3green includes
  the10MiB boundary; APItypecheck/scopedlint PASS. Independent3/3 review PASS; API artifact deployed.


- One constrained expanded test stack replaces Daily Coach on the existing2GB host.
  Current compiled artifacts, private MinIO source-build fallback, resource caps,
  backup/rollback and real signed-upload403/200 checks are recorded in
  `docs/07-deployment/gerbi-constrained-runtime.md`. Later bounded food/core acceptance is recorded in gerbi-full-food-runtime.md;
  physical phone HTTPS/push remains pending.


### Current checkpoint — 2026-09-24

- Expanded MinIO initialization now uses same-origin gateway uploads without the
  invalid JSON `mc cors set` step. Bucket creation and anonymous-access denial
  remain required; init failures are not ignored. Cross-origin uploads are not
  enabled by this configuration. Runtime signed-upload/private-object acceptance
  is a separate deployment gate.

- Real native vision probe `54112506` used one unchanged synthetic food image and
  an explicit vegetarian profile, with no dish labels in request text. The model
  recognized chicken/lettuce/tomato/cucumber (`dishName=null`) and returned
  `doesNotMatch`/`profile` because chicken conflicts with that restriction.
  This verifies one protocol/image/profile-semantic example, not full-stack quality.
- Fixed food parser for the observed native choice arrays at
  `result[0].message.content` and `full_response[0].message.content`.
  Sanitized regressions first failed2/2; processor tests now **5/5**, worker
  typecheck/scoped lint PASS. Exact production extraction/validation also passed
  offline against the saved real envelope. Independent review passed with no
  concrete P1/P2; reviewer reran5/5 and malformed-content/request-echo checks.
  One POST only; bounded follow-up GETs reused its ID. Reported raw cost1.0444
  has unverified units; usage unavailable. No full adapter/ledger/storage/browser/
  phone or deployment acceptance is implied.
- Current integrated source **`f360290`** adds owner-scoped paginated analysis
  discovery (`a355311`/`6bc9292`) and independently reviewed fixes
  `74a20d7`/`f360290`. Historical unconfirmed/error analyses and tombstones with
  remaining photos are discoverable; deleted content is excluded.
  Original scoped API **6/6 actual PG** and food UI **46/46** preceded review.
  Fixed results: API **7/7 actual PG**, food UI **49/49**, backend/web typecheck
  and scoped lint PASS. Independent targeted reruns: cursor **1/1 PG**, stale
  list **3/3 UI** (other cases intentionally skipped); counts overlap, not a
  new full-suite total. Both P2 findings are closed: malformed offset becomes422,
  and stale list reads cannot restore deleted names or duplicate confirmed food.
  No remaining concrete P1/P2 in the reviewed scope; real runtime/storage/provider/
  phone/SLA gates remain pending. Never-analyzed uploads and possibly-submitted
  deletion remain outside this implementation; no provider-side deletion claim.
- Integrated checkpoint **`fa13d8d`** includes food account-switch fence
  `f231fed` (food **33/33**, web typecheck/lint PASS), push `e226448`/`156a138`
  (midnight catch-up and separate scheduled occurrence, actual PostgreSQL
  **9/9** PASS), and immutable prepared-receipt replay `01832ac` (targeted
  **14/14**, including actual PostgreSQL **9/9**, worker typecheck/lint PASS).
  Prepared replay preserves current consent/attempt locking and never resubmits
  or refunds ambiguous/submitting receipts. Results are scoped per suite and
  must not be summed into a new full-worker count.
- Terminal photo retention `ea4525f`, followed by review fix `3531480`, is
  **locally independently reviewed; real S3/runtime acceptance remains pending**. Migration0015 captures immutable terminal time; durable
  cleanup retries original/staging deletion after 30 days, excludes unresolved
  or unproven terminal state, prevents upload resurrection and preserves ledger,
  receipts, analysis results and confirmed history. Targeted **12/12** PASS
  (7 actual PG retention + 3 runner + 2 existing lifecycle); backend build,
  worker typecheck/scoped lint and migrate/repeat PASS. S3 transport is stubbed;
  no live deletion occurred. Voluntary deletion was absent at that historical checkpoint;
  the current implementation is recorded below.
  Main/remote unchanged; real storage/GenAPI/browser/phone gates remain pending.
- Retention review `3531480` closes P2 stale invalid-upload quarantine overwrite:
  only a still-pending, non-deleted image can become quarantined. Affected
  retention/lifecycle **13/13** PASS, backend typecheck/scoped lint PASS;
  independent reviewer **4/4 actual PostgreSQL** PASS. These remain scoped suites,
  not a new full-worker count. Integrated source is `ca24217`; no remote change.
- Integrated local source `1c6a234` includes terminal deletion `b9a60be`,
  known-unsent cancellation `5a08efb`, owner policy `e1472a7` and food UI.
  Terminal deletion separates photo/result actions, hides erased content on replay,
  preserves financial metadata/ledger and confirmed diary entries, and queues
  durable original/staging cleanup. Targeted **32/32** PASS; independent review
  found no P1/P2 and reran **7/7 actual PostgreSQL**.
- Cancellation `5a08efb` is **locally independently reviewed; remote/runtime acceptance pending**.
  Reviewer found no concrete P1/P2 and independently reran **10/10 actual PG**.
  Proven-unsent requests atomically enter cancelled with a distinct cancellation
  reason and one full refund; stale attempts cannot submit afterward. Possible-send
  evidence rejects deletion/refund, even without provider ID. Targeted **41/41**
  across six suites, followed by latest cancellation subset **10/10**; overlapping
  counts must not be summed. Migrations0016/0017 and repeat, backend/worker/API
  typecheck, scoped lint, generation and contracts:check PASS. Pre-ID unknown
  goodwill policy remains TBD; no new remote deployment/deletion or main change.
- Food privacy UI `1c6a234`: separate photo/result controls, authoritative refund
  marker, reload/account-switch/polling safeguards; **43/43** food tests, full web
  typecheck/scoped lint PASS. Historical unconfirmed/error analyses lacked a listing at that checkpoint;
  the new discovery package above closes that access gap locally. Real S3/GenAPI/browser/phone delivery and
  the 24-hour deletion SLA remain pending and are not established by local tests.
- Earlier integrated head `1ffd048`: local API 92/92, worker 44/44 (actual PostgreSQL
  included), provider-prompt 15/15; food UI 24/24 on `d52eb9f`. These are recorded
  scoped results, not a new all-suite run. Real storage/GenAPI food/browser/phone
  gates remain pending; full expanded-pilot acceptance is not claimed.
- Food UI `cd48570`: explicit suitability labels for all four statuses and exact
  server `missingData` entries; composition edits retain the stale-assessment
  guard. Food **29/29**, web typecheck and scoped lint PASS. Real-provider and
  browser/runtime acceptance remains pending.
- Backend `ca3d612`: fixes the marathon worker's unhandled outbox publication
  rejection (`EAI_AGAIN postgres`; DNS failure cause not established) and the
  fake daily-coach worker's rejection of empty optional GenAPI env values.
  Both diagnosed workers had `OOMKilled=false`. Publisher retries without
  overlap or premature outbox marking, retains stable job IDs and drains on
  shutdown. Empty optional chat settings normalize to undefined; independent
  real food/push configuration remains validated even with fake chat.
  Worker **52/52** including actual PostgreSQL, backend/worker typecheck and
  scoped lint PASS. No server restart or image update: the deployed defects
  remain, remote DNS recovery and user journeys were not rerun.
- User approved continued local development while server RAM/storage is increased.
  Latest live host snapshot is 1 CPU / 2 GB RAM; API containers for
  `atlas-gerbi-marathon` and `atlas-v01` have `State.OOMKilled=true`, and several
  workers exited 1 (the two diagnosed causes and local fixes are recorded below). Earlier healthy statements
  below are historical observations, not current health claims.
- Removed only unused Docker build cache: Docker reported 4.721 GB reclaimed;
  disk now 4.2 GB free / 85% used. The same 24 containers remained running.
  Available RAM about 510 MiB; swap about 1.5 GiB used. Disk cleanup does not
  resolve RAM capacity or prove API/worker recovery. No new remote build/deploy
  or main change is recorded by this update.

The entries below preserve the sequence of earlier changes and checkpoints.
Their failures, server-down reports, resource numbers and healthy observations
apply to those snapshots; current status is the checkpoint above and
[the status document](docs/08-roadmap/current-status.md).

### Added

- GERBI review: chat/photo prompts prohibit food-to-weight causal claims and require acknowledging insufficient comparable data; provider-message tests pass 15/15. Expanded Compose uses publicly verified official Quay MinIO/mc releases pinned to Linux amd64 digests; no images pulled, resource gate remains open.

- GERBI runtime preparation: current source transferred to isolated checkout and local Node 24 runtime artifacts built against matching Linux dependency lockfile. Deployment held at verified resource/storage-image blockers; no expanded containers started and stable projects preserved.

- GERBI local PostgreSQL recovery checkpoint: common operation-row lock serializes submit/acceptance with recovery; food ledger inserts match existing migrations, and diary dates return `YYYY-MM-DD` consistently across initial response and replay. Added real-migration FoodService lifecycle/ledger tests. API noEmit typecheck no longer inherits incompatible composite source boundaries. Full pilot acceptance still requires real GenAPI image/runtime and phone push.

- Expanded pilot constitution checkpoint (`e6874de`): PROJECT-VISION, V1 scope, marathon scope и manual acceptance согласованы с обязательными food/push/recovery. Приведены актуальные локальные evidence, отсутствующая runtime/phone приёмка, недоступный test server и нерешённые вопросы владельца; исторический roadmap сохранён.

- GERBI phone push UI (`baccdf5`): `/notifications`, явный opt-in, проверка разрешения/подписки текущего устройства через generated API, отдельное расписание, отключение устройства и защита смены аккаунта. Service worker использует нейтральный текст и deliveryId dedup; есть HTTPS/iOS Home Screen инструкции. Реальная доставка на телефон ещё не проверена.
- GERBI confirmed food history (`b28b2b3`): исправление состава и удаление записи, сохранение исходного времени/часового пояса, идемпотентный повтор после потери ответа и отдельный повтор чтения истории. Итог исполнителей: web 94/94, typecheck и scoped lint PASS; browser/runtime gate впереди.

- GERBI food recovery (`add1a63`): подтверждение после потери ответа повторяется с исходным ключом без повторной коррекции; ожидающая операция восстанавливается после перезагрузки из метаданных, привязанных к пользователю. Устаревшие ответы polling игнорируются; неизвестный исход проверяется ограниченными сериями. Фотографии, AI-текст и секреты в Web Storage не сохраняются. Шесть новых regression-сценариев; серверная и мобильная приёмка остаются отдельными gates.

- GERBI expanded pilot UI foundation: локальные компоненты выбора/preview/валидации food photo, явного analysed-versus-confirmed шага с отдельными датой/временем и capability/permission push UI. Компоненты не делают API-вызовов, не создают запись питания и не вызывают browser permission без явного клика; настоящая интеграция ожидает OpenAPI-контракт.
- GERBI expanded pilot `/food`: контрактный private upload → typed analysis operation → polling, видимая цена, owner-scoped история только подтверждённой еды, явное confirmation после редактирования состава и локальных даты/времени. Результат fake adapter явно отмечен тестовым; real vision и phone push не объявляются проверенными.
- GERBI expanded pilot scope: обязательны private food-photo analysis с отдельным consumed confirmation, phone Web Push с opt-in/user schedule и безопасное automatic AI recovery; неподтверждённое фото не считается съеденной едой, причинные выводы о весе запрещены.
- GERBI-MARATHON-PILOT completion audit (`629f576`): focused PostgreSQL `9/9`, calendar `2/2` and reconciliation matcher `2/2` подтвердили cross-team isolation, captain create/edit vs participant deny, safe team DTO и first-day/last-day/rollover; frontend browser gate отдельно подтвердил восстановленный assistant reply и доступный composer без нового AI-запроса.
- GERBI-MARATHON-PILOT operator handoff: добавлен fail-closed GenAPI reconciliation runbook с verify-before-write, safe replay и post-write проверками. Изолированный synthetic pilot подготовлен к ручной приёмке владельцем, но не считается production/stable accepted; automatic pre-ID recovery и immutable request snapshot для защиты от context drift остаются открытыми, timeout не менялся.
- GERBI-MARATHON-PILOT: additive migration `0012`, marathon/team/membership, owner-scoped wellness report, captain daily task/completion, safe daily team read model and explicit current-version provider consent boundary.
- GERBI-MARATHON-PILOT verification: repeatable migrations through `0013`, PostgreSQL 8/8, API 44/44, worker 32/32, isolated shared browser/mobile daily flow and shared browser GenAPI consent/two-message/ledger acceptance; safe context-builder and log/outbox privacy evidence recorded while `main` and stable remain unchanged.
- GERBI-MARATHON-PILOT manual acceptance and food-vision dependency assessment; real marathon dates, team composition and captain assignments remain external pilot inputs.
- GERBI-MARATHON-PILOT daily metrics: exact yesterday-to-today weight percentage, immutable first-in-period baseline, eight-point wellness, self-reported captain task and dense shared-place podium groups without cumulative team totals.
- GERBI-MARATHON-PILOT migration `0013`: PostgreSQL captures the first in-period weight atomically on membership/weight writes and preserves it across later daily upserts.
- GERBI-MARATHON-PILOT completion guard: a new command cannot complete a stale task, while an exact successful idempotency replay remains stable across the local-date boundary.
- GERBI-MARATHON-PILOT runtime checkpoint: isolated shared browser confirmed mobile daily podiums, consent-gated GenAPI flow, two completed real-provider actions and stale-task recovery; evidence excludes credentials and AI contents.
- GERBI-MARATHON-PILOT: the external GenAPI consent UI now clearly states that messages and necessary context are sent to GenAPI; it no longer calls the real-provider mode a test AI.
- GERBI-MARATHON-PILOT: `outcomeUnknown` chat coverage explicitly guards against a refund promise or automatic resend while reconciliation is pending.
- GERBI-MARATHON-PILOT status: real GenAPI surfaced an `outcomeUnknown` recovery blocker; the isolated marathon checkpoint remains tested, while backend diagnosis/recovery is pending and overall real-AI completion is not claimed.
- GERBI-MARATHON-PILOT final isolated browser checkpoint: code images from `bec79b4` remained healthy behind the public gateway; stale task completion returned `MARATHON_TASK_DATE_INVALID`, refreshed to a calm date-change state and preserved the responsive `390px` layout.
- GERBI-MARATHON-PILOT targeted AI evidence: one deterministic safe memory fact appeared in the next bounded context together with two prior conversation messages; the provider call ended `outcomeUnknown`, with no automatic refund or reconciliation claim.
- GERBI-MARATHON-PILOT provider disclosure: the isolated UI now names GenAPI and explains that messages and required context are transferred to form the answer; misleading test-mode wording was removed while pre-consent blocking remained intact.
- GERBI-MARATHON-PILOT GenAPI recovery review: the documented native async API can poll a received `request_id`, but no documented idempotent initial submit or client-ID lookup was found; pre-ID timeout ambiguity remains an explicit blocker without changing ledger or refund policy.
- GERBI-MARATHON-PILOT audited GenAPI reconciliation: strict provider-result matching, transactional `outcomeUnknown → succeeded`, single confirmation/message, durable audit marker and safe replay without duplicate effects; no migration or provider resubmit added.
- GERBI-MARATHON-PILOT reconciliation verification: provider request `54055527` matched the original four-message request, PostgreSQL reconciliation passed `1/1`, runtime replay was idempotent and log scanning found no forbidden AI content or secrets; pre-request-ID ambiguity remains open.
- AI-003: additive migration `0011`, concurrency-safe owner/local-date daily state, explicit state machine, structured daily context и backend-only REST/OpenAPI contract без frontend, scheduler или prompt/Character изменений.
- AI-003 verification: exact-image isolated runtime подтвердил repeatable migration, concurrent lazy initialization, timezone/ownership/idempotency/rollback, полный HTTP state flow, отсутствие daily context в логах/outbox и regression 76 API + 32 worker tests без изменения `main` или stable.
- AI-002: structured companion memory, nullable `displayName`/`targetWeightKg`, migration `0010`, owner list/delete API, deterministic worker extraction и bounded system context.
- AI-002 verification: repeatable migrations, durable source-message receipts, dedup/update/delete, owner scoping, daily weight context, API/worker regressions и isolated fake-runtime flow подтверждены без изменения `main`.
- AI-001: env-переключаемый GenAPI adapter, provider consent guard, безопасная usage/cost/latency телеметрия и migration `0009`; fake adapter сохранён.
- AI-001 verification: два последовательных реальных `grok-4-5` запроса, history, ledger confirmation, consentless refund, repeatable migration и regression suites подтверждены в isolated runtime; provider не вернул monetary cost.
- Экран Герби-Марафона: зафиксированы результат на сегодня, пьедестал трёх лидеров и скрытый накопленный итог; дневная формула и правила равных результатов остаются открытыми.
- Герби-Марафон: закреплены название конкретного марафона и три независимых показателя — процент отвеса, Веллнес индекс и выполнение заданий капитана; общий балл не вводится.
- Марафонный пилот (2026-09-24): в PROJECT-VISION зафиксированы приоритет командной динамики, восемь отметок прежнего бота за вчера, Велнесс Индекс, задание капитана и открытые правила командного зачёта.
- PROJECT-VISION (2026-09-23): операционная конституция с проверенным состоянием `main` и отдельных AI-веток, полной картой версий, архитектурными инвариантами, правилами Codex, Git/deploy flow, проверками и явными TBD.
- Чтение `PROJECT-VISION.md` добавлено в обязательный список `AGENTS.md`; `current-status.md` дополнен актуальным документальным срезом.
- UI-005: `/today` различает первую запись и обновление веса за текущую локальную дату; после ответа `created|updated` сохраняет значение в поле, показывает нейтральное подтверждение и обновляет историю/график без frontend-дедупликации.
- UI-005 verification: daily upsert migration `0008`, PostgreSQL integration, generated client drift check, browser/mobile create → update → reload и isolated `atlas-ui-001` deployment подтверждены без изменения `main` или stable `atlas-v01`.
- UI-001: mobile-first `/today` с последним весом, нейтральной динамикой, быстрым вводом, историей до 10 записей и минимальной навигацией `Сегодня`/`AI`.
- UI-001: явные loading/empty/saved/validation/network retry/session expired states и безопасный повтор weight POST с тем же `Idempotency-Key`.
- UI-001: web component tests для latest/history/create/validation/loading/error/retry/session/navigation и ручной acceptance-сценарий.
- UI-001: минимальный `/login` через существующий session API, completed redirect на `/today` и возврат на `/login` после истечения сессии.
- UI-001: same-origin `/api/v1` и изолированная Compose-конфигурация `atlas-ui-001`, публикующая только web gateway на настраиваемом `UI001_PUBLIC_PORT`.
- UI-001 verification: отдельный Compose project `atlas-ui-001` на test server прошёл migrations, health, browser/mobile acceptance login → today → idempotent retry → quick reply; стабильный `atlas-v01` не затрагивался.
- UI-002: weight entry поддерживает до двух знаков после запятой во frontend, backend validation, API contract и PostgreSQL `numeric(5,2)`; isolated test-server verification подтверждает repeatable migration, browser/mobile flow, API validation и idempotent retry без дубля.
- UI-002: PWA shell cache version обновлена до `atlas-shell-v2`; isolated web/gateway пересобраны и пересозданы, а чистый browser profile подтвердил получение нового frontend build.
- UI-003: `/quick-reply` стал mobile-first чатом с persisted conversation messages, визуально разделёнными репликами, ожиданием fake AI, inline error/retry и компактной стоимостью.
- UI-003: добавлены owner-scoped reads текущей и выбранной AI conversation с сообщениями; OpenAPI client сгенерирован штатно.
- UI-004: над недавним списком веса добавлен адаптивный SVG-график, устойчивый к одной записи и нескольким записям за день.
- BUG-UI-001: migration `0007_ai_reservation_uniqueness.sql` исправляет ошибочное legacy-ограничение ledger, которое допускало только один `aiReservation` каждого пользователя; уникальность starter grant сохранена частичным индексом.
- BACK-UI-001: daily weight upsert by user-local date, non-destructive legacy-row strategy, `created|updated` response contract, PostgreSQL daily uniqueness constraint and focused test-server verification.
- VERT-001.5: minimal `/quick-reply` web boundary, owner-scoped operation polling, fake-runtime notice and safe display of the completed assistant response.
- VERT-001.5 final verification: isolated test-server fake-adapter acceptance confirmed success, technical refund, outcomeUnknown blocking, HTTP idempotency, duplicate outbox delivery, worker restart, PostgreSQL/worker regression and safe log/outbox payload boundaries.

- VERT-001.5 worker verification: fake-adapter success, technical error, outcomeUnknown, duplicate delivery and restart behavior verified on an isolated test-server topology.

- DOC-001: документационная основа, правила работы, требования V1, домен, API, аналитика, безопасность, разработка, развёртывание и roadmap.
- DOC-002: модель экономики токенов, классификация AI-ошибок, политика возраста/данных и ADR критериев технического стека.
- ARCH-001: системная, API, database, authentication, deployment и observability архитектура.
- ADR-002—ADR-010: TypeScript stack, frontend, backend, PostgreSQL, auth, REST/async API, jobs, storage и test deployment.
- ARCH-002: acceptance review архитектуры, разрешённые упрощения V0.1, риски и первый вертикальный срез.
- BOOT-000: engineering baseline V0.1 с runtime/framework versions, Drizzle/BullMQ, auth/session, validation/OpenAPI contracts, testing, pnpm workspace, PWA, secrets/logging и PostgreSQL backup.
- BOOT-001: pnpm monorepo scaffold с Next.js PWA, NestJS API/worker, PostgreSQL/Redis adapters, Drizzle migration, OpenAPI contracts, quality tooling и локальной Docker Compose topology.
- BOOT-001.1: fallback runtime verification, проверка production entrypoints/PWA и документирование незавершённой Docker-приёмки.
- BOOT-001.2: аудит доступности test server; зафиксированы отсутствующие access parameters и команды будущей Docker runtime-проверки.
- BOOT-001 runtime verification: подтверждены GitHub checkout, Docker Engine/Compose, Docker Hub authentication, PostgreSQL 17, Redis 8, Drizzle migration, API/web/worker health и deployment на test server; BOOT-001 завершён.
- VERT-001-DESIGN: product/domain/database/API/AI/analytics/testing дизайн первого вертикального среза и backlog VERT-001.1—VERT-001.8 без реализации.
- VERT-001.1: final onboarding/tracking/analytics/token/AI/API contracts первого среза, достаточные для начала identity/session реализации VERT-001.2.
- VERT-001.2: identity module с registration/login/current-user/logout, Argon2id, opaque PostgreSQL sessions, refresh rotation/reuse detection, CSRF, Redis login limiter, consent evidence, SQL migration, OpenAPI client и unit/API/integration tests.
- VERT-001.3 design review: технический дизайн profile/persona onboarding state, database/API proposals, analytics, testing и implementation breakdown без кода или миграций.
- VERT-001.3: `profiles` module, profile/persona REST API, `user_profiles`/`ai_preferences`/`outbox_messages` migration, technical onboarding route, OpenAPI contracts и API/PostgreSQL/frontend tests.
- VERT-001.3 verification: final test-server acceptance profile → personaReady, durable outbox event и no-duplicate retry; PostgreSQL integration (5/5) и API regression (16/16) подтверждены.
- VERT-001.4: completion command с server-side starter grant `+100`, append-only wallet ledger, PostgreSQL HTTP idempotency records, owner-scoped weight entries и durable outbox sources для completion/weight событий.
- VERT-001.4 verification: migration `0003` и final test-server acceptance подтверждены; completion/weight retries идемпотентны, а изменённый payload с тем же key возвращает conflict.

### Changed

- BUG-UI-001: AI operation `Idempotency-Key` теперь привязан к payload; новый текст получает новый key, а сетевой retry того же текста повторяет прежний key без двойного списания.
- BUG-UI-001: raw server message больше не выводится пользователю; idempotency, balance и operation errors отображаются внутри чата понятным текстом.
- BUG-UI-001: два и более последовательных fake AI-запроса одного пользователя теперь создают отдельные reservations и не падают с PostgreSQL `23505`.
- Completed onboarding теперь направляет пользователя на продуктовый `/today`; прямой доступ к `/quick-reply` сохранён.
- Product web metadata и базовый визуальный слой обновлены с технического scaffold на спокойный mobile-first дневник без новой UI-библиотеки.
- Закрыты правила реферального окна и активного пользователя.
- «Донат» уточнён до покупки пакетов через действие «Пополнить токены».
- PRD, scope, аналитика, правила исполнителя и roadmap синхронизированы с решениями DOC-002.
- Правила Codex, coding standards, repository structure и roadmap синхронизированы с ARCH-001.
- ADR-006—ADR-008, правила Codex и roadmap уточнены конкретными implementation choices BOOT-000 без изменения принятых архитектурных границ.
- Исправлен повторный NestJS build API/worker: отключён incremental/composite emit, конфликтовавший с очисткой `dist`.
- Исправленный migration entrypoint подтверждён в Docker runtime без изменения архитектуры или набора зависимостей.
- VERT-001.3 завершается в `personaReady`; VERT-001.4 включает onboarding completion, стартовые 100 токенов, первый вес и инициализацию tracking.
- В VERT-001.3 принят minimal transactional outbox: только durable PostgreSQL storage и атомарная запись `profiles.ai_persona_selected.v1`, без consumer-ов, worker logic, AI Gateway или токенных эффектов.
- DEV-001: runtime baseline сохранён, а Docker/test server зафиксирован как authoritative среда final verification при несовместимости локального Codex runtime.
- VERT-001.3: исправлены runtime DTO metadata для profile/persona validation и PostgreSQL typing динамических параметров persona outbox payload.
