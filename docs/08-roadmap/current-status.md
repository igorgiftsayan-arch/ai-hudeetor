# Текущий статус

- Дата: 2026-07-18
- Текущая задача: BOOT-001 завершён; Docker runtime и deployment на test server подтверждены.
- Код приложения: создан только технический scaffold web/API/worker и infrastructure adapters.
- Бизнес-модули, auth, AI, токены, пользователи, платежи и рефералы: отсутствуют.
- Тестовый сервер: технический scaffold web/API/worker с PostgreSQL 17 и Redis 8 развёрнут и проверен.
- AI-провайдер: не выбран.
- Следующий обязательный шаг: подготовить и отдельно утвердить scope VERT-001; реализация VERT-001 ещё не начата.

## Решения ARCH-001

- pnpm/TypeScript monorepo, Next.js/React PWA и NestJS modular monolith с отдельным worker.
- PostgreSQL — бизнес-истина; Redis — очередь/координация; private S3 — файлы.
- REST/OpenAPI, idempotency, operation resources и reconciliation `outcomeUnknown`.
- Cookie auth, refresh rotation, CSRF, ownership, admin MFA/RBAC/audit.
- Transactional outbox, repeatable jobs и single-server Docker test topology.
- AI Gateway/provider adapters без выбора AI-провайдера.

Код, зависимости, контейнеры и CI не создавались. Решения BOOT-001 и production перечислены в [backlog.md](backlog.md).

## Acceptance ARCH-002

Целевая архитектура сохранена без изменений. Для V0.1 разрешена инкрементальная реализация без пустых модулей и универсальных платформ; ledger, ownership, idempotency, constraints, минимальный outbox/worker и security baseline обязательны. Полный review и входные решения BOOT-001 — в [architecture-acceptance-review.md](../01-architecture/architecture-acceptance-review.md).

## Engineering baseline BOOT-000

- Runtime/frameworks: Node.js 24 LTS, pnpm 11, TypeScript 5.9, Next.js 16/React 19 и NestJS 11.
- Persistence/queue: Drizzle + reviewed SQL migrations + node-postgres; BullMQ поверх PostgreSQL transactional outbox.
- Auth: project-owned opaque cookie sessions в PostgreSQL, rotation/reuse detection, CSRF и Argon2id.
- Contracts/tests: Nest validation/OpenAPI, Zod, Orval; Jest/Supertest, Vitest/Testing Library и Playwright.
- Monorepo/PWA/operations: pnpm workspace без task runner, network-first safe-cache PWA, structured JSON logs и nightly off-host PostgreSQL backup.

Полные решения, ограничения, compatibility notes, prerequisites и deferred decisions находятся в [engineering-baseline.md](../01-architecture/engineering-baseline.md). На момент завершения BOOT-000 код, зависимости, scaffold, Docker и CI ещё не создавались.

## BOOT-001 scaffold

- Созданы pnpm workspace, lockfile, strict TypeScript, ESLint/Prettier и test tooling.
- Созданы Next.js PWA health page, NestJS API health/OpenAPI/error/request-ID contour и отдельный BullMQ worker.
- Подключены Drizzle/node-postgres и Redis health adapters, пустая bootstrap migration и contract generation.
- Созданы Dockerfile/Compose для web/API/worker/PostgreSQL/Redis, migration service и smoke commands.
- S3, CI, production deployment и любые продуктовые функции не создавались.

Локальные tests/typecheck/build выполняются. Финальная Docker-проверка выполнена на test server; детали зафиксированы в [runtime verification](../07-deployment/runtime-verification.md).

## BOOT-001.1 runtime verification

- Frozen install повторно прошёл под Node.js 24.18.0/pnpm 11.14.0.
- Production entrypoints web/API/worker запускаются локально; liveness проходит.
- Manifest, service worker registration и Playwright smoke подтверждены.
- Исправлен build defect API/worker, связанный с Nest `deleteOutDir` и incremental TypeScript emit; повторные build сохраняют entrypoints.
- PostgreSQL, Redis, migrations, Compose readiness и `pnpm smoke` не проверены без Docker.

Эти локальные ограничения закрыты последующей проверкой на test server. VERT-001 не запускался.

## BOOT-001.2 test-server runtime

На test server подтверждены GitHub checkout, Docker Engine, Docker Compose, Docker Hub authentication, сборка images, PostgreSQL 17, Redis 8, Drizzle migration, API health, web HTTP `200`, worker health и deployment workflow. BOOT-001 полностью закрыт.

## BOOT-001.2 migration compatibility fix

Test-server run выявил CJS transform error из-за top-level `await` в `database/migrate.ts`. Migration entrypoint переведён на async `main()` без изменения общего module strategy и без новых зависимостей. Исправление проверено в migration container: Drizzle migration выполняется успешно.

## Переход к VERT-001

- Runtime-блокеров со стороны BOOT-001 не осталось.
- Входная база: принятая архитектура, engineering baseline, работающий monorepo scaffold и проверенный test deployment.
- Scope, acceptance criteria, затрагиваемые доменные модули, API, события и security requirements должны быть заданы отдельной задачей VERT-001.
- До отдельного подтверждения продуктовая реализация не начинается.
