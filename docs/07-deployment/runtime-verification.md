# BOOT-001 — runtime verification

## GERBI-MARATHON-PILOT — isolated backend and shared-stand verification

- Дата: 2026-09-24. Backend branch `back/gerbi-marathon-pilot` проверена на commit `afabe77`; интегрированный isolated checkout зафиксировал browser evidence на `ffa680e` (code images из `bec79b4`). `main`, stable `atlas-v01` и прежний `atlas-ui-001` не изменялись.
- Migrations `0012_gerbi_marathon_pilot.sql` и `0013_gerbi_marathon_baseline.sql` присутствовали в актуальном migration image, migrations `0000–0013` применены дважды. В Drizzle metadata — 14 записей; созданы все шесть marathon tables и два baseline triggers.
- PostgreSQL integration прошла 8/8: bootstrap/idempotent create, current-marathon `404`, shuffled wellness persistence, captain authority/current-date completion, successful replay across date change, timezone mismatch, last-day report, first-day `notApplicable`, exact yesterday/today percentage, immutable baseline, shared-place podiums и weight `unknown` без соседней даты.
- Regression: API 11 suites / 44 tests; worker 7 suites / 32 tests. Backend typecheck, API build и OpenAPI generation прошли.
- Shared isolated Compose project `atlas-gerbi-marathon`: PostgreSQL, Redis, API, worker, web и gateway healthy; наружу опубликован только gateway `http://5.42.126.71:3112`.
- Финальные image digests: API `sha256:cc25c4d423be591ec578066a41c8cd048b85a49b92217c9a0721bc1bf1fef1f4`, web после disclosure fix `sha256:8c342e02812702a49f7e86fe57c400c450c0e81bb334ef04b9111a1ee98ba9c8`; public `/login` и `/api/v1/health/ready` вернули `200`. Финальный isolated evidence checkout — `912d000`.
- Browser/mobile acceptance отдельной frontend-задачи подтвердила join, wellness save/reload, captain-task completion/reload и существующий daily weight upsert. Team read model не выдаёт raw weight, chat, memory или cumulative totals.
- Synthetic HTTP acceptance подтвердила registration/profile/persona/completion, join, wellness, captain task, safe team read, wallet `100`, fake quick reply `succeeded` и сохранение одного memory fact.
- Shared browser GenAPI acceptance выполнена с одинаковыми `AI_PROVIDER=genapi` и consent version `test-v1` в API/worker. До consent composer был disabled; после consent две последовательные операции завершились `succeeded` с `runtimeAdapter=genapi` и provider references. Ledger: 2 reservations, 2 confirmations, 0 refunds, delta `-2`.
- Privacy-safe runtime proof для второго запроса: штатный `MemoryContextBuilder` построил 191 Unicode character, SHA-256 `8daedcef463cf1623e0d40794e5370f4afc68d901c69e115031644f41220e6c3`; context содержит timezone, persona и текущий вес. Extraction receipt первого сообщения существует, но устойчивых facts не выделено (`factsWritten=0`), поэтому active-fact claim не делается.
- Дополнительный targeted memory/history gate создал один безопасный `supportStrategy` fact (`receipt=1`, `factsWritten=1`). Следующий штатный bounded context: 254 Unicode characters, SHA-256 `5d10e8290684faaad95e4872ee51d968e477fc12878c8708aa722cf943892e3`, `activeFactCount=1`, `contextIncludesActiveFact=true`; request history содержала 3 сообщения (`user,assistant,user`), то есть 2 prior messages. Сам provider-вызов завершился `outcomeUnknown`: ledger сохранил одну reservation, без confirmation/refund, а опубликованный outbox не был отправлен повторно. GenAPI status read-back/reconciliation в текущей реализации отсутствует и остаётся отдельной задачей; UI блокирует composer и сообщает, что статус уточняется, без обещания refund или опасного retry.
- API/worker logs содержали 0 совпадений API key и conversation content; outbox содержал 0 forbidden prompt/response/content/memory/image payloads.
- Дневные правила реализованы: exact yesterday→today percentage, immutable first-in-period baseline, wellness `0..8`, self-reported task completion и shared places. Накопленные итоги отсутствуют. Реальные даты, команды и капитаны не создавались.
- Browser stale-task gate: completion устаревшего задания вернул `409 MARATHON_TASK_DATE_INVALID`; UI перечитал состояние, убрал старую карточку и показал спокойное сообщение о смене даты. На viewport `390px` горизонтального переполнения нет.
- External-provider disclosure исправлен и проверен в чистом browser profile: «Сообщения и необходимый контекст будут переданы внешнему сервису GenAPI для формирования ответа.» Прежний ошибочный test-mode текст отсутствует; до consent composer остаётся disabled.
- Read-only GenAPI recovery review: native endpoint `POST https://api.gen-api.ru/api/v1/networks/grok-4-5` официально поддерживает `messages`, асинхронный `request_id` и polling через `GET /api/v1/request/get/{id}` со статусами `processing|success|error` и provider cost metadata. Это позволяет безопасно восстанавливать состояние только после получения `request_id`. Документация не описывает idempotent initial submit, lookup по client/X-Request-ID или status-by-client-id, поэтому timeout до получения `request_id` остаётся неразрешимой pre-ID ambiguity. Платный probe, adapter migration, blind resubmit, manual refund и expiry policy не выполнялись. Источники: [Grok 4.5 API](https://gen-api.ru/model/grok-4-5/api), [получение результата](https://gen-api.ru/docs/v1/generations/getting-the-result), [статусы генерации](https://gen-api.ru/docs/generation), [webhooks](https://gen-api.ru/docs/webhooks).
- Food vision не входит в runtime: его storage, vision-provider, privacy и token/refund зависимости перечислены в product scope и требуют отдельной задачи.
- Блокер полного real-AI acceptance: требуется подтверждённый контракт GenAPI на идемпотентный initial submit/status-by-client-id либо отдельно принятое продуктовое правило для необратимо потерянного pre-ID результата. До решения текущая synthetic `outcomeUnknown` operation и её reservation остаются неизменными.

Ручной сценарий: [gerbi-marathon-manual-acceptance.md](../06-development/gerbi-marathon-manual-acceptance.md).

## AI-002 — isolated companion-memory verification

- Дата: 2026-07-31. Ветка `back/ai-002-companion-memory`; stable `atlas-v01` и `main` не изменялись.
- Изоляция: Compose project `atlas-ai002`, отдельные PostgreSQL/Redis volumes и runtime containers; API был доступен только на временном порту `3201`.
- Runtime: Node.js `24.18.0`, pnpm `11.14.0`, PostgreSQL `17`, Redis `8`, `AI_PROVIDER=fake`.
- Migration image собран из актуального checkout и содержит `0010_ai_002_companion_memory.sql`. Migrations `0000–0010` применены дважды; `drizzle.__drizzle_migrations` содержит 11 записей.
- Созданы nullable profile columns, `ai_memories`, `ai_memory_extractions`, active partial unique index и constraints.
- API regression: 13 suites / 55 tests; worker regression: 7 suites / 32 tests. Focused PostgreSQL memory suite подтверждает persistence, receipt idempotency, owner scoping, deletion и replay guards.
- Синтетический flow registration → profile → persona → completion → two daily weights → quick reply прошёл. Operation завершилась `succeeded`, wallet изменился `100 → 99`.
- HTTP retry вернул тот же operation. Success создал ровно один extraction outbox, один durable receipt и один active fact.
- Runtime `MemoryContextBuilder` подтвердил наличие target/start/current weight и active fact; размер context — 237 из 1600 Unicode code points.
- `DELETE /api/v1/ai-memory/{id}` вернул `204`; следующий list вернул 0 элементов. Receipt сохраняется и не позволяет retry воскресить удалённый факт.
- Extraction использует stable BullMQ `jobId = outboxId`, не вызывает GenAPI и не создаёт токенных эффектов.
- Logs/outbox не содержат prompt, response, memory value, API keys или raw provider errors. Реальный AI provider в AI-002 не проверялся.

## AI-001 — GenAPI technical acceptance

- Date: 2026-07-31. Branch commit `64a376d10958e49633701e7542a46930f28b6dc4` was deployed as isolated Compose project `atlas-ai-001`; stable `atlas-v01` remained on fake.
- API/worker/migrate images built successfully without published ports. Migration `0009_ai_001_genapi_adapter` ran twice; both runs passed and Drizzle metadata contained 10 entries.
- Two sequential synthetic requests with `aiProviderProcessing` succeeded through `grok-4-5`; conversation history was persisted and reused.
- Usage was `293/125/418` and `338/132/470` input/output/total tokens. Latency was `3596 ms` and `3744 ms`, average `3670 ms`.
- GenAPI did not return monetary cost, so `cost=null` was recorded instead of inventing a tariff.
- Ledger contained two reservations and two confirmations; balance changed from 100 to 98.
- A synthetic user without provider consent caused no GenAPI request: `technicalError/safetyRejected`, one refund and restored balance 100.
- Worker tests passed 16/16; API plus PostgreSQL integration tests passed 50/50; focused lint exited 0.
- Technical logs contained only safe provider/model/request/response IDs, usage, latency and status/error metadata. API key, prompt, user text, full response and raw provider body were absent.

This acceptance is limited to synthetic test users. User-facing provider consent and `outcomeUnknown` reconciliation remain separate tasks.

## AI-003 — isolated Daily Coach verification

- Date: 2026-08-21. Clean test-server checkout and runtime image were built
  from implementation commit `3683737` on branch
  `back/ai-003-daily-coach`; `main`, `atlas-v01` and `atlas-ui-001` were not
  changed.
- Runtime: Node.js `24.18.0`, pnpm `11.14.0`, PostgreSQL `17.10`; API image
  digest `sha256:7975271b8e54fc13d02b84f400fab6e5bd4b4dfd3dce3398be39f7c5f4b79dbc`.
- Migration `0011_ai_003_daily_coach.sql` was present in the exact image,
  applied twice safely, registered as the twelfth Drizzle migration and
  created the unique owner/local-date constraint.
- PostgreSQL integration passed 6/6: eight concurrent lazy reads produced one
  row, the local date followed the profile IANA timezone, valid transitions
  and exact replay succeeded, changed payload/resource reuse conflicted,
  invalid transitions rolled back, and ownership/onboarding guards held.
- HTTP acceptance passed registration → profile → persona → onboarding
  completion → weight → `GET /ai-daily-states/today` → `inProgress` →
  `completed`. The persisted result was one `completed` row for one local date;
  same-key replay returned the stored response, changed payload returned `409`,
  and a backward transition returned `409` without changing state.
- Daily context contained only existing profile, current daily weight and one
  active safe memory fixture. The marker was absent from API logs and outbox
  payloads; no Daily Coach analytics/outbox event was invented.
- Exact-image regression: API 76/76 including all PostgreSQL suites; worker
  32/32. Stable `atlas-v01` and isolated UI project `atlas-ui-001` remained
  healthy throughout verification.
- Scope remained backend-only: no frontend, scheduling, notifications,
  prompts, character behavior or AI-provider change was introduced.

## UI-005 / BACK-UI-001 — isolated daily-upsert verification

- Date: 2026-07-28. Branch `ui/ui-001-daily-weight` was deployed from checkout `e25d85e` as the isolated Compose project `atlas-ui-001`; stable `atlas-v01` and its containers, volumes, environment and ports were not changed.
- Migration: renamed `0008_back_001_daily_weight.sql` was built into the migration image, applied to the isolated PostgreSQL database and re-run safely. The resulting schema has `local_date`, `updated_at` and `is_current`; the migration journal has nine entries.
- Contract and data: backend PostgreSQL integration `weight-daily-postgres.integration.spec.ts` passed 6/6; it covers created/updated results, local-date boundaries, idempotent replay, concurrent saves and one current history value per day. OpenAPI regeneration and generated-client drift check passed.
- Web: the production web container ran the targeted `/today` component suite, 11/11. In a clean browser profile the synthetic completed user logged in, created `84.25`, updated it to `84.26` on the same day, reloaded the persisted value and opened `/quick-reply`. At mobile viewport `390×844`, the field, update action, history, graph and navigation remained usable.
- Exposure: only the nginx gateway is published at `http://5.42.126.71:3102`; API, worker, PostgreSQL and Redis remain internal to the dedicated Compose network.

## UI-001 — isolated daily-weight UI verification

- Date: 2026-07-22. Branch `ui/ui-001-daily-weight` was copied into `/opt/projects/ai-hudeetor-ui-001-verify` and started as Compose project `atlas-ui001`; stable `atlas-v01` containers and volumes were not changed.
- Runtime: images built with Node.js 24.18.0 and pnpm 11.14.0; frozen install and workspace production build completed. Next.js output contains `/today` alongside the existing `/quick-reply`.
- Topology: separate PostgreSQL/Redis volumes, API `3101`, web `3100`, healthy API/worker/web/PostgreSQL/Redis; migrations applied successfully to the isolated database.
- Automated checks in the baseline image: web component tests 10/10, workspace typecheck and frontend lint passed. Final host regression after adding the explicit disabled/loading assertion passed 11/11; full repository lint passed after documenting the intentional Nest request-DTO value import, and changed files pass Prettier check.
- Browser acceptance: Chromium mobile E2E 1/1 passed registration → profile → persona → completion → `/today` → weight `98,4` → `Записано` → reload persistence → `/quick-reply`.
- Safe retry is covered by component tests: an unchanged weight payload reuses one `Idempotency-Key` after a network failure. Backend idempotency and ownership implementation were not changed.
- Access from the owner's computer while the SSH tunnel is active: `http://localhost:3100/today`; API remains isolated at `http://localhost:3001/api/v1` through the same tunnel.
- A fresh browser without an existing completed cookie session intentionally shows `Сессия закончилась`; UI-001 does not add or weaken authentication, and the current `main` has no login UI.

## BACK-UI-001 — isolated PostgreSQL verification

- Date: 2026-07-25. Verification ran on the test server in an isolated checkout and temporary PostgreSQL 17 containers; stable `atlas-v01`, its containers, volumes and ports were not touched.
- Migration: `0007_back_001_daily_weight.sql` was applied after the existing schema. The normal Drizzle runner applied the migration safely and its repeat run was idempotent. A separate legacy-data check applied the migration to two same-day historical rows: neither was deleted, the row latest by `updated_at`, then `created_at`, then `id` became `is_current=true`.
- PostgreSQL integration: `weight-daily-postgres.integration.spec.ts` passed 6/6. It confirms create/update for one IANA-timezone local date, next-day creation around a UTC boundary, identical idempotency replay, concurrent saves, legacy-current history filtering and daily ordering used by history/graphs.
- API/contract quality: backend typecheck and API production build passed; OpenAPI/client generation produced no generated drift and focused ESLint passed. The workspace-wide API `tsc --noEmit` still reports pre-existing `TS6307` project-reference errors across unrelated backend sources; it is not used by the production API build.

This verification covers the original backend-only scope. The later UI merge and current runtime verification are recorded separately.

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
