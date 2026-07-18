# ADR-007: REST API и асинхронные операции

- Статус: принято
- Дата: 2026-07-18

## Решение

Публичный backend контракт — REST JSON под `/api/v1`, документированный OpenAPI. Одиночный success возвращает ресурс напрямую; ошибки используют единый envelope. Списки используют cursor pagination. JSON — camelCase, время — ISO 8601 UTC.

Критические POST/mutations принимают idempotency key. Повтор того же ключа и payload возвращает исходный результат; другой payload — `409 Conflict`.

## Async operations

Длительные AI/медиа-команды возвращают `202 Accepted` и operation resource с polling endpoint. Lifecycle включает `pending`, `reserved`, `processing`, `succeeded`, `technicalFailed`, `outcomeUnknown`, `refundPending`, `refunded`, `cancelled` там, где переход допустим.

`outcomeUnknown` используется, когда после внешнего timeout неизвестно, был ли вызов выполнен. Слепой retry и окончательное списание запрещены; worker выполняет reconciliation, а конечная политика не оставляет резерв бессрочно.

## Последствия

Streaming, GraphQL и WebSocket не входят в V1. OpenAPI client generation tool и точные operation TTL/UX выбираются в BOOT/feature-задачах.
