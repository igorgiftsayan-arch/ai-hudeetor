# Текущий статус

- Дата: 2026-07-18
- Текущая задача: ARCH-002 — acceptance review завершён с вердиктом «принять с ограничениями»; задача готова к приёмке.
- Код приложения: отсутствует.
- Frontend/backend/миграции/бизнес-логика: не создавались.
- Тестовый сервер: ещё не настроен.
- AI-провайдер: не выбран.
- Следующая задача после приёмки ARCH-002 и отдельного подтверждения: **BOOT-001 — создание технического каркаса проекта**.

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
