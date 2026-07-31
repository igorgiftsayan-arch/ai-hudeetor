# Текущий статус

- Дата: 2026-07-31
- AI-001: GenAPI adapter реализован и проверен в отдельной ветке на synthetic test-пользователях; `main` и stable остаются на fake до приёмки и merge.
- Текущая задача: UI-005/BACK-UI-001 объединены и проверены в ветке `ui/ui-001-daily-weight`; слияние в `main` не выполнялось, результат ожидает ручной приёмки.
- Код приложения: scaffold web/API/worker, identity/profiles modules, token-economy completion/wallet, tracking веса с графиком, daily upsert и persisted fake-runtime AI chat.
- Реальный AI provider, платежи, рефералы, AI memory и feedback: отсутствуют.
- Тестовый сервер: технический scaffold web/API/worker с PostgreSQL 17 и Redis 8 развёрнут и проверен.
- AI-провайдер: GenAPI выбран ADR-011 и технически проверен; merge и пользовательский consent-flow не выполнены.
- BUG-UI-001/UI-003 добавляют owner-scoped чтение уже существующих conversation/messages и корректирующую ledger migration `0007`; AI provider и analytics events не меняются.

## UI-001 — ежедневная фиксация веса

- Добавлен mobile-first `/today` с сегодняшней датой, последним весом, нейтральной динамикой и последними 10 записями.
- Вес сохраняется через существующий `POST /api/v1/weight-entries`; подтверждённый ответ обновляет экран без optimistic update.
- Неизменённый payload повторяет стабильный `Idempotency-Key` после сетевой ошибки, поэтому server-side idempotency не создаёт дубль.
- Реализованы loading, empty, saved, validation, network retry, session expired и disabled/loading states.
- Минимальная навигация связывает `Сегодня` и существующий `/quick-reply`; completed user перенаправляется с технического onboarding на `/today`.
- Backend, ledger, database schema, generated contracts и event registry не менялись.
- Добавлен минимальный `/login` через существующий `POST /sessions`; фактический onboarding state читается после входа и completed user направляется на `/today`.
- Истёкшая session на `/today` направляет на `/login`; auth cookies остаются HttpOnly и не сохраняются в browser storage.
- Для внешнего тестового доступа подготовлен isolated Compose project `atlas-ui-001`: browser API идёт через same-origin gateway, наружу публикуется только port, заданный `UI001_PUBLIC_PORT`.
- Ручной сценарий: [UI-001 manual acceptance](../06-development/ui-001-manual-acceptance.md).
- Isolated test-server topology `atlas-ui-001` проверена на commit `4e906d8`: migrations repeatable, все шесть сервисов healthy, наружу опубликован только gateway. Login → today → weight retry → quick reply и mobile viewport прошли; `atlas-v01` остался healthy и неизменным.

## UI-002 — точность веса

- Реализована поддержка значений с нулём, одним или двумя знаками после запятой во frontend, API и PostgreSQL numeric persistence.
- Migration `0006_ui_002_weight_precision.sql` переводит `weight_entries.weight_kg` с `numeric(4,1)` на `numeric(5,2)` без потери существующих строк; idempotency weight command сохраняет исходный request hash.
- Первичная runtime verification была отменена: web container не был пересоздан из актуального image, а PWA использовал неизменённый shell cache `v1`. Исправление `4339439` меняет cache на `atlas-shell-v2`; web/gateway изолированного стенда пересобраны и пересозданы из этого commit.
- В чистом browser profile `98.45` сохраняется и показывается как `98,45 кг`; migrations repeatable, `98` / `98,4` / `98,45` сохраняются, `98,456` отклоняется в UI и API, identical retry не создаёт дубль. Stable `atlas-v01` остался healthy и неизменным.

## BUG-UI-001 / UI-003 / UI-004

