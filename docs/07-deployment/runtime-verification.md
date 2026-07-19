# BOOT-001 — runtime verification

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

## Переход к VERT-001

VERT-001 должен начинаться только отдельной утверждённой задачей. Его входные условия:

1. Использовать принятые repository boundaries и engineering baseline без смены стека.
2. Реализовывать первый вертикальный срез через application use cases, явные транзакционные границы и REST API.
3. Не добавлять продуктовые функции вне утверждённого V1 и конкретного scope VERT-001.
4. Сохранить PostgreSQL источником бизнес-истины; Redis использовать только для очередей и координации.
5. До работы с реальными пользователями применить обязательные auth, ownership, privacy и logging ограничения.

Реализация VERT-001 в рамках этой задачи не запускалась.
