# ADR-005: PostgreSQL как источник бизнес-истины

- Статус: принято
- Дата: 2026-07-18

## Решение

PostgreSQL хранит операционное состояние, token ledger, payment/referral/AI operation state, prompt versions, audit и transactional outbox. `TokenWallet` — быстрая проекция; append-only `TokenTransaction` — история и основание сверки. Analytics не управляет доменом.

## Инварианты

Constraints и уникальные business keys защищают неотрицательный баланс, однократные начисления, одного inviter, webhook/event deduplication, idempotency и допустимые terminal transitions. Деньги и токены — integer.

Outbox записывается в одной транзакции с бизнес-изменением и доставляется at least once. Consumers идемпотентны. Redis не заменяет outbox или ledger.

## Миграции и удаление

`database/migrations` — единственный способ менять схему; auto-migrate при старте запрещён. Рискованные изменения выполняются expand → migrate/backfill → contract. Application rollback не означает schema rollback.

Soft delete применяется только для продуктового восстановления и workflow; privacy-удаление физически удаляет или необратимо обезличивает данные. Финансовый/audit минимум сохраняется отдельно по политике.

## Последствия

ORM и migration tool выбираются в BOOT-001 по поддержке транзакций, row locks, constraints, raw SQL и reproducible migrations. Read replicas, sharding, partitioning и warehouse отложены.
