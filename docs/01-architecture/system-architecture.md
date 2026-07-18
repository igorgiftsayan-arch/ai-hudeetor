---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - AGENTS.md
  - docs/**/*.md
  - docs/01-architecture/architecture-decisions/ADR-001-monorepository.md
  - docs/01-architecture/architecture-decisions/ADR-002-technical-stack.md
workflowType: architecture
project_name: AI-друг для похудения
date: 2026-07-18
lastStep: 8
status: complete
completedAt: 2026-07-18
---

# Техническая архитектура V1

Документ формируется в ARCH-001 на основе всей подтверждённой документации проекта. Отдельный `project-context.md` не создаётся: роль контекста выполняют `AGENTS.md` и каталог `docs/`.

## Анализ контекста проекта

### Объём требований

V1 охватывает регистрацию и онбординг, профиль и наблюдения, AI-компаньона, анализ еды, меню и покупки, токены и платежи, рефералы, аналитику, контент и администрирование. Основные нефункциональные требования: изоляция данных, транзакционность, идемпотентность, privacy, AI safety, аудит, сменяемость внешних поставщиков и наблюдаемость стоимости AI.

Проект имеет средне-высокую архитектурную сложность из-за денежных и токенных инвариантов, асинхронных AI/медиа-операций и чувствительных пользовательских данных, но не требует распределённой архитектуры в V1.

### Принятые принципы V1

- Mobile-first network-first PWA с защищённой административной областью.
- Backend — модульный монолит; API и worker запускаются отдельными процессами общей кодовой базы.
- PostgreSQL — источник бизнес-истины; Redis — очереди и координация; S3-совместимое хранилище — приватные файлы.
- AI Gateway и адаптеры изолируют внешних поставщиков, но не содержат продуктовых правил.
- Токенная экономика находится в доменном слое; баланс и история подтверждаются ledger, а не аналитикой.
- Финансовые, токенные и реферальные эффекты идемпотентны и защищены ограничениями PostgreSQL.
- Transactional outbox связывает бизнес-транзакции с повторяемыми jobs и доставкой событий.
- Административные действия аудируются; доступ granular и deny-by-default.
- Логи минимизируют PII и не содержат полный AI-контент по умолчанию.
- Offline-first не является целью V1; критические операции требуют сети.

### Исключённая преждевременная сложность

В V1 не применяются микросервисы, Kubernetes, Kafka, CQRS/event sourcing, отдельные БД модулей, vector database и data warehouse.

### Сквозные риски

- `outcome_unknown` при неопределённом результате внешнего AI-вызова требует reconciliation.
- Privacy-удаление конфликтует с обязательным финансовым и административным аудитом.
- AI quality logging конфликтует с минимизацией чувствительных данных.
- Отсутствие UX-спецификации создаёт риск переработки потоков AI, изображений, доступности и админки.
- Возможности PWA не означают безопасное offline-выполнение серверно-авторитетных операций.
- Административная роль требует granular permissions и усиленной аутентификации.
- Отсутствие исследований ограничивает нагрузочные предположения рамками MVP.

Эти риски не блокируют архитектуру, но должны быть отражены в ADR и последующих задачах.

## Оценка starter-подхода

### Основной технологический домен

Full-stack web application: mobile-first PWA, REST API, асинхронный worker и операционные хранилища.

### Рассмотренные основы

- Next.js + NestJS в едином TypeScript workspace.
- React/Vite + FastAPI с TypeScript/Python.
- Nuxt + NestJS в TypeScript.
- React + Django.

По критериям скорости MVP, сопровождения малым составом, удобства Codex, найма и зрелости выбран единый TypeScript-контур. Преимущество Python для AI не является решающим: V1 оркестрирует внешние AI-возможности и не содержит собственных ML/CV workloads.

### Выбранная основа

- `pnpm workspace` как монорепозиторий.
- Next.js + React + TypeScript, App Router — `apps/web`.
- NestJS + TypeScript — общий backend-код для `apps/api` и `apps/worker`.
- Официальные starters используются только в BOOT-001; готовый full-stack boilerplate не применяется, поскольку преждевременно выбирает auth, ORM и deployment.

Точные версии, команды, task runner, ORM, queue/PWA/form/query/testing libraries выбираются и закрепляются в BOOT-001 в пределах ADR.

## Ключевые архитектурные решения

### Блокируют реализацию

- TypeScript-монорепозиторий: pnpm, Next.js/React frontend, NestJS API и worker.
- PostgreSQL — бизнес-истина; Redis — неавторитетная очередь/координация; файлы — private S3.
- REST/OpenAPI, версионирование `/api/v1`, единый error envelope и idempotency.
- Cookie-based browser authentication, refresh rotation, CSRF, ownership checks и admin MFA/RBAC.
- Асинхронные AI/медиа-операции, transactional outbox, повторяемые jobs и reconciliation.
- Single-server containerized test environment с immutable artifacts, отдельными миграциями, backup и smoke test.

### Существенные границы

