# ARCH-002: acceptance review архитектуры

- Дата: 2026-07-18
- Проверено: MVP, product engineering, backend, frontend, DevOps и security perspectives
- Вердикт: **принять с ограничениями**

## 1. Вердикт

ARCH-001 достаточна для BOOT-001 и главного вертикального сценария V0.1. ADR-002—ADR-010 изменять не требуется. Архитектура не является чрезмерной, если реализуется инкрементально: границы будущих модулей остаются документами, а код, interfaces и инфраструктура появляются только вместе с действующим сценарием.

Не подлежат упрощению: PostgreSQL как бизнес-истина, append-only token ledger, reserve/confirm/refund, ownership, idempotency, DB constraints, AI Gateway, безопасные sessions, приватность логов и минимальный outbox/worker для принятой асинхронной AI-операции.

## 2. Обязательные решения перед BOOT-001

BOOT-001 нельзя начинать, пока её спецификация не закрепит:

1. Совместимые версии Node.js, pnpm, TypeScript, Next.js, React и NestJS; frozen lockfile.
2. ORM/query builder и migration tool, проверенные на transactions, row locks, constraints, raw SQL и reproducible migrations.
3. Redis queue library и минимальные retry/backoff/dead-letter/reconciliation semantics.
4. Session model: access/refresh TTL, rotation, reuse detection, server-side revocation; CSRF и exact origin policy; password hashing/rate limits.
5. Runtime validation, OpenAPI client и unit/integration/contract/E2E tooling без публикации ORM/domain types.
6. BOOT test topology: reverse proxy, web, API, worker, PostgreSQL, Redis; один backend image для API/worker; migration job отдельно.
7. Secrets delivery, structured log allowlist/redaction, health contracts, backup schedule/retention и restore drill.
8. PWA baseline и service-worker cache policy; допустимо ограничить BOOT manifest/app shell без offline commands.
9. Минимальные admin permissions, MFA и audit boundary; recovery либо подтверждённый канал, либо явное исключение из V0.1 с контролируемой процедурой test-access.
10. Граница BOOT-001: только каркас, tooling и инфраструктурная проверка; продуктовый вертикальный срез выполняется следующей отдельной задачей.

S3 implementation можно включить в BOOT-001 для проверки адаптера либо отложить до файлового среза. Если отложено, постоянное локальное хранение пользовательских файлов запрещено. AI-провайдер BOOT-001 не выбирает.

## 3. Разрешённые упрощения V0.1

- Один test server и по одному экземпляру runtime-компонентов.
- API и worker из одного backend image/commit SHA.
- Один PostgreSQL, одна Redis queue; S3 только перед первым файловым сценарием.
- Минимальный outbox: одна таблица, один poller, bounded retry и ручной reconciliation; без event bus/schema registry/UI платформы.
- Только модули identity, profiles, tracking, ai-companion, token-economy и минимальные analytics/administration boundaries.
- Остальные домены не создаются как пустые code modules и не публикуют фиктивные API.
- Prompt Registry как версионируемые repository artifacts без UI управления.
- Structured memory без vector database.
- Polling operation resource без streaming/WebSocket.
- Network-first PWA: app shell и безопасная статика, без offline критических команд.
- Одна web-сборка для user/admin и небольшой набор повторяемых UI primitives без полной design system.
- JSON stdout logs, error tracking и основные health/operational metrics вместо полного observability-кластера.
- Ручное подтверждение test deployment и короткое согласованное окно обслуживания.
- Контролируемый privacy deletion process допустим без self-service portal, если он проверяем, идемпотентен и аудируется.

## 4. Архитектурные риски

### Риск переархитектуры

- Универсальный event/command/workflow framework поверх узкого outbox.
- Интерфейс и mapper для каждой простой операции без реальной границы.
- Реализация всех документированных модулей до нужного vertical slice.
- DLQ/reconciliation admin UI, production observability, сложный task runner или design system заранее.
- Gateway, пытающийся абстрагировать неизвестные возможности всех AI-провайдеров.
- Отдельные сервисы/containers по доменам, Kubernetes, Kafka и отдельное analytics storage.

