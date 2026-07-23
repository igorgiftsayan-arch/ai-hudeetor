# BOOT-001 — runtime verification

## UI-001 — isolated daily-weight UI verification

- Date: 2026-07-22. Branch `ui/ui-001-daily-weight` was copied into `/opt/projects/ai-hudeetor-ui-001-verify` and started as Compose project `atlas-ui001`; stable `atlas-v01` containers and volumes were not changed.
- Runtime: images built with Node.js 24.18.0 and pnpm 11.14.0; frozen install and workspace production build completed. Next.js output contains `/today` alongside the existing `/quick-reply`.
- Topology: separate PostgreSQL/Redis volumes, API `3101`, web `3100`, healthy API/worker/web/PostgreSQL/Redis; migrations applied successfully to the isolated database.
- Automated checks in the baseline image: web component tests 10/10, workspace typecheck and frontend lint passed. Final host regression after adding the explicit disabled/loading assertion passed 11/11; full repository lint passed after documenting the intentional Nest request-DTO value import, and changed files pass Prettier check.
- Browser acceptance: Chromium mobile E2E 1/1 passed registration → profile → persona → completion → `/today` → weight `98,4` → `Записано` → reload persistence → `/quick-reply`.
- Safe retry is covered by component tests: an unchanged weight payload reuses one `Idempotency-Key` after a network failure. Backend idempotency and ownership implementation were not changed.
- Access from the owner's computer while the SSH tunnel is active: `http://localhost:3100/today`; API remains isolated at `http://localhost:3001/api/v1` through the same tunnel.
- A fresh browser without an existing completed cookie session intentionally shows `Сессия закончилась`; UI-001 does not add or weaken authentication, and the current `main` has no login UI.

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

## UI-001 — isolated daily-weight test stand

- Дата: 2026-07-23. Checkout ветки `ui/ui-001-daily-weight`: `4e906d8`; `main` не изменялся.
- Изоляция: отдельный Compose project `atlas-ui-001`, собственные PostgreSQL/Redis volumes и network. Стабильный `atlas-v01` оставался healthy во время всей проверки.
- Публикация: наружу доступен только nginx gateway на `3102`; API, worker, PostgreSQL и Redis используют внутренние Docker ports.
- Migration image проверен до запуска; содержит SQL migrations до `0005`. Миграции применены дважды, metadata содержит 6 записей.
- Все сервисы `atlas-ui-001` — PostgreSQL, Redis, API, worker, web и gateway — healthy. Публичный `/login` возвращает HTTP `200`.
- Ручная browser acceptance: completed тестовый пользователь вошёл через `/login`, был перенаправлен на `/today`, увидел последнюю запись и историю, сохранил вес `98,4`, затем открыл `/quick-reply` через тот же gateway.
- Mobile viewport `393×852`: `/today` корректно показывает текущий вес, историю, форму и нижнюю навигацию.
- Retry: при временно остановленном только изолированном API UI показал понятную ошибку и кнопку повторения; после восстановления API одна повторная команда сохранила ровно одну новую weight entry. В PostgreSQL итог: `completed`, один wallet, balance `100`, один `starterGrant`, три weight entries.
- Безопасность: в обычных логах API/worker/web/gateway не найдены тестовый email, пароль или значение веса. Credentials не документированы и не коммитились.

## UI-002 — isolated two-decimal weight verification

- Дата: 2026-07-23. Первоначальная проверка на `d09b02a` признана недействительной: web container не был пересоздан из актуального image, а PWA shell сохранял cache version `atlas-shell-v1`. Исправление PWA cache и фактическое развёртывание проверены на commit `4339439`; `main` и stable Compose project `atlas-v01` не изменялись.
- Изолированный project `atlas-ui-001`: API и web обновлены, PostgreSQL migration `0006_ui_002_weight_precision.sql` применена дважды. В `drizzle.__drizzle_migrations` — 7 записей; `weight_entries.weight_kg` имеет тип `numeric(5,2)`.
- Существующие записи сохранены. В browser acceptance последовательно сохранены `98`, `98,4` и `98,45`; последний вес и история отображают точность без округления.
- `98,456` остановлен frontend validation с понятной ошибкой; прямой API request с `98.456` возвращает `422 VALIDATION_ERROR`.
- Идентичный API retry с тем же `Idempotency-Key` вернул ту же weight entry; второй business effect не создан. PostgreSQL остаётся источником истины.
- Web image пересобран из `4339439`, а web/gateway пересозданы. Работающий web container и `atlas-ui-001-web:latest` используют один digest `sha256:0a281f6063b0103e4294e8297478baec28ed9cd663658e588b7d20da54990997`; `sw.js` отдаёт `atlas-shell-v2`.
- В чистом browser profile login → `/today` и ввод `98.45` прошли: значение отображается как `98,45 кг`. Наружу по-прежнему опубликован только gateway UI-стенда; stable `atlas-v01` не затрагивался.

## Переход к VERT-001

VERT-001 должен начинаться только отдельной утверждённой задачей. Его входные условия:

1. Использовать принятые repository boundaries и engineering baseline без смены стека.
2. Реализовывать первый вертикальный срез через application use cases, явные транзакционные границы и REST API.
3. Не добавлять продуктовые функции вне утверждённого V1 и конкретного scope VERT-001.
4. Сохранить PostgreSQL источником бизнес-истины; Redis использовать только для очередей и координации.
5. До работы с реальными пользователями применить обязательные auth, ownership, privacy и logging ограничения.

Реализация VERT-001 в рамках этой задачи не запускалась.
