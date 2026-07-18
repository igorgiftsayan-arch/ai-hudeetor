---
stepsCompleted: [1, 2, 3, 4, 5, 6]
workflowType: research
research_type: technical
research_topic: BOOT-000 engineering baseline V0.1
research_goals: Выбрать минимальный совместимый набор runtime, persistence, queue, auth, validation, API, testing, monorepo, PWA и test operations tooling без преждевременной сложности.
date: 2026-07-18
web_research_enabled: true
source_verification: true
---

# Engineering baseline V0.1

## Scope и метод

Исследование сравнивает актуальные официальные варианты по стабильности, совместимости, скорости MVP, удобству Codex, простоте эксплуатации и соответствию ARCH-001/ARCH-002. Не выбираются AI-провайдер и продуктовые функции; код, зависимости и инфраструктура не создаются.

## Technology Stack Analysis

### Programming Languages and runtime

Для V0.1 сохраняется единый TypeScript-контур. Baseline runtime — **Node.js 24.18.0 LTS** с диапазоном совместимости `>=24.18 <25`: ветка 24 находится в Maintenance LTS, тогда как Node.js 26 на дату исследования ещё является Current. Package manager — **pnpm 11.14.0**, фиксируемый полем `packageManager`; компилятор — **TypeScript 5.9.3**. TypeScript 6.0 уже выпущен, но содержит переходные и breaking changes, поэтому его принятие откладывается до отдельной проверки совместимости Next.js, NestJS и генераторов контрактов.

Прямые зависимости и инструменты BOOT-001 фиксируются точными версиями в manifest/lockfile; воспроизводимая установка использует frozen lockfile. Обновления выполняются отдельными задачами, а не неявно.

