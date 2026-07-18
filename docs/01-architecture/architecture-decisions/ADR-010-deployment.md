# ADR-010: test deployment и эксплуатация

- Статус: принято
- Дата: 2026-07-18

## Решение

Test environment разворачивается на одном сервере как осознанный MVP-компромисс: reverse proxy/HTTPS, web, API, worker, PostgreSQL, Redis, S3-compatible storage, observability и backup. Каждый runtime — отдельный Docker container; API и worker запускаются из одного backend image разными командами.

Образы immutable, собираются CI один раз и маркируются commit SHA. Deployment использует проверенные artifacts, не сборку на сервере. Миграция запускается отдельным однократным job до совместимого rollout; API не auto-migrate.

## Flow и rollback

CI выполняет lint/typecheck/tests/build, migration и security checks, затем builds. Test deployment требует подтверждения, backup для рискованной миграции, readiness и smoke test. Application rollback активирует предыдущие образы; data restore — отдельный runbook, не обычный rollback.

Backup PostgreSQL/S3 шифруется и хранится отдельно от сервера; restore регулярно проверяется. Redis не является источником истины.

## Наблюдаемость и безопасность

Структурированные логи, error tracking, metrics, liveness/readiness, queue/AI cost/latency и backup freshness обязательны. Секреты передаются runtime, containers non-root, внутренние порты не публичны. Lockfile frozen; CI включает secret/dependency/container scanning и SBOM.

## Последствия

Single server — единая точка отказа, допустимая только для test. Dockerfiles, compose, CI provider, registry, concrete tooling, resource limits, RPO/RTO и runbooks создаются в BOOT/deployment-задачах. Kubernetes и production topology не выбираются.
