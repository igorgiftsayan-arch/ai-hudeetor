# ADR-007: REST API и асинхронные операции

- Статус: принято
- Дата: 2026-07-18

## Решение

Публичный backend контракт — REST JSON под `/api/v1`, документированный OpenAPI. Одиночный success возвращает ресурс напрямую; ошибки используют единый envelope. Списки используют cursor pagination. JSON — camelCase, время — ISO 8601 UTC.

Критические POST/mutations принимают idempotency key. Повтор того же ключа и payload возвращает исходный результат; другой payload — `409 Conflict`.

## Async operations

Длительные AI/медиа-команды возвращают `202 Accepted` и operation resource с polling endpoint. Lifecycle включает `pending`, `reserved`, `processing`, `succeeded`, `technicalFailed`, `outcomeUnknown`, `refundPending`, `refunded`, `cancelled` там, где переход допустим.

Для AI operation VERT-001.5 канонический lifecycle: `queued`, `processing`, `succeeded`, `technicalError`, `outcomeUnknown`. Reservation, confirmation и refund — ledger effects, а не operation statuses. `outcomeUnknown` используется, когда после внешнего timeout неизвестно, был ли вызов выполнен; слепой retry и окончательное списание запрещены до reconciliation.

## Последствия

Streaming, GraphQL и WebSocket не входят в V1. BOOT-000 выбирает Nest `@nestjs/swagger` для OpenAPI и Orval для browser-safe native-fetch client generation в `packages/api-contracts`. Generated contracts не редактируются вручную; generation/check должен выявлять stale client. Точные operation TTL/UX выбираются feature-задачами.
