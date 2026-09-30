# Pre-production runtime verification — registration backend

Дата: 2026-09-30. Branch: `back/production-readiness-signup`. Проверенный source commit: `eb9abd27a88f9e3df08aa2cd5a72e944df7fd6cb`.

## Окружение

- Изолированный Compose project: `atlas-production-readiness`.
- Stable и другие Compose projects не изменялись и не запускались этой проверкой.
- Runtime env хранится вне checkout, owner `root:root`, mode `600`; значения секретов не выводились и не документировались.
- Exact API image: `sha256:a61a51d5e34e6fa23c7508804a01962a1aaa2f59aadacbfe6ea7fec51fccae14`.
- Node.js 24.18.0 внутри image; PostgreSQL 17 и Redis 8 в private Compose network, без host ports.

## Проверки

- Production Compose overlay успешно проходит `docker compose config --quiet`.
- В migration image подтверждены SQL migrations `0000–0011` и Drizzle journal.
- Migrator выполнен дважды; оба запуска успешны. В `drizzle.__drizzle_migrations` 12 записей, ожидаемые core tables присутствуют.
- PostgreSQL focused integration: `identity`, `daily state` и `daily weight` — 3 suites, 17/17 tests.
- Exact-image API regression с PostgreSQL: 16/16 suites, 82/82 tests. Exact-image worker regression: 7/7 suites, 32/32 tests. Lint и root typecheck внутри Node.js 24 image завершились с exit `0`.
- Local regression перед commit: web 32/32, worker 32/32, API 46/46; lint, typecheck и production build завершились с exit `0`.
- Exact-image backend journey прошёл: trusted-origin registration → profile → persona → completion → wallet → Daily Coach `notStarted → inProgress → completed` → повторный login → refresh.
- Completion replay сохранил один starter grant и баланс 100. PostgreSQL max-count checks подтвердили одну starter-grant transaction на пользователя и одну daily-state row на owner/local date.
- Registration без Origin и с чужим Origin вернула `403`; шестая попытка при лимите 5 вернула `429 RATE_LIMITED` через реальный Redis.
- API logs: 0 совпадений синтетического email prefix, test password, cookie names и CSRF header name.
- После server reboot изолированные PostgreSQL, Redis и API повторно запущены из существующих images/volumes и достигли `healthy`; image container совпадает с собранным digest.
- Custom-format PostgreSQL backup создан с mode `600` (55 972 bytes), `pg_restore --list` прочитан успешно. Backup восстановлен в отдельный PostgreSQL 17 на `tmpfs`; подтверждены 12 Drizzle migrations и пять ожидаемых core tables. Временный restore-container удалён, исходный volume не изменялся.

Первый запуск полного API suite с production env ожидаемо нарушил test fixtures (`http://localhost:3000`/`test-v1`), а следующий был прерван server reboot. После восстановления сервера suite повторён в том же exact image с test-only configuration overrides и завершён полностью: 82/82. Runtime application продолжил использовать production configuration; test overrides применялись только к одноразовому test process.

## Итог

Backend и production configuration boundary готовы для изолированного pre-production API testing. Публичный production signup — **NO-GO** до закрытия следующих блокеров:

1. Реальный registration/onboarding frontend отсутствует; browser E2E невозможен.
2. Не выбраны email ownership verification и anti-abuse policy. До этого допустимы только named synthetic testers за access control.
3. Production domain, DNS, certificate и host-Nginx server block не утверждены и не применялись.
4. Технический isolated backup/restore drill выполнен, но production RPO/RTO, schedule, off-host storage, encryption и retention не утверждены.
5. Consent/legal document versions в runtime были test-only; опубликованные production versions не предоставлены.

DNS, production deploy, stable, `main` и frontend не изменялись.
