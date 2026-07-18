# VERT-001 — backlog реализации

Backlog реализует [дизайн первого вертикального среза](../01-architecture/vertical-slices/VERT-001-design.md). Каждая задача завершается отдельным проверяемым результатом, тестами, обновлением OpenAPI/документации/status/changelog и test-server smoke, когда появляется runtime-поведение.

## Порядок

```text
VERT-001.1 contracts and decisions
→ VERT-001.2 identity and sessions
→ VERT-001.3 onboarding, persona and minimal outbox
→ VERT-001.4 completion, token ledger and first weight
→ VERT-001.5 AI operation and worker
→ VERT-001.6 feedback and analytics
→ VERT-001.7 web vertical flow
→ VERT-001.8 hardening and acceptance
```

## VERT-001.1 — закрыть контракты среза

**Статус:** завершено документационно; результат — [VERT-001.1 contracts](../01-architecture/vertical-slices/VERT-001-contracts.md).

**Цель:** превратить открытые параметры дизайна в проверяемые API/database/security contracts до миграций.

**Область:** словари persona/scenario/onboarding/feedback/error; поля onboarding; weight range/precision; consent versions; ledger locking/snapshot; AI limits/reconciliation policy; OpenAPI proposal.

**Критерии готовности:**

- все решения раздела 9 дизайна имеют принятое значение либо явно вынесены из среза;
- нет противоречий с PRD, privacy, token и AI safety;
- API payload/status/error/idempotency contracts согласованы;
- AI-провайдер не выбран; отдельно указан blocker реальной AI-приёмки;
- код и миграции отсутствуют.

## VERT-001.2 — identity и server-side sessions

**Статус:** завершено; identity/session foundation, migration, OpenAPI contracts и автоматические проверки реализованы. Выкладка на test server относится к интеграционной приёмке VERT-001.8.

**Цель:** пользователь может безопасно зарегистрироваться, получить/обновить/отозвать session и узнать текущую identity.

**Область:** `identity` domain/application/infrastructure/transport, users/credentials/sessions/consents migrations, password hashing, cookies, CSRF, reuse detection, registration/session API и тесты.

**Критерии готовности:**

- registration idempotent, 18+ и обязательные consent evidence enforced;
- password/session secrets хранятся только в hash form;
- HttpOnly/Secure/SameSite, rotation, reuse detection, logout и CSRF проверены;
- нейтральные auth errors, rate limit и PII-safe logging работают;
- unit/API/integration tests проходят на PostgreSQL; generated OpenAPI client проверен; recovery и frontend auth UI не реализованы.

## VERT-001.3 — onboarding, persona и minimal outbox

**Цель:** зарегистрированный пользователь сохраняет profile setup, выбирает persona и достигает состояния `personaReady`; изменение persona создаёт durable domain event.

**Область:** `profiles`, profile/preference migrations, application use cases, REST contracts, ownership, onboarding read model и `outbox_messages` storage для `profiles.ai_persona_selected.v1`. Нет consumer-ов, worker logic, AI Gateway, token effect или tracking.

**Критерии готовности:**

- backend авторитетно вычисляет onboarding state;
- доступны ровно пять утверждённых persona;
- state заканчивается на `personaReady`, без `completed` и стартового начисления;
- фактическая смена persona атомарно сохраняет один outbox event, а natural retry не создаёт дубль;
- consumer и delivery не запускаются; cross-user access скрыт.

## VERT-001.4 — completion, starter grant и первый вес

**Цель:** пользователь завершает onboarding, ровно один раз получает 100 токенов, сохраняет первый вес и получает инициализированный tracking state; ledger безопасно поддерживает reserve/confirm/refund и чтение баланса.

**Область:** `token-economy` и `tracking`, wallets/transactions/action-prices/weight migrations, locking/constraints/idempotency, onboarding completion coordination, balance/weight API и tests.

**Критерии готовности:**