- Точная причина `Unexpected server error` установлена runtime-проверкой: legacy constraint `uq_token_transactions_starter_grant_user` ошибочно запрещал второй `aiReservation` одного пользователя, PostgreSQL возвращал `23505`, а общий API filter скрывал infrastructure exception.
- Migration `0007_ai_reservation_uniqueness.sql` заменяет constraint частичным уникальным индексом только для `starterGrant`; последовательные AI reservations снова разрешены, одноразовый starter grant остаётся защищён.
- Дополнительно старый `/quick-reply` повторно использовал один `Idempotency-Key` для разных payload, из-за чего API возвращал `409 IDEMPOTENCY_KEY_REUSED`.
- Ключ AI operation теперь живёт вместе с каноническим payload: новая отправка получает новый ключ, а потерянный сетевой ответ безопасно повторяется с прежним ключом.
- `/quick-reply` переделан в mobile-first чат с persisted PostgreSQL messages, разделёнными user/assistant сообщениями, ожиданием fake AI, inline error/retry и компактной ценой.
- Реализованы owner-scoped `GET /ai-conversations/current` и ранее спроектированный `GET /ai-conversations/{id}`; пустые conversation не скрывают последнюю беседу с сообщениями.
- На `/today` добавлен лёгкий SVG-график над сохранённым списком. Одна запись и несколько записей в один день отображаются без изменения модели данных и без UI-библиотеки.
- Automated verification: lint и production build проходят; web 31/31, API unit 27/27, worker 2/2 и PostgreSQL AI integration 4/4. Root `pnpm typecheck` по-прежнему выявляет baseline `TS6307` в существующей API/project-reference конфигурации, при этом production build выполняет TypeScript-проверку успешно.

## UI-005 / BACK-UI-001 — daily weight upsert

- `weight_entries` хранит одну актуальную запись на локальную календарную дату пользователя: первое сохранение возвращает `created`, повтор за ту же дату — `updated`.
- Дата вычисляется по IANA timezone профиля в момент сохранения; PostgreSQL partial unique index защищает одну текущую строку на `(user_id, local_date)`.
- Исторические дубли не удаляются. Migration `0008_back_001_daily_weight.sql` помечает текущей последнюю строку по `updated_at DESC`, `created_at DESC`, `id DESC`; API history возвращает только актуальные ежедневные значения.
- Контракт и хранение веса сохраняют точность UI-002: до двух знаков после запятой, OpenAPI `multipleOf: 0.01`, PostgreSQL `numeric(5,2)`.
- Изолированная runtime-проверка `atlas-ui-001` пройдена: migration `0008` выполнена повторно, PostgreSQL integration 6/6, contract/client drift отсутствует, targeted `/today` web tests 11/11 и browser/mobile сценарий create → update → reload → `/quick-reply` подтверждены.
- В `atlas-v01` не вносились изменения: его контейнеры, volumes, runtime env и опубликованные ports сохранены.

## VERT-001.5 — завершена

- Persistence: завершён — цены, conversations/messages/operations и ledger constraints проверены на PostgreSQL.
- API transaction: завершён — idempotent operation creation, reservation и durable outbox реализованы и проверены.
- Worker: завершён — BullMQ delivery, fake adapter lifecycle, confirmation/refund/outcomeUnknown и restart/duplicate delivery verified.
- Web boundary: завершён — `/quick-reply` показывает цену, явное предупреждение fake runtime, submit и polling состояний `queued`/`processing`/`succeeded`/`technicalError`/`outcomeUnknown`.
- Final test-server acceptance: пройдена в изолированной topology. Подтверждены success, refund, outcomeUnknown, idempotency, duplicate outbox delivery, worker restart, safe logs/outbox payloads, migrations и targeted regression tests.
- Реальный AI provider по-прежнему не подключён и не проверялся.
- Следующая вертикаль не начата и требует отдельного задания.

## VERT-001.4 verification

- Реализованы `personaReady → completed`, одноразовый `starterGrant +100`, append-only wallet ledger, owner-scoped weight entries и минимальная PostgreSQL HTTP-idempotency persistence.
- На test server подтверждены repeatable migration, health всех сервисов и основной сценарий от registration до first weight.
- Повторы completion/weight не дублируют effects; key reuse с изменённым payload возвращает `409 IDEMPOTENCY_KEY_REUSED`.
- AI actions, reserve/confirm/refund, prices, payments, referrals и outbox consumers не входят в задачу.
- Runtime verification policy: local Codex runtime может отличаться от baseline; Docker/test server остаётся authoritative средой final verification.

## Решения ARCH-001

