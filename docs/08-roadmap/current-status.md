# Текущий статус

- Дата: 2026-07-18
- Текущая задача: ARCH-001 — техническая архитектура и ADR-002—ADR-010 созданы и проверены; задача готова к приёмке.
- Код приложения: отсутствует.
- Frontend/backend/миграции/бизнес-логика: не создавались.
- Тестовый сервер: ещё не настроен.
- AI-провайдер: не выбран.
- Следующая задача после приёмки ARCH-001 и отдельного подтверждения: **BOOT-001 — создание технического каркаса проекта**.

## Решения ARCH-001

- pnpm/TypeScript monorepo, Next.js/React PWA и NestJS modular monolith с отдельным worker.
- PostgreSQL — бизнес-истина; Redis — очередь/координация; private S3 — файлы.
- REST/OpenAPI, idempotency, operation resources и reconciliation `outcomeUnknown`.
- Cookie auth, refresh rotation, CSRF, ownership, admin MFA/RBAC/audit.
- Transactional outbox, repeatable jobs и single-server Docker test topology.
- AI Gateway/provider adapters без выбора AI-провайдера.

Код, зависимости, контейнеры и CI не создавались. Решения BOOT-001 и production перечислены в [backlog.md](backlog.md).
