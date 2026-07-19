# Changelog

Все заметные изменения проекта документируются здесь. Формат основан на Keep a Changelog; версии появятся с релизами.

## [Unreleased]

### Added

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

### Changed

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