- pnpm/TypeScript monorepo, Next.js/React PWA и NestJS modular monolith с отдельным worker.
- PostgreSQL — бизнес-истина; Redis — очередь/координация; private S3 — файлы.
- REST/OpenAPI, idempotency, operation resources и reconciliation `outcomeUnknown`.
- Cookie auth, refresh rotation, CSRF, ownership, admin MFA/RBAC/audit.
- Transactional outbox, repeatable jobs и single-server Docker test topology.
- AI Gateway/provider adapters без выбора AI-провайдера.

Код, зависимости, контейнеры и CI не создавались. Решения BOOT-001 и production перечислены в [backlog.md](backlog.md).

## Acceptance ARCH-002

Целевая архитектура сохранена без изменений. Для V0.1 разрешена инкрементальная реализация без пустых модулей и универсальных платформ; ledger, ownership, idempotency, constraints, минимальный outbox/worker и security baseline обязательны. Полный review и входные решения BOOT-001 — в [architecture-acceptance-review.md](../01-architecture/architecture-acceptance-review.md).

## Engineering baseline BOOT-000

- Runtime/frameworks: Node.js 24 LTS, pnpm 11, TypeScript 5.9, Next.js 16/React 19 и NestJS 11.
- Persistence/queue: Drizzle + reviewed SQL migrations + node-postgres; BullMQ поверх PostgreSQL transactional outbox.
- Auth: project-owned opaque cookie sessions в PostgreSQL, rotation/reuse detection, CSRF и Argon2id.
- Contracts/tests: Nest validation/OpenAPI, Zod, Orval; Jest/Supertest, Vitest/Testing Library и Playwright.
- Monorepo/PWA/operations: pnpm workspace без task runner, network-first safe-cache PWA, structured JSON logs и nightly off-host PostgreSQL backup.

Полные решения, ограничения, compatibility notes, prerequisites и deferred decisions находятся в [engineering-baseline.md](../01-architecture/engineering-baseline.md). На момент завершения BOOT-000 код, зависимости, scaffold, Docker и CI ещё не создавались.

## BOOT-001 scaffold

- Созданы pnpm workspace, lockfile, strict TypeScript, ESLint/Prettier и test tooling.
- Созданы Next.js PWA health page, NestJS API health/OpenAPI/error/request-ID contour и отдельный BullMQ worker.
- Подключены Drizzle/node-postgres и Redis health adapters, пустая bootstrap migration и contract generation.
- Созданы Dockerfile/Compose для web/API/worker/PostgreSQL/Redis, migration service и smoke commands.
- S3, CI, production deployment и любые продуктовые функции не создавались.

Локальные tests/typecheck/build выполняются. Финальная Docker-проверка выполнена на test server; детали зафиксированы в [runtime verification](../07-deployment/runtime-verification.md).

## BOOT-001.1 runtime verification

- Frozen install повторно прошёл под Node.js 24.18.0/pnpm 11.14.0.
- Production entrypoints web/API/worker запускаются локально; liveness проходит.
- Manifest, service worker registration и Playwright smoke подтверждены.
- Исправлен build defect API/worker, связанный с Nest `deleteOutDir` и incremental TypeScript emit; повторные build сохраняют entrypoints.
- PostgreSQL, Redis, migrations, Compose readiness и `pnpm smoke` не проверены без Docker.

Эти локальные ограничения закрыты последующей проверкой на test server. VERT-001 не запускался.

## BOOT-001.2 test-server runtime

На test server подтверждены GitHub checkout, Docker Engine, Docker Compose, Docker Hub authentication, сборка images, PostgreSQL 17, Redis 8, Drizzle migration, API health, web HTTP `200`, worker health и deployment workflow. BOOT-001 полностью закрыт.

## BOOT-001.2 migration compatibility fix

Test-server run выявил CJS transform error из-за top-level `await` в `database/migrate.ts`. Migration entrypoint переведён на async `main()` без изменения общего module strategy и без новых зависимостей. Исправление проверено в migration container: Drizzle migration выполняется успешно.

## Переход к VERT-001

- Runtime-блокеров со стороны BOOT-001 не осталось.
- Входная база: принятая архитектура, engineering baseline, работающий monorepo scaffold и проверенный test deployment.
- Scope, acceptance criteria, затрагиваемые доменные модули, API, события и security requirements должны быть заданы отдельной задачей VERT-001.
- До отдельного подтверждения продуктовая реализация не начинается.

