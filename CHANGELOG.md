# Changelog

Все заметные изменения проекта документируются здесь. Формат основан на Keep a Changelog; версии появятся с релизами.

## [Unreleased]

### Added

- Release scope records the owner's backup deferral and GenAPI processing
  confirmation; SMTP activation remains subject to real authentication and
  verify/reset delivery checks, not the control-panel checkbox alone.

- Rebody identity release candidate: email ownership verification and password
  recovery use one-time hashed tokens, encrypted durable delivery payloads,
  bounded SMTP retries, enumeration-safe APIs and session revocation after a
  password reset. Existing accounts remain login-capable but unverified.
- External AI processing now requires both verified email and explicit current
  `aiProviderProcessing` consent before reservation/message/outbox effects;
  the worker repeats the guard before a real provider call.
- Migration `0012_identity_email_verification_reset.sql`, generated OpenAPI
  contracts, production SMTP configuration gates and isolated PostgreSQL
  verification were added without enabling SMTP or changing production.

- Legal disclosure v2: `/terms` и `/privacy` описывают подтверждение email
  (24 часа), восстановление пароля (30 минут), отдельное согласие на внешний
  AI, GenAPI с моделью `grok-4-5` и фактический ограниченный AI-контекст.
  Указан предел хранения в GenAPI из публичной оферты; тексты не обещают
  географию обработки, обучение моделей, резервное хранение, удаление или
  экспорт. Изменение не является юридической сертификацией или deployment.
- Rebody production release: `https://rebody38.ru` опубликован через
  отдельный Compose project, Let’s Encrypt TLS для apex/www, rate-limited host
  gateway и отдельные data volumes. В production сохранён fake AI режим; real
  provider и paid GenAPI calls не включались.
- Legal pages: `/terms` и `/privacy` связаны с consent checkbox registration и
  отображают текущую configured document version без нового frontend source of
  truth. Тексты не обещают account/chat deletion, export, retention jobs,
  payments, photos, analytics или внешний AI flow до подтверждения фактической
  реализации.
- Legal publication preparation: в страницы внесены подтверждённые реквизиты
  Rebody и email для обращений; добавлены allowlist Nginx template и runbook,
  публикующие только legal pages без `/login`, `/api/` или других экранов.
- Production candidate verification evidence: runtime record reconciled with
  application source `299f871b5bee58d0e65a513eae0eef5185db8fda`, final
  API/web/worker image digests, final desktop and Pixel 7 E2E 6/6, and P1
  canonical trusted-Origin hardening.
- Production candidate: отдельная ветка объединяет backend security/production
  boundary и UI-007 registration/onboarding без merge в `main` и без public
  deploy. Exact isolated runtime verification зафиксирована в
  `docs/07-deployment/production-candidate-runtime-verification.md`.
- Candidate runtime: fake-worker корректно принимает пустые optional
  `GENAPI_*` Compose variables; для `AI_PROVIDER=genapi` все три значения всё
  так же обязательны. Добавлен regression test.
- Production-readiness: отдельные Compose/Nginx/env templates, pre-production registration runbook, ручной acceptance-сценарий и read-only server capacity audit без production/stable deployment.
- Production-readiness verification: repeatable migrations `0000–0011`, exact-image API 82/82, worker 32/32, backend journey registration → completed onboarding → Daily Coach и disposable PostgreSQL backup/restore подтверждены в isolated Compose topology; public signup остаётся NO-GO до закрытия UI, email/abuse, TLS/legal и production backup-policy gates.
- Identity security: fail-closed Redis rate limit для регистрации и обязательная trusted Origin/Referer проверка для registration/login до выдачи session cookie.
- UI-007: `/login` теперь даёт самостоятельную регистрацию с явными
  неотмеченными согласиями 18+/условия/privacy, server-issued cookie session и
  стабильным registration `Idempotency-Key` для повторной отправки.
- UI-007: технический onboarding заменён реальным `profile → persona →
completion` REST flow; completion retry сохраняет ключ, а completed user
  возвращается на `/today` после нового входа.
- UI-007: добавлены logout control, component/browser E2E path для нового
  синтетического пользователя и инструкция конфигурации same-origin HTTPS
  gateway без включения домена или TLS.
- UI-006: `/today` получает спокойный Daily Coach между фиксацией веса и
  историей: server-sourced состояния `notStarted`, `inProgress` и `completed`,
  подтверждённые transitions, disabled/loading, safe retry с тем же
  `Idempotency-Key`, session redirect и recovery после stale `404/409`.
- UI-006: отдельная Compose override `atlas-daily-coach` публикует только
  gateway/web port; manual acceptance покрывает mobile/desktop, daily replay,
  session expiry и сохранность существующего weight/chat path.
- UI-006 verification: isolated runtime подтвердил migrations, state flow,
  health, login, `/today`, mobile и переход в существующий чат без AI message
  или token spend.
- AI-003: additive migration `0011`, concurrency-safe owner/local-date daily state, explicit state machine, structured daily context и backend-only REST/OpenAPI contract без frontend, scheduler или prompt/Character изменений.
- AI-003 verification: exact-image isolated runtime подтвердил repeatable migration, concurrent lazy initialization, timezone/ownership/idempotency/rollback, полный HTTP state flow, отсутствие daily context в логах/outbox и regression 76 API + 32 worker tests без изменения `main` или stable.
- AI-002: structured companion memory, nullable `displayName`/`targetWeightKg`, migration `0010`, owner list/delete API, deterministic worker extraction и bounded system context.
- AI-002 verification: repeatable migrations, durable source-message receipts, dedup/update/delete, owner scoping, daily weight context, API/worker regressions и isolated fake-runtime flow подтверждены без изменения `main`.
- AI-001: env-переключаемый GenAPI adapter, provider consent guard, безопасная usage/cost/latency телеметрия и migration `0009`; fake adapter сохранён.
- AI-001 verification: два последовательных реальных `grok-4-5` запроса, history, ledger confirmation, consentless refund, repeatable migration и regression suites подтверждены в isolated runtime; provider не вернул monetary cost.
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

- Production API configuration теперь fail-closed требует HTTPS browser origin, secure cookies и явно доверенный reverse-proxy hop; login и refresh возвращают фактический persisted onboarding status.
- API test imports приведены к публичной границе `@atlas/backend`, поэтому root TypeScript project-reference check снова проходит.

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
