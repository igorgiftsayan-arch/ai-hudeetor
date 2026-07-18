# BOOT-001 Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать устанавливаемый, собираемый и локально запускаемый pnpm-монорепозиторий с web, API, worker, PostgreSQL, Redis и минимальными проверками без бизнес-функций.

**Architecture:** `apps/*` остаются composition roots, технические backend adapters находятся в `packages/backend`, а API contracts/config/test helpers — в отдельных shared packages без доменной логики. Docker Compose поднимает пять утверждённых runtime-компонентов; S3, auth, AI и продуктовые модули отсутствуют.

**Tech Stack:** Node.js 24 LTS, pnpm 11, TypeScript 5.9, Next.js 16/React 19, NestJS 11, Drizzle/node-postgres, BullMQ/Redis, Jest, Vitest, Playwright, ESLint, Prettier.

---

### Task 1: Workspace и shared configuration

- [x] Создать root manifests, pnpm workspace, strict TypeScript, ESLint и Prettier configuration.
- [x] Создать пустые границы `api-contracts`, `test-kit`, `config-typescript`, `config-lint`.
- [x] Установить exact dependencies и зафиксировать lockfile.

### Task 2: API composition root

- [x] Сначала добавить failing HTTP tests для health, request ID и error envelope.
- [x] Создать NestJS bootstrap, configuration validation, OpenAPI, validation pipe и middleware/filter.
- [x] Подключить PostgreSQL/Redis readiness checks без бизнес-таблиц.
- [x] Запустить API tests до зелёного состояния.

### Task 3: Worker composition root

- [x] Создать отдельный NestJS entrypoint и BullMQ connection boundary без processors/jobs.
- [x] Добавить worker heartbeat/readiness mechanism и проверку PostgreSQL/Redis.
- [x] Проверить typecheck и liveness startup; dependency readiness ожидаемо требует PostgreSQL/Redis.

### Task 4: Web composition root и PWA

- [x] Сначала добавить failing Vitest test для health page.
- [x] Создать Next.js App Router layout/page, manifest и безопасный network-first service worker.
- [x] Добавить registration component без продуктовых данных.
- [x] Запустить frontend tests до зелёного состояния.

### Task 5: Database и contracts

- [x] Создать Drizzle configuration, connection adapter и пустую SQL migration.
- [x] Настроить OpenAPI export и Orval client generation/check без domain types.
- [ ] Проверить миграцию на чистом PostgreSQL — требует Docker/PostgreSQL runtime, отсутствующий в текущей среде.

### Task 6: Docker и smoke topology

- [x] Создать multi-stage Dockerfiles и Compose services `web`, `api`, `worker`, `postgres`, `redis`.
- [x] Добавить healthchecks, migration one-shot profile/command и smoke script.
- [ ] Поднять Compose, проверить health и остановить окружение без удаления volume — Docker CLI отсутствует.

### Task 7: Quality gates и документация

- [x] Добавить Playwright smoke skeleton и выполнить его против production web build.
- [x] Выполнить format check, lint, typecheck, unit tests и production builds.
- [x] Обновить README, deployment docs, current status и changelog.
- [x] Проверить структуру, внутренние ссылки и отсутствие бизнес-кода.
