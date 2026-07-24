# BOOT-001 — runtime verification

## BACK-UI-001 — isolated PostgreSQL verification

- Date: 2026-07-25. Verification ran on the test server in an isolated checkout and temporary PostgreSQL 17 containers; stable `atlas-v01`, its containers, volumes and ports were not touched.
- Migration: `0007_back_001_daily_weight.sql` was applied after the existing schema. The normal Drizzle runner applied the migration safely and its repeat run was idempotent. A separate legacy-data check applied the migration to two same-day historical rows: neither was deleted, the row latest by `updated_at`, then `created_at`, then `id` became `is_current=true`.
- PostgreSQL integration: `weight-daily-postgres.integration.spec.ts` passed 6/6. It confirms create/update for one IANA-timezone local date, next-day creation around a UTC boundary, identical idempotency replay, concurrent saves, legacy-current history filtering and daily ordering used by history/graphs.
- API/contract quality: backend typecheck and API production build passed; OpenAPI/client generation produced no generated drift and focused ESLint passed. The workspace-wide API `tsc --noEmit` still reports pre-existing `TS6307` project-reference errors across unrelated backend sources; it is not used by the production API build.

This verification covers the backend-only scope. No web behavior, UI branch, stable topology or external endpoint was changed.

## VERT-001.5 — final fake-runtime verification

- Date: 2026-07-21. Isolated test-server topology used a clean checkout of verification commit `7a794a0`, PostgreSQL 17, Redis 8, BullMQ and explicit `AI_PROVIDER=fake`.
- Build and schema: web/API/worker/migrate images built successfully; six Drizzle migrations were present in `drizzle.__drizzle_migrations`; the migration command completed safely twice.
- Main HTTP path: registration → profile → persona → onboarding completion → quick reply passed with HttpOnly session cookies, CSRF and permitted Origin. The operation moved `queued → processing → succeeded`; polling returned the fake response; an identical idempotency retry returned the saved `202` response.
- Financial paths: success made one reservation and one confirmation; `technicalError` made exactly one refund and restored balance `100`; `outcomeUnknown` retained the reservation (balance `99`), made no terminal financial effect and blocked a new AI operation.
- Delivery resilience: worker restart completed a queued operation once; republishing the same outbox event did not duplicate the assistant message or terminal ledger effect.
- Regression and privacy: PostgreSQL AI tests passed 13/13; worker unit tests passed 2/2. Durable outbox payloads contained no prompt or response fields, and test content markers were absent from API and worker logs.
- UI: the `/quick-reply` page served HTTP `200`; component coverage confirms the fake-runtime notice, managed price, submit flow and polling presentation.
- This is a fake-adapter technical acceptance only. No real AI provider, provider SDK, provider key or real-model quality verification was used.

## VERT-001.5 worker fake-runtime verification

- Isolated test-server Docker topology: PostgreSQL 17, Redis 8, BullMQ and `AI_PROVIDER=fake`.
- Success: one durable outbox event produced one assistant message and one `aiConfirmation`.
- Technical error: exactly one `aiRefund`, no confirmation and restored balance.
- Outcome unknown: reservation retained, no automatic refund or confirmation.
- Duplicate outbox delivery and a worker restart did not create a second terminal effect.
- This is fake-adapter technical acceptance only; no real AI provider was connected or verified.

## Итог

- Дата финальной проверки: 2026-07-18.
- Окружение: test server, checkout проекта из GitHub.
- Вердикт: **проверка пройдена; BOOT-001 завершён**.
- Scope: Docker-сборка и запуск scaffold web/API/worker с PostgreSQL, Redis и Drizzle migrations.

Проверка подтверждает работоспособность технического каркаса. Она не включает продуктовые функции, production deployment, S3, CI/CD или выбор AI-провайдера.

## Подтверждённые результаты

