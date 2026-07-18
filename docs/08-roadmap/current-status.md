# Текущий статус

- Дата: 2026-07-18
- Текущая задача: BOOT-001.2 — доступ к test server проверен на уровне доступной конфигурации; target и credentials не предоставлены, Docker runtime остаётся неподтверждённым.
- Код приложения: создан только технический scaffold web/API/worker и infrastructure adapters.
- Бизнес-модули, auth, AI, токены, пользователи, платежи и рефералы: отсутствуют.
- Тестовый сервер: ещё не настроен.
- AI-провайдер: не выбран.
- Следующий обязательный шаг: завершить [runtime verification](../07-deployment/runtime-verification.md) на машине с Docker. Только затем готовить VERT-001.

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

Локальные tests/typecheck/build выполняются. Docker CLI отсутствует в рабочей среде Codex, поэтому Compose validated только синтаксически, а test server не развёрнут и runtime smoke пяти сервисов остаётся обязательным перед приёмкой deployment.

## BOOT-001.1 runtime verification

- Frozen install повторно прошёл под Node.js 24.18.0/pnpm 11.14.0.
- Production entrypoints web/API/worker запускаются локально; liveness проходит.
- Manifest, service worker registration и Playwright smoke подтверждены.
- Исправлен build defect API/worker, связанный с Nest `deleteOutDir` и incremental TypeScript emit; повторные build сохраняют entrypoints.
- PostgreSQL, Redis, migrations, Compose readiness и `pnpm smoke` не проверены без Docker.

BOOT-001 пока не считается полностью закрытым; VERT-001 не запускался.

## BOOT-001.2 test-server access

Локальный Docker/Compose отсутствует. SSH client и agent socket доступны, но hostname/alias, user, checkout path и credentials test server не настроены в проекте или среде. Без явного target сетевой доступ не проверялся и deployment не выполнялся. Требуемые входные данные и точные команды записаны в [runtime-verification.md](../07-deployment/runtime-verification.md).