- Frontend не содержит доменных правил, не обращается к хранилищам и не становится вторым backend.
- Backend модули публикуют application interfaces и не импортируют чужие repositories/ORM entities.
- AI Gateway изолирует capabilities поставщика, но не решает auth, цену, токены, рефералы или retention.
- Баланс, платежи, рефералы, audit и outbox защищаются транзакциями и ограничениями PostgreSQL.
- Redis и очередь допускают потерю/повтор доставки без потери подтверждённого бизнес-состояния.

### Отложено

До BOOT-001 отложены версии и конкретные библиотеки, ORM/migration tool, queue library, PWA tooling, form/query/test tooling, CI provider и S3 implementation. До отдельных решений отложены AI-провайдер, production topology, streaming, vector search и Python AI-service.

### Последовательность реализации

BOOT-001 создаёт только каркас и проверяемые границы. Последующие задачи реализуют вертикальные сценарии в порядке roadmap; инфраструктурная сложность добавляется только при действующем требовании V1.

## Implementation patterns и правила согласованности

### Naming

- PostgreSQL: `snake_case`, множественные имена таблиц, FK `<entity>_id`, индексы `idx_<table>_<columns>`, unique constraints `uq_<table>_<purpose>`.
- TypeScript: `camelCase` для значений/функций, `PascalCase` для типов/компонентов, `kebab-case` для файлов.
- REST resources — множественное число; JSON — `camelCase`.
- Product analytics сохраняет утверждённый `snake_case`; внутренние события — `<domain>.<event>.v1`.

### Структура backend

Backend организован по доменным модулям. Внутри каждого: `domain`, `application`, `infrastructure`, `transport`. Глобальная раскладка по `controllers/services/repositories` запрещена. API и worker имеют разные composition roots и общие application/domain modules. Shared packages не содержат бизнес-логику или ORM entities.

### Контракты

- Одиночный успешный ответ возвращается без оболочки `data`; ошибки используют единый `error` envelope.
- Время — ISO 8601 UTC, timezone пользователя хранится отдельно.
- Деньги и токены — только integer.
- Асинхронная команда возвращает `202 Accepted` с operation resource.
- Повтор idempotency key с иным payload возвращает `409 Conflict`.
- Event/job payload минимален; delivery at least once, handlers идемпотентны, исчерпанные retries переходят в dead-letter/reconciliation.

### Frontend

Server, session, UI и draft state разделены. Критические операции не используют optimistic update. Feature modules не импортируют внутренности друг друга. Admin имеет отдельные routes, permissions и API operations при общих UI primitives. Offline cache ограничен app shell и безопасной статикой.

### Enforcement

Реализация начинается с application use case и явной транзакционной границы. Запрещены imports чужих repositories, обход NestJS API через Next.js и использование Redis как бизнес-истины. Критические операции требуют idempotency и DB constraints. Архитектурное отклонение оформляется ADR до реализации.

## Структура проекта и границы

Монорепозиторий разделён на `apps/`, `packages/`, `database/`, `tests/`, `infrastructure/`, `scripts/` и `docs/`.

- `apps/web` — frontend; `apps/api` и `apps/worker` — только разные composition roots. Бизнес-логика в `apps/*` запрещена.
- `packages/backend` содержит доменные модули identity, profiles, tracking, ai-companion, food, planning, token-economy, payments, referrals, content, notifications, analytics, files и administration.
- Каждый backend-модуль содержит `domain/`, `application/`, `infrastructure/`, `transport/`; domain не зависит от infrastructure, а один модуль не импортирует infrastructure другого.
- `packages/api-contracts` содержит только API DTO/схемы/типы, без ORM, доменных объектов и правил.
- `database/migrations` — единственный источник изменений схемы; `database/seeds` — только test fixtures.
- Unit tests находятся рядом с кодом; integration, contract и E2E — в корневом `tests/`.
- Runtime filesystem не хранит пользовательские файлы; они находятся только в приватном S3.
- `infrastructure/` является будущим deployment-контуром и не создаётся содержательно в ARCH-001.

Полное дерево и карта требований находятся в [repository-structure.md](repository-structure.md).

## Результаты валидации архитектуры

### Согласованность

Стек, patterns и структура совместимы: Next.js не дублирует backend, NestJS composition отделён от домена, PostgreSQL обеспечивает инварианты, Redis/S3 остаются инфраструктурными границами. Naming, REST/JSON/event conventions единообразны во всех документах.

### Покрытие требований

Все области V1 отображены на frontend/backend modules. Token/payment/referral correctness покрыты ledger, idempotency и constraints; AI — Gateway, prompt/context/safety/cost и async lifecycle; privacy/security — ownership, auth, private files, audit и deletion; эксплуатация — test topology, migrations, backup, health и observability.

### Готовность к BOOT-001

Критических архитектурных пробелов нет. BOOT-001 может создать каркас, не принимая продуктовых решений. Она обязана выбрать совместимые версии и конкретное tooling в пределах ADR, но не выбирает AI-провайдера и не реализует бизнес-функции.

### Известные неблокирующие риски

- UX-спецификация и исследования отсутствуют.
- Канал password recovery и конкретные библиотеки не выбраны.
- RPO/RTO и production topology отложены.
- `outcomeUnknown`, deletion workflow и admin permissions требуют негативных integration tests при реализации.

**Статус:** ARCH-001 архитектурно согласована и готова к приёмке. Переход к BOOT-001 — только после отдельного подтверждения.
