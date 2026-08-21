# AI-003 Daily Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать owner-scoped timezone-aware daily state и structured daily context без frontend, scheduling или prompt/character логики.

**Architecture:** AI-003 остаётся внутри доменного модуля `ai-companion`. Application use cases владеют lazy initialization, context read и transitions; PostgreSQL repository выполняет concurrency/idempotency boundaries. API и generated client публикуют только утверждённый REST contract.

**Tech Stack:** NestJS 11, TypeScript 5.9, PostgreSQL 17, Drizzle SQL migrations, Jest/Supertest, pnpm workspace.

---

### Task 1: Зафиксировать RED persistence/state-machine tests

**Files:**
- Create: `apps/api/test/ai-daily-state-postgres.integration.spec.ts`
- Create: `apps/api/test/ai-daily-state-machine.spec.ts`

- [ ] Написать failing tests для unique owner/local-date, concurrent lazy init,
  timezone boundary, valid/invalid/same-state transitions, idempotency replay,
  changed-payload conflict, owner scope и transactional rollback.
- [ ] Запустить focused Jest и подтвердить ожидаемый RED из-за отсутствующих
  table/use cases.
- [ ] Не писать production code до зафиксированного RED.

### Task 2: Добавить additive migration и persistence model

**Files:**
- Create: `database/migrations/0011_ai_003_daily_coach.sql`
- Modify: `database/migrations/meta/_journal.json`
- Modify: `packages/backend/src/infrastructure/database/schema.ts`
- Create: `packages/backend/src/ai-companion/domain/ai-daily-state.ts`
- Create: `packages/backend/src/ai-companion/application/ai-daily-state-repository.ts`
- Create: `packages/backend/src/ai-companion/infrastructure/postgres-ai-daily-state.repository.ts`

- [ ] Добавить migration table/constraints/indexes.
- [ ] Добавить domain types и transition matrix без transport dependencies.
- [ ] Реализовать PostgreSQL repository с atomic local-date lookup/upsert,
  `FOR UPDATE`, owner scope и общей idempotency table.
- [ ] Запустить migration/persistence tests до GREEN.

### Task 3: Реализовать structured daily context

**Files:**
- Create: `packages/backend/src/ai-companion/application/daily-context-builder.ts`
- Create: `apps/api/test/daily-context-builder.spec.ts`

- [ ] Написать RED tests: реальные nullable system fields, current daily weight,
  max 12 active facts, deleted/sensitive exclusion, no prompt string leakage.
- [ ] Реализовать builder через существующие Profiles/Tracking/Memory application
  boundaries без импорта чужого infrastructure.
- [ ] Запустить focused tests до GREEN.

### Task 4: Реализовать application use cases

**Files:**
- Create: `packages/backend/src/ai-companion/application/get-today-ai-daily-state.use-case.ts`
- Create: `packages/backend/src/ai-companion/application/transition-ai-daily-state.use-case.ts`
- Modify: `packages/backend/src/ai-companion/domain/ai-companion-error.ts`

- [ ] Написать RED tests для completed onboarding, lazy init и transition errors.
- [ ] Реализовать use cases с явными transaction/idempotency boundaries.
- [ ] Проверить GREEN unit + PostgreSQL tests.

### Task 5: Публиковать REST/OpenAPI contract

**Files:**
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.dto.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.controller.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.module.ts`
- Modify: `packages/backend/src/index.ts`
- Modify: `packages/api-contracts/generated/**`
- Create: `apps/api/test/ai-daily-state-api.spec.ts`

- [ ] Написать RED Supertest contract tests для auth, validation, CSRF/Origin,
  idempotency header и error envelope.
- [ ] Добавить только два утверждённых endpoints и module wiring.
- [ ] Сгенерировать OpenAPI/client, выполнить drift check.
- [ ] Запустить focused tests до GREEN.

### Task 6: Regression, docs и isolated runtime verification

**Files:**
- Modify: `docs/02-domain/domain-model.md`
- Modify: `docs/02-domain/database-schema.md`
- Modify: `docs/03-api/endpoints.md`
- Modify: `docs/07-deployment/runtime-verification.md`
- Create: `docs/06-development/ai-003-manual-acceptance.md`
- Modify: `docs/08-roadmap/current-status.md`
- Modify: `CHANGELOG.md`

- [ ] Выполнить lint, format check, backend/API typecheck/build, focused и full
  relevant regression.
- [ ] Собрать isolated API/migrate runtime, применить migrations дважды и
  проверить Drizzle metadata/table/constraints.
- [ ] Пройти concurrent lazy-init, timezone, transitions, replay/conflict,
  ownership и privacy-log acceptance.
- [ ] Удалить только isolated topology; подтвердить stable projects unchanged.
- [ ] Обновить документацию фактическими результатами, создать verification
  commit и push только `back/ai-003-daily-coach`.

