# Архитектура развёртывания

ARCH-001 описывает, но не создаёт инфраструктуру. Решение — [ADR-010](architecture-decisions/ADR-010-deployment.md).

```mermaid
flowchart TB
  Internet --> RP["Reverse proxy / HTTPS"]
  RP --> Web["Next.js web"]
  RP --> API["NestJS API"]
  API --> PG["PostgreSQL"]
  API --> Redis["Redis"]
  API --> S3["Private S3"]
  Worker["NestJS worker"] --> PG
  Worker --> Redis
  Worker --> S3
  Worker --> AI["AI provider adapter: TBD"]
  Web --> API
```

Test использует single server и отдельные Docker containers: reverse proxy, web, API, worker, PostgreSQL, Redis и при self-hosted варианте S3. Внешний S3 допустим. Внутренние порты не публичны; секреты runtime-only.

## Delivery flow

CI: frozen install → lint/typecheck/tests → migration/security/build checks → immutable images с тегом `commit SHA`. Deployment: подтверждение → backup при риске → одноразовая migration → rollout API/worker/web → readiness → smoke. API/worker всегда одного commit SHA.

Application rollback активирует предыдущие образы, совместимые с expand/contract schema. Data restore выполняется runbook. Backup PostgreSQL/S3 шифруется, хранится отдельно и проходит restore drill.

Dockerfiles, compose, pipeline и реальный сервер принадлежат BOOT/deployment-задачам.
