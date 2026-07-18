# Технологический стек V1

## Принято

| Область | Решение | Основание |
|---|---|---|
| Monorepo | pnpm workspace, TypeScript | [ADR-002](architecture-decisions/ADR-002-technical-stack.md) |
| Frontend | Next.js + React + TypeScript, App Router | [ADR-003](architecture-decisions/ADR-003-frontend-framework.md) |
| Backend | NestJS + TypeScript modular monolith | [ADR-004](architecture-decisions/ADR-004-backend-framework.md) |
| Worker | отдельный NestJS runtime общей кодовой базы | [ADR-008](architecture-decisions/ADR-008-background-jobs.md) |
| Database | PostgreSQL | [ADR-005](architecture-decisions/ADR-005-database.md) |
| Queue/cache | Redis, не источник бизнес-истины | [ADR-008](architecture-decisions/ADR-008-background-jobs.md) |
| Files | private S3-compatible storage | [ADR-009](architecture-decisions/ADR-009-file-storage.md) |
| API | REST JSON + OpenAPI `/api/v1` | [ADR-007](architecture-decisions/ADR-007-api-style.md) |
| Auth | cookie sessions, refresh rotation, CSRF, RBAC/MFA | [ADR-006](architecture-decisions/ADR-006-authentication.md) |
| Test deployment | Docker containers на single server | [ADR-010](architecture-decisions/ADR-010-deployment.md) |

## Не выбрано в ARCH-001

Точные версии, ORM/migration tool, queue/PWA/form/query/testing libraries, task runner, CI/observability/S3/payment/analytics providers и AI-провайдер. Эти решения принадлежат BOOT-001 или отдельным задачам в пределах ADR.

## Исключено для V1

Микросервисы, Kubernetes, Kafka, CQRS/event sourcing, отдельные БД модулей, vector database и data warehouse.