## VERT-001-DESIGN

- Описаны registration → onboarding → persona → weight → async AI → token ledger → response → feedback.
- Определены границы identity, profiles, tracking, ai-companion, token-economy и analytics.
- Подготовлены database/API proposals, AI success/refund/reconciliation flow, event mapping и testing strategy.
- Реализация разбита на VERT-001.1—VERT-001.8 в [отдельном backlog](vert-001-backlog.md).
- AI-провайдер не выбран; реальная AI-приёмка остаётся заблокированной до отдельного решения.
- Код, migrations и инфраструктурные изменения в VERT-001-DESIGN не создавались.

## VERT-001.1 contracts

- Зафиксированы минимальные onboarding fields, consent types, states, validation и enums без лишних персональных данных.
- Зафиксированы контракты веса, параметров тела и простой активности; body/activity не входят в ближайшую VERT-001.2 реализацию.
- Конкретизированы properties событий существующего event registry и закрытые словари первого среза.
- Принят append-only token ledger без balance snapshot с PostgreSQL lock и идемпотентными reserve/confirm/refund.
- Зафиксированы AI lifecycle, persona IDs, provider-neutral/fake adapter contracts и error states без выбора provider.
- Зафиксированы REST endpoints, DTO, ownership/idempotency и error matrix.
- Код и migrations не создавались. Следующая разрешённая задача — VERT-001.2 после отдельного подтверждения.

## VERT-001.2 identity/session

- Реализованы registration, login, refresh rotation/reuse detection, current identity и logout только через утверждённые REST endpoints.
- Password хранится как Argon2id hash; opaque access/refresh secrets хранятся в PostgreSQL только как SHA-256 hashes.
- Registration/credentials/consents/sessions создаются одной PostgreSQL transaction; replay key не дублирует user и заменяет только связанную registration session family.
- Cookie baseline использует HttpOnly/Secure/SameSite, CSRF double-submit с Origin/Referer validation и server-side session truth.
- Login rate limit использует hashed IP + normalized-email scope в Redis; PostgreSQL остаётся источником session truth.
- Migration `0001_identity_sessions.sql`, OpenAPI generated client, unit/API/PostgreSQL integration tests и [ручная приёмка](../06-development/vert-001-2-manual-acceptance.md) добавлены.
- Новые analytics events не создавались: identity registration/login событий нет в утверждённом event registry.
- Test-server deployment не входил в эту задачу; полный runtime acceptance запланирован в VERT-001.8.

## VERT-001.3 design review

- Подготовлен [технический дизайн onboarding/profile state](../01-architecture/vertical-slices/VERT-001.3-design-review.md) без кода и миграций.
- `users.onboarding_status` остаётся единственным persisted state machine; `profiles` владеет criteria, но не получает прямой доступ к identity repository/table.
- Принят scope: VERT-001.3 безопасно завершается `personaReady`; VERT-001.4 включает `completed`, starter grant, первый вес и tracking initialization.
- Принят minimal transactional outbox: VERT-001.3 хранит и атомарно записывает `profiles.ai_persona_selected.v1` без consumer-ов, worker logic, AI Gateway или токенов. AI Gateway, token ledger и первый вес не запускались.

## VERT-001.3 implementation

- Добавлены profile/persona REST endpoints, `profiles` module и технический web route `/onboarding`; state machine останавливается на `personaReady`.
- Migration `0002_profiles_onboarding_outbox.sql` создаёт `user_profiles`, `ai_preferences` и private `outbox_messages` storage с индексом pending records.
- `profiles.ai_persona_selected.v1` сохраняется в той же PostgreSQL transaction, что preference и переход к `personaReady`; consumer, worker delivery, AI Gateway и token effects отсутствуют.
- Final verification на test server пройдена: clean checkout `3437087`, API health, повторяемые migrations, PostgreSQL persona/outbox integration (5/5), API regression (16/16) и manual persona scenario подтверждены. Один persona retry не создаёт второй outbox event.
- Добавлены API, PostgreSQL integration и frontend tests; OpenAPI/client generation выполнены. Test-server deployment не входил в задачу.