Источники: [Node.js release schedule](https://nodejs.org/en/about/previous-releases), [Node.js 24.18.0](https://nodejs.org/en/blog/release/v24.18.0), [pnpm installation](https://pnpm.io/installation), [pnpm 11.14.0](https://github.com/pnpm/pnpm/releases/tag/v11.14.0), [TypeScript 5.9](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html), [TypeScript 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

### Development Frameworks and Libraries

Приняты **Next.js 16.2.10**, **React/React DOM 19.2.7** и **NestJS 11.1.17**. Версии React и React DOM обязаны совпадать. Этот набор соответствует ранее принятому App Router frontend и NestJS modular monolith, сохраняет один язык между web/API/worker и не добавляет отдельный Python runtime. AI-провайдер и его SDK в baseline не выбираются.

Альтернативы Vue/Nuxt, FastAPI и Django повторно не принимаются: они не дают V0.1 преимущества, достаточного для второго языкового и инструментального контура. Python-компонент допускается позднее только для подтверждённой задачи, которую неудобно или невозможно поддерживать в TypeScript, и должен подключаться через документированный адаптер/контракт.

Источники: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Next.js 16.2](https://nextjs.org/blog/next-16-2), [React versions](https://react.dev/versions), [NestJS 11 migration guide](https://docs.nestjs.com/migration-guide), [NestJS 11.1.17](https://github.com/nestjs/nest/releases/tag/v11.1.17).

### Database and Storage Technologies

Для PostgreSQL выбран **Drizzle ORM + Drizzle Kit + node-postgres**. Причина — SQL-first модель, явные транзакции и savepoint, именованные constraints/indexes, reviewable SQL migrations и параметризованный SQL escape hatch. Для token ledger, payments, referrals, idempotency и outbox граница транзакции задаётся явно; PostgreSQL constraints остаются последней линией защиты. Row locking разрешён через проверенный параметризованный SQL (`SELECT ... FOR UPDATE`), когда ORM-выражение делает семантику менее очевидной.

Миграционный процесс: generate → обязательный review/редактирование SQL → commit → отдельный one-shot migrate. `drizzle-kit push` запрещён для общих и тестовых сред. Конкурентные критические сценарии проверяются integration tests на реальном PostgreSQL.

Рассмотренные альтернативы:

- **Prisma** имеет сильный generated-client DX, транзакции и raw SQL, но часть PostgreSQL constraints и locking всё равно переносится в custom SQL migrations/raw queries; для ledger-first домена это создаёт лишний разрыв между моделью и фактической схемой.
- **TypeORM** поддерживает QueryRunner, уровни изоляции, pessimistic locking и raw query, но entity/decorator/unit-of-work подход легче связывает домен с persistence и хуже подчёркивает критические транзакции.

Источники: [Drizzle overview](https://orm.drizzle.team/docs/overview), [transactions](https://orm.drizzle.team/docs/transactions), [indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints), [migrations](https://orm.drizzle.team/docs/migrations), [Prisma database features](https://docs.prisma.io/docs/orm/reference/database-features), [Prisma raw queries](https://docs.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries), [TypeORM transactions](https://typeorm.io/docs/advanced-topics/transactions/), [TypeORM QueryRunner](https://typeorm.io/docs/query-runner/).

### Queue and background processing

Для Redis-backed queue выбран **BullMQ** с официальной интеграцией `@nestjs/bullmq`. NestJS отмечает BullMQ как активно развиваемый вариант, тогда как Bull находится в maintenance mode. BullMQ покрывает retries/backoff, delayed jobs, stable job IDs, failed jobs, events и базовые metrics.

PostgreSQL transactional outbox остаётся долговечным источником намерения; Redis/BullMQ — только delivery-механизм. Доставка считается at-least-once, handlers обязаны быть идемпотентными. После ограниченного числа retry задача сохраняется как failed и создаётся явная прикладная dead-letter/reconciliation запись или очередь: BullMQ failed set не заменяет доменную сверку. В job payload передаются только минимальные идентификаторы, без PII, изображений и полного AI-контекста.

RabbitMQ/Kafka не принимаются из-за дополнительного runtime и несоответствия масштабу V0.1; database-only queue противоречила бы принятому Redis queue boundary. Flows, priorities, custom backoff и коммерческая observability BullMQ откладываются.

Источники: [NestJS queues](https://docs.nestjs.com/techniques/queues), [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [delayed jobs](https://docs.bullmq.io/guide/jobs/delayed), [metrics](https://docs.bullmq.io/guide/metrics), [idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs).

### Development Tools and Platforms

Monorepo использует **только pnpm workspace** и root scripts с recursive/filter commands. Turborepo и Nx не входят в V0.1: remote cache, affected graph и дополнительный project model пока не окупают настройку. Границы пакетов контролируются TypeScript references, import rules и tests. Повторное рассмотрение допускается при измеримой задержке build/test или устойчивой потребности запускать только затронутые проекты.

Источники: [pnpm workspaces](https://pnpm.io/workspaces), [Turborepo documentation](https://turborepo.com/docs), [Nx introduction](https://nx.dev/docs/getting-started/intro).

### Cloud Infrastructure and Deployment

Baseline не меняет single-server test architecture из ADR-010 и не выбирает cloud provider. Для BOOT-001 обязательны пять runtime-компонентов: `web`, `api`, `worker`, PostgreSQL и Redis. До теста с реальными пользователями также обязательны HTTPS/reverse proxy и безопасная конфигурация cookies. S3-compatible storage подключается перед первым сценарием с пользовательскими файлами; централизованные observability-сервисы и CI могут быть добавлены позже через заранее определённые точки интеграции.

Kubernetes, managed event streaming, data warehouse и отдельные базы модулей остаются вне V0.1.

### Technology Adoption Summary

Рекомендация оптимизирована под короткий путь до работающего вертикального сценария и небольшую команду: один runtime и package manager, один web framework, один backend framework, PostgreSQL как business truth и один Redis-backed worker contour. Самые консервативные решения — LTS Node.js и TypeScript 5.9; самые доменно значимые — SQL-first persistence и PostgreSQL-backed sessions/outbox. Уверенность высокая; точные package versions должны быть повторно проверены в день создания lockfile в BOOT-001 без автоматического перехода на новый major.

## Integration Patterns Analysis

### Persistence boundary

Drizzle используется только внутри `infrastructure` соответствующего backend-модуля. Domain и application слои не получают Drizzle schemas, query builders или database client. Один модуль не обращается к таблицам другого через чужой repository; межмодульная координация выполняется application use case с явной транзакционной границей.

Для ledger, payment state, referral reward, idempotency и outbox обязательны:

- одна PostgreSQL-транзакция для всех связанных изменений;
- `NOT NULL`, `CHECK`, `UNIQUE` и foreign keys с именами по project conventions;
- row locking либо atomic conditional update, выбранные явно по сценарию;
- уникальный business/idempotency key, предотвращающий повторный эффект;
- запись outbox в той же транзакции, что бизнес-изменение;
- parameterized SQL escape hatch, когда он точнее выражает locking или constraint-sensitive операцию.

Drizzle transaction API поддерживает вложенные savepoint, а schemas — PostgreSQL constraints/indexes. Drizzle Kit генерирует SQL migrations, которые проект обязан проверять до применения. Это соответствует требованиям ledger/outbox/idempotency при условии, что ORM не используется как замена проектированию транзакций. Источники: [transactions](https://orm.drizzle.team/docs/transactions), [indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints), [SQL operator](https://orm.drizzle.team/docs/sql), [migration overview](https://orm.drizzle.team/docs/migrations), [Drizzle Kit migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate).

### Authentication and session boundary

Принимается **project-owned authentication module**, а не Next.js auth и не внешний identity provider. NestJS `identity` module владеет регистрацией, password verification, sessions, refresh families, recovery tokens, logout и authorization context. Frontend только вызывает REST endpoints и не интерпретирует refresh state.

Реализация V0.1:

- opaque криптографически случайные access и refresh secrets передаются только в `HttpOnly`, `Secure`, `SameSite=Lax` cookies; содержимое не хранится в Web Storage;
- в PostgreSQL сохраняются только hashes secrets, session/family state, expiry, rotation lineage и revoke reason; Redis не является session store;
- access context живёт 15 минут, refresh family имеет абсолютный срок 30 дней; значения конфигурируемы, но ослабление требует security review;
- refresh token ротируется в транзакции при каждом использовании; reuse уже заменённого token отзывает всю family и требует повторного входа;
- unsafe requests требуют session-bound signed double-submit CSRF token и проходят Origin/Referer проверку; изменяющие GET запрещены;
- password hashing — **Argon2id** с параметрами не ниже текущего OWASP minimum и возможностью rehash после успешного входа;
- recovery token случайный, одноразовый, хранится как hash, действует 30 минут и инвалидирует активные refresh families после успешной смены пароля;
- доставка recovery link и admin MFA provider откладываются до feature-задачи, но recovery state machine и MFA boundary не переносятся во frontend.

NestJS Passport можно добавить только как transport helper для стратегии/guard; он не управляет rotation, reuse detection и session family. CSRF middleware — `csrf-csrf`, рекомендованный NestJS для Express; окончательный adapter сверяется с выбранным HTTP adapter в BOOT-001. Источники: [NestJS authentication](https://docs.nestjs.com/security/authentication), [Passport recipe](https://docs.nestjs.com/recipes/passport), [NestJS CSRF](https://docs.nestjs.com/security/csrf), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

### Validation and API contracts

- Backend transport DTO: NestJS global `ValidationPipe`, `class-validator` и `class-transformer`; включены `whitelist`, `forbidNonWhitelisted`, явный transform. Validation errors преобразуются в project error envelope и не раскрывают target/value.
- Frontend forms, runtime configuration и локальные schemas: **Zod**. Frontend schemas не становятся domain models и не содержат ORM definitions.
- OpenAPI: `@nestjs/swagger`, документ `/api/v1`; API-first source истины — фактические Nest controllers/DTO плюс проверяемая generated specification.
- Web client: **Orval** с генерацией typed native-fetch client в `packages/api-contracts`; generated files не редактируются вручную и не импортируют backend internals.
- Contract check: BOOT-001 добавляет generation/check script; CI позже запускает тот же script и отклоняет stale generated client или незадокументированное breaking change.

`packages/api-contracts` содержит только generated/hand-authored transport contracts и schemas. Он не содержит domain objects, business rules или ORM entities. Источники: [NestJS validation](https://docs.nestjs.com/techniques/validation), [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction), [Zod](https://zod.dev/), [Orval](https://orval.dev/docs/).

### Queue interoperability

API/application transaction создаёт outbox row; отдельный publisher доставляет стабильный `jobId`, производный от outbox ID, в BullMQ. Worker извлекает минимальный payload и вызывает application use case. Успех/ошибка job не изменяют бизнес-состояние напрямую в queue handler: изменение выполняет use case в PostgreSQL-транзакции. Redis deduplication помогает эксплуатации, но корректность обеспечивают idempotency record и constraints PostgreSQL.

В V0.1 используются bounded attempts, exponential backoff с jitter, timeout, failed retention, dead-letter/reconciliation и метрики waiting/active/delayed/failed/stalled, oldest-job age и outbox lag. Exactly-once delivery не обещается.

## Architectural Patterns and Design

### System and data boundaries

Engineering baseline сохраняет modular monolith: один deployable API, один worker из общей backend-кодовой базы и один PostgreSQL cluster. Выбор конкретных libraries не меняет границы ADR-002—ADR-010. Drizzle schemas находятся в infrastructure, BullMQ processors — в worker transport/composition contour, auth state — в identity module, OpenAPI DTO — в transport/api-contracts.

### Security architecture

Cookie sessions, CSRF, password hashing, recovery и RBAC реализуются backend-модулем с default-deny. Любой endpoint проверяет authentication и ownership/permission независимо от frontend route guard. Cookie и CSRF параметры одинаково применяются к user/admin routes; admin MFA остаётся обязательным до включения административных операций реальным пользователям.

### Deployment and operations boundary

Single-server topology не означает смешивание процессов: web, API и worker имеют отдельные process/container boundaries, health checks и structured logs. PostgreSQL и Redis не публикуются в интернет. S3 adapter существует как архитектурная точка, но фактический storage component добавляется перед первым upload-сценарием.

## Implementation Approaches and Technology Adoption

### Testing baseline

| Область | Инструмент | Минимум BOOT-001 |
|---|---|---|
| Backend unit | Jest + Nest `TestingModule` | runner/config и один smoke unit test без БД |
| Backend HTTP | Jest + Supertest | API bootstrap/health и error-envelope test |
| Backend integration/database | Jest, реальный PostgreSQL | harness для migrations/rollback/isolation; критические ledger/idempotency tests не используют mock DB |
| Queue integration | Jest, реальный Redis | добавляется вместе с первой background job; outbox publisher/handler repeatability обязательны |
| Frontend unit/component | Vitest + React Testing Library + user-event + jsdom | render/config и один доступный interaction smoke test |
| E2E | Playwright | web→API health/bootstrap smoke; первый product flow добавляется feature-задачей |

Async React Server Components преимущественно проверяются E2E, а не искусственным component harness. Playwright по умолчанию запускает Chromium/mobile viewport; WebKit и Firefox обязательны перед пользовательской приёмкой критического flow. Auth storage state и test credentials не коммитятся. Источники: [NestJS testing](https://docs.nestjs.com/fundamentals/testing), [Next.js testing guides](https://nextjs.org/docs/app/guides/testing), [Vitest](https://vitest.dev/guide/), [Testing Library](https://testing-library.com/docs/react-testing-library/intro/), [Playwright](https://playwright.dev/docs/intro), [Playwright best practices](https://playwright.dev/docs/best-practices).

### PWA baseline

Next.js App Router предоставляет manifest через `app/manifest.ts`; BOOT-001 создаёт manifest metadata, installable icons и минимальный explicit service worker. Стратегия — **network-first**, не offline-first:

- Cache Storage содержит только versioned same-origin app shell, icons и безопасную статическую выдачу;
- navigation сначала обращается к сети и только при отсутствии сети показывает простой offline fallback;
- auth/API/AI/token balance/admin responses, user images, signed URLs и персональные данные не кешируются service worker;
- service worker file отдаётся с `Cache-Control: no-cache, no-store` и обновляется версионно;
- background sync, push notifications и offline drafts не входят в BOOT-001.

Serwist не принимается на старте: официальный Next.js guide указывает дополнительную webpack-конфигурацию, а V0.1 не нуждается в расширенном precache/runtime caching. Источник: [Next.js Progressive Web Apps guide](https://nextjs.org/docs/app/guides/progressive-web-apps).

### Secrets and configuration

- Имена переменных — `UPPER_SNAKE_CASE`, с префиксом по внешней системе при необходимости; публичные browser values получают `NEXT_PUBLIC_` только после security review.
- `.env.example` хранит только имена и безопасные комментарии. `.env.local`, `.env.test.local` и server secrets игнорируются Git.
- Local и test используют разные credentials, database names, cookie domains и encryption/signing keys.
- Test-server secrets хранятся вне checkout в защищённом environment file/secret injection с минимальными file permissions; полноценный secret manager отложен.
- Все процессы валидируют обязательную конфигурацию при старте через Zod schema и завершаются с безопасной ошибкой без значения секрета.
- Lockfile обязателен; install scripts и новые dependencies проходят review. Секреты нельзя передавать через build args или логировать.

### Logging and error handling

Минимум — встроенный NestJS `ConsoleLogger` в JSON mode и stdout/stderr, без внешнего logging vendor. Middleware принимает доверенный формат либо создаёт `requestId`, возвращает его клиенту и распространяет через AsyncLocalStorage в use case, outbox и job correlation.

Обязательные поля: timestamp, level, service, environment, requestId/correlationId, route template, status, latency и project error code. Запрещено логировать raw DTO, cookies, authorization headers, passwords, email/идентификаторы без необходимости, signed URLs, изображения, полный prompt/AI response. Unexpected exceptions преобразуются в безопасный error envelope; stack trace доступен только server-side. Источник: [NestJS logger](https://docs.nestjs.com/techniques/logger).

### PostgreSQL backup baseline

- Ночной logical backup `pg_dump -Fc`.
- Backup шифруется и хранится вне test server; retention — 7 ежедневных копий.
- Контролируются freshness, размер и результат команды; failure создаёт операционный alert/issue.
- Restore drill выполняется перед первым тестом с реальными пользователями, затем ежемесячно и после существенного изменения backup/migration процесса.
- Восстановление идёт в одноразовую БД через `pg_restore --single-transaction --exit-on-error`, после чего выполняются migrations, health и smoke checks.
- Первоначальная цель: RPO до 24 часов; RTO измеряется первым restore drill. Backup обязателен перед рискованной миграцией.

WAL/PITR откладывается до production либо требования RPO меньше суток. Источники: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html), [continuous archiving/PITR](https://www.postgresql.org/docs/current/continuous-archiving.html).

## Final decisions

| Область | Решение V0.1 |
|---|---|
| Runtime | Node.js 24.18.0 LTS, pnpm 11.14.0, TypeScript 5.9.3 |
| Frontend | Next.js 16.2.10, React/React DOM 19.2.7, App Router |
| Backend | NestJS 11.1.17, API и отдельный worker composition roots |
| Persistence | Drizzle ORM/Kit + node-postgres; reviewed SQL migrations |
| Queue | BullMQ + `@nestjs/bullmq`, PostgreSQL outbox как durable truth |
| Auth | project-owned opaque cookie sessions в PostgreSQL, rotation/reuse detection, `csrf-csrf`, Argon2id |
| Validation | Nest ValidationPipe/class-validator; Zod для web/config |
| API contracts | Nest Swagger/OpenAPI + Orval native-fetch client |
| Tests | Jest/Supertest, real PostgreSQL integration, Vitest/RTL, Playwright |
| Monorepo | pnpm workspace без Nx/Turborepo |
| PWA | native manifest + minimal service worker, network-first safe cache |
| Logging | Nest structured JSON stdout + request/correlation ID, PII denylist/allowlist |
| Backup | nightly encrypted off-host `pg_dump -Fc`, 7 daily, restore drills |

## Alternatives considered

Отклонены на V0.1: Prisma и TypeORM; Bull/RabbitMQ/Kafka/database-only queue; Auth.js как Next-owned auth, внешний identity provider и Redis sessions; shared domain/ORM contracts; hand-written REST client; Nx/Turborepo; Serwist/offline-first; отдельный logging/observability vendor; WAL/PITR. Причина едина: дополнительные границы или скрытая сложность без доказанной пользы первому вертикальному сценарию. Возврат к варианту допускается только по измеримому ограничению baseline и оформляется ADR.

## Compatibility notes

- TypeScript 6.0 не смешивается с baseline до отдельного compatibility spike.
- Next.js, React и React DOM фиксируются совместимым комплектом; React packages имеют одну версию.
- NestJS packages фиксируются одной minor/patch family.
- `@nestjs/bullmq` и BullMQ проверяются integration smoke test с выбранной Redis major в BOOT-001; Redis major фиксируется после проверки container/runtime support.
- Drizzle/Kit/driver фиксируются совместимым комплектом и проверяются на clean database: migrate up, schema constraints, transaction rollback и locking concurrency.
- `csrf-csrf` применяется при Express adapter; смена HTTP adapter требует повторной проверки middleware.
- Generated OpenAPI client не пересекает server-only Next.js/NestJS modules и компилируется как browser-safe package.

## BOOT-001 prerequisites

BOOT-001 получает следующие обязательные входные данные:

1. Создать только утверждённые `apps/*`, `packages/*`, `database/*`, `tests/*` boundaries из repository structure.
2. Зафиксировать exact versions и lockfile; перед установкой повторно подтвердить доступность patch versions без перехода на новый major.
3. Настроить pnpm workspace без task runner.
4. Создать composition roots web/API/worker без бизнес-логики и без product feature modules-заглушек.
5. Подключить Drizzle migration skeleton; запретить schema push общих сред.
6. Создать Redis/BullMQ connection boundary и health/readiness contract; первая реальная queue/outbox logic появляется вместе с вертикальным feature slice.
7. Создать configuration schemas, `.env.example`, secret-safe defaults и startup validation.
8. Настроить REST `/api/v1`, error envelope, request ID, JSON logging, OpenAPI generation и Orval contract check.
9. Настроить Jest/Supertest, Vitest/RTL и Playwright smoke harness; integration harness использует реальные PostgreSQL/Redis.
10. Добавить manifest, icons placeholders/assets и минимальный безопасный service worker без offline product data.
11. Подготовить test topology web/API/worker/PostgreSQL/Redis; HTTPS/reverse proxy обязателен до реальных пользователей.
12. Документировать backup/restore commands и smoke checklist; фактический scheduled backup включается при развёртывании test database.

BOOT-001 не реализует регистрацию, sessions, ledger, outbox или AI Gateway business flows, если их реализация не включена отдельной задачей. Он создаёт только проверяемые technical seams и tooling baseline.

## Deferred decisions

- Redis exact major и connection/persistence tuning — BOOT-001 compatibility check.
- Конкретные cookie names, домены и production TTL override — auth feature/configuration task; безопасные defaults заданы выше.
- Recovery delivery provider и email/SMS transport.
- Admin MFA implementation/provider до включения admin для реальных операторов.
- Payment provider и AI provider.
- S3 vendor/endpoint и malware scanning implementation до upload feature; private-storage boundary уже обязателен.
- React Query hooks generation — только при подтверждённой потребности; native-fetch client является baseline.
- Turborepo/Nx, remote cache и affected graph — после измеримой проблемы.
- Serwist, push, background sync и offline drafts.
- Centralized error tracking/log aggregation/metrics vendor; integration points остаются в structured logs/health endpoints.
- WAL archiving/PITR и production HA.
- CI provider и pipeline implementation; BOOT-001 создаёт локально воспроизводимые команды, но не CI.

## Research conclusion

Baseline принят **без блокирующих ограничений**. Он соответствует modular monolith, PostgreSQL business truth, outbox, idempotent jobs, private file boundary и REST-only frontend. Главный операционный риск — не выбранные инструменты, а обход их ограничений: auto-push схемы, скрытые ORM-транзакции, Redis как truth, хранение auth state во frontend и caching персональных ответов service worker. Эти действия прямо запрещены данным документом и AGENTS.md.

Следующая допустимая задача — BOOT-001 после отдельного подтверждения. Этот документ не запускает создание проекта.