- completion + starter grant + outbox атомарны;
- повтор completion/grant не начисляет токены повторно;
- первый вес и tracking initialization follow approved ownership, validation и idempotency rules;
- баланс выводится из ledger и никогда не отрицателен, включая concurrent tests;
- цены читаются из управляемых данных, не из application code;
- reserve/confirm/refund идемпотентны; `starter_tokens_added` и balance events корректны.

## VERT-001.5 — asynchronous AI operation

**Цель:** первый quick AI request проходит через reservation, outbox, worker, AI Gateway и provider adapter boundary с корректной финализацией.

**Область:** `ai-companion`, conversations/messages/operations/outbox migrations, API operation resource, BullMQ worker, Prompt Registry, Context Builder, Safety Layer, usage/cost metadata и fake provider для tests.

**Критерии готовности:**

- API атомарно создаёт input/action/reserve/outbox и возвращает `202`;
- worker job повторяем, provider call не находится внутри DB transaction;
- success сохраняет безопасный response и подтверждает расход один раз;
- technical error полностью возвращает резерв один раз;
- `outcomeUnknown` ждёт reconciliation и не инициирует опасный автоматический повтор;
- logs/events не содержат PII или полный AI content;
- реальная пользовательская приёмка заблокирована до отдельного выбора provider adapter.

## VERT-001.6 — feedback и продуктовые события

**Цель:** пользователь оценивает принадлежащий ему AI-ответ, а все backend-события среза надёжно доставляются из outbox.

**Область:** `ai-companion` feedback, минимальный `analytics` publisher, feedback migration/API, event mapping/deduplication/retry/dead-letter tests.

**Критерии готовности:**

- одна feedback запись на user/message обновляется идемпотентно;
- like/dislike и optional submitted feedback различаются по registry;
- business dislike не возвращает токены автоматически;
- чужой message недоступен; comment не попадает в analytics/logs;
- публикуются только зарегистрированные события с обязательными параметрами.

## VERT-001.7 — mobile-first web flow

**Цель:** пользователь проходит весь срез в Next.js PWA через NestJS REST API.

**Область:** auth/onboarding/persona/weight/AI operation/wallet/feedback routes and features, generated client, forms/state split, accessible mobile states.

**Критерии готовности:**

- frontend не содержит доменных правил и не использует Next.js как backend;
- server/session/UI/draft state разделены;
- цена подтверждается до AI command; критические эффекты не optimistic;
- queued/processing/outcomeUnknown/success/error states доступны и понятны;
- service worker не кеширует API или персональные данные;
- component и Playwright tests покрывают основной и негативные flows.

## VERT-001.8 — security, runtime и acceptance

**Цель:** подтвердить полный срез на test server и готовность к ограниченному тесту с реальными людьми.

**Область:** migration/restart/retry smoke, security/ownership review, log inspection, backup/restore applicability, OpenAPI contract check, analytics verification и E2E acceptance.

**Критерии готовности:**

- install/lint/typecheck/tests/build/contracts проходят;
- migrations применяются и повторный запуск безопасен;
- full E2E проходит на test server;
- concurrent ledger, idempotency, CSRF/session reuse и cross-user tests проходят;
- API/web/worker health и rollback/smoke procedure проверены;
- выбран и безопасно настроен AI provider adapter для реальной AI-приёмки либо задача явно остаётся test-only и не допускается к реальным пользователям;
- documentation, current status и changelog обновлены; ручная приёмка записана.

## Зависимости и параллельность

- VERT-001.1 блокирует все миграции и публичные контракты.
- VERT-001.2 блокирует защищённые пользовательские сценарии.
- VERT-001.3 завершается на `personaReady`; VERT-001.4 следует за ним и объединяет onboarding completion, starter grant и первый вес в утверждённом порядке.
- VERT-001.5 зависит от ledger reserve/confirm/refund; fake provider разрешён только для tests.
- VERT-001.6 зависит от assistant messages и outbox.
- VERT-001.7 начинается с утверждённых generated contracts и развивается инкрементально, но full flow зависит от .2—.6.
- VERT-001.8 выполняется последней и не заменяется модульными проверками.

VERT-001-DESIGN не создаёт код, migrations или инфраструктуру и не запускает задачи этого backlog автоматически.
