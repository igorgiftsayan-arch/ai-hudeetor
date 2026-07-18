# ADR-008: background jobs и надёжная доставка

- Статус: принято
- Дата: 2026-07-18

## Решение

Отдельный worker общей NestJS-кодовой базы обрабатывает Redis-backed queue. PostgreSQL outbox надёжно инициирует jobs/события. Delivery at least once; каждый handler идемпотентен и вызывает application use case.

Фоновые сценарии V1: AI и изображения, отчёты, уведомления, реферальная проверка, outbox delivery, удаление данных/файлов и reconciliation зависших операций.

## Правила

- Job envelope версионируется и содержит идентификаторы, не полный AI-контекст, изображения или секреты.
- Ограничены timeout, attempts, exponential backoff/jitter и concurrency.
- Исчерпанные retries переходят в dead-letter/quarantine с алертом и reconciliation.
- Worker имеет отдельную service identity, graceful shutdown и heartbeat.
- Redis-loss не теряет подтверждённый бизнес-факт; восстановление опирается на PostgreSQL/outbox.

## Последствия

Queue library — BullMQ с официальной NestJS integration `@nestjs/bullmq`. PostgreSQL outbox остаётся durable truth, stable BullMQ job ID выводится из outbox ID, а correctness обеспечивают PostgreSQL idempotency/constraints. Retry thresholds, concurrency и schedules выбираются feature-задачами. Kafka, workflow engine и exactly-once transport не используются.