### Риск недоархитектуры

- Текущий баланс без ledger либо списание после AI-вызова без резерва.
- Redis-lock вместо PostgreSQL transaction/constraint.
- AI-вызов внутри открытой DB-транзакции или без operation/idempotency state.
- Queue publish до commit без outbox; неповторяемый worker handler.
- Нет конечной reconciliation policy для `outcomeUnknown`.
- Provider SDK в controller/application/domain или вызов AI из браузера.
- Next.js как второй backend; ORM/domain types во frontend.
- Refresh secret в browser storage; ownership только в UI.
- Полные AI-запросы, точный вес, cookies или PII в обычных логах.
- SQLite/in-memory вместо PostgreSQL для integration tests критических инвариантов.
- Runtime schema changes, mutable release tags, backup без restore test.
- Публичный bucket либо постоянные пользовательские файлы в runtime filesystem.

### Принятые остаточные риски

- Single test server — единая точка отказа.
- UX-спецификация отсутствует; до продуктовых экранов нужен минимальный UX-flow.
- AI provider и его latency/capabilities не выбраны.
- Recovery channel и точные security/retention параметры должны быть закрыты спецификацией BOOT/feature-задачи.

## 5. Рекомендованный первый вертикальный срез

```text
registration
→ login/session
→ onboarding (18+, timezone, consent)
→ AI persona
→ weight entry
→ quick text AI operation
→ token reserve
→ provider-neutral AI Gateway
→ persisted response
→ token confirm/refund/outcomeUnknown
→ authoritative balance
→ like/dislike/feedback
```

### Backend scope

`identity`, `profiles`, `tracking`, `ai-companion`, `token-economy`, минимальные `analytics` и `administration`; API/worker composition roots; PostgreSQL/outbox/Redis. AI feedback остаётся внутри ai-companion. Персона — настройка profiles, доступная AI через application query/port. Analytics потребляет outbox и не участвует в доменном решении.

AI-запрос создаёт operation, резерв и outbox атомарно, затем worker выполняет provider-neutral command. Web получает `202` и poll status. Worker подтверждает расход, выполняет полный refund при подтверждённой technical failure либо переводит неизвестный внешний исход в `outcomeUnknown` и reconciliation. Открытая DB-транзакция не охватывает внешний AI-вызов.

### Frontend scope

Auth routes, onboarding, persona, weight, AI operation/status, balance и feedback; mobile page shell; button/input/textarea/select, validation/loading/error/operation states. Server/session/UI/draft state разделены. Критические данные не optimistic и не cache service worker.

### Обязательные негативные сценарии

- Неверный login и отозванная/повторно использованная refresh session.
- CSRF и доступ пользователя к чужим profile/weight/conversation/feedback/wallet.
- Повтор AI-команды с тем же и изменённым idempotency payload.
- Недостаточный баланс и однократное starter начисление.
- Technical AI failure с полным refund и timeout с `outcomeUnknown`.
- Повтор worker job и feedback без двойного эффекта.
- Отсутствие PII, секретов и полного AI-контента в логах.

## 6. Минимум до теста с реальными людьми

HTTPS, secure cookies/CSRF/session revocation, backend ownership, admin MFA/permissions/audit, secrets вне Git/images/frontend, PostgreSQL backup и успешный restore drill, log redaction, consent/retention/deletion procedure и отдельные аккаунты пользователей. Четыре пользователя не являются основанием ослаблять privacy или security.

## 7. Решение о готовности

ARCH-001 **принята с ограничениями**. Архитектурных изменений перед BOOT-001 не требуется. BOOT-001 разрешена только отдельным подтверждением и после включения десяти решений из раздела 2 в её спецификацию. Код и инфраструктура в ARCH-002 не создаются.