| Область | Результат |
|---|---|
| GitHub checkout | Проверен |
| Docker Engine | Проверен |
| Docker Compose | Проверен |
| Docker Hub authentication | Проверена |
| PostgreSQL 17 | Запущен и проверен |
| Redis 8 | Запущен и проверен |
| Drizzle migration | Успешно выполнена |
| API health | Успешно проверен |
| Web | Возвращает HTTP `200` |
| Worker health | Успешно проверен |
| Test server deployment | Проверен |

Точные patch-версии Docker Engine и Docker Compose в результате проверки не зафиксированы. Подтверждена доступность CLI, успешная сборка и выполнение Compose workflow.

## Выполненный workflow

На test server подтверждён следующий эксплуатационный путь:

```bash
docker --version
docker compose version
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d api worker web
pnpm smoke
docker compose ps
```

Ранее выявленная несовместимость migration entrypoint с CJS transform устранена переходом от top-level `await` к `async main()` без смены общей module strategy и без новых зависимостей. После исправления Drizzle migration успешно выполняется в migration container.

## Критерии закрытия BOOT-001

- images web, API и worker собираются;
- PostgreSQL 17 и Redis 8 доступны контейнерам приложений;
- migration container завершается успешно;
- API и worker проходят health-проверки;
- web доступен с HTTP `200`;
- smoke test проходит против развёрнутого окружения;
- deployment на test server подтверждён.

Все runtime-критерии BOOT-001 закрыты. Открытых runtime-блокеров для подготовки VERT-001 нет.

## VERT-001.3 — final test-server verification

- Дата: 2026-07-20.
- Checkout: clean verification checkout на commit `3437087`.
- API: пересобран и пересоздан отдельно; health endpoint возвращает `{"service":"api","status":"ok"}`.
- Миграции: актуальная schema применена; повторный запуск безопасен.
- Автоматические проверки: PostgreSQL persona/outbox integration — 5/5; API regression suite — 16/16.
- Ручной API сценарий: registration, login, current user, profile и persona selection выполнены. Для mutating requests переданы HttpOnly session cookies, CSRF token и `Origin: http://localhost:3000`.
- Результат persona: пользователь перешёл в `personaReady`, создана одна `ai_preferences` запись с `gentleFriend`, создано одно durable событие `profiles.ai_persona_selected.v1` с payload `personaId=gentleFriend`, `context=onboarding`.
- Идентичный повтор persona request не создал второй outbox event.
- Scope проверен: token tables, AI actions/messages и outbox consumers не добавлялись; worker delivery не запускалась.

## VERT-001.4 — final test-server verification

- Дата: 2026-07-20; authoritative checkout: `c674eb8`. API container использовал актуальный image; PostgreSQL, Redis, API, worker и web были healthy.
- Migration `0003_vert_001_4_wallet_tracking.sql` применена и повторный запуск прошёл успешно; таблицы wallet, ledger, HTTP idempotency и weight entries существуют.
- Ручной API сценарий registration → login → profile → persona → completion → wallet → first weight прошёл с session cookies, CSRF и `Origin: http://localhost:3000`.
- PostgreSQL подтвердил `completed`, один wallet, balance `100`, одну `starterGrant` transaction, completion/starter outbox events и одну weight entry.
- Повторы completion и идентичного weight request вернули сохранённые `201` без дублей; weight key с изменённым payload вернул `409 IDEMPOTENCY_KEY_REUSED`.
- AI actions, reserve/confirm/refund, action prices, payments, referrals и outbox consumers не запускались.

## Переход к VERT-001

VERT-001 должен начинаться только отдельной утверждённой задачей. Его входные условия:

1. Использовать принятые repository boundaries и engineering baseline без смены стека.
2. Реализовывать первый вертикальный срез через application use cases, явные транзакционные границы и REST API.
3. Не добавлять продуктовые функции вне утверждённого V1 и конкретного scope VERT-001.
4. Сохранить PostgreSQL источником бизнес-истины; Redis использовать только для очередей и координации.
5. До работы с реальными пользователями применить обязательные auth, ownership, privacy и logging ограничения.

Реализация VERT-001 в рамках этой задачи не запускалась.
