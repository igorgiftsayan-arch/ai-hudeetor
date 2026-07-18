# BOOT-001.1 — runtime verification

## Сводка

- Дата: 2026-07-18.
- Рабочая машина: macOS arm64, среда Codex.
- Вердикт: **частично проверено; Docker runtime не подтверждён**.
- Причина ограничения: команды `docker`, `colima` и `podman` отсутствуют. Это ограничение среды, а не зафиксированный отказ Compose.

BOOT-001 нельзя считать полностью закрытым до успешного запуска Compose на машине с Docker. Переход к VERT-001 не подтверждён.

## Версии и установка

Системная среда не соответствует baseline: Node.js `v26.0.0`, pnpm `11.9.0`. Для воспроизводимой проверки использован временный утверждённый toolchain:

- Node.js `v24.18.0`;
- pnpm `11.14.0`.

Команда:

```bash
npx --yes --package=node@24.18.0 --package=pnpm@11.14.0 pnpm install --frozen-lockfile
```

Результат: успешно, lockfile актуален, все 9 workspace projects распознаны.

## Docker и Compose

Запланированные команды не выполнены из-за отсутствия Docker CLI:

```bash
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d api worker web
```

Альтернативно подтверждено:

- `compose.yaml` успешно разобран YAML parser с поддержкой aliases;
- в Docker Hub существуют tags `node:24.18.0-bookworm-slim`, `postgres:17-alpine`, `redis:8-alpine`;
- Dockerfile и Compose присутствуют, но их build/runtime семантика без Docker не считается проверенной.

## Локальные production entrypoints

Без PostgreSQL и Redis локально запущены собранные entrypoints:

| Компонент | Проверка | Результат |
|---|---|---|
| Web | `/` | `200`, health page содержит `ATLAS V0.1` |
| Web | `/manifest.webmanifest` | `200`, `display=standalone` |
| Web | `/sw.js` | `200`, `Cache-Control: no-cache, no-store` |
| Web | Playwright mobile Chromium | прошёл; service worker зарегистрирован и active |
| API | `/api/v1/health` | `200`, `status=ok` |
| API | `/api/v1/health/ready` | `503`, ожидаемо без PostgreSQL/Redis |
| Worker | `/health` | `200`, процесс и health server запущены |
| Worker | `/health/ready` | `503`, ожидаемо без PostgreSQL/Redis |

`pnpm smoke` не запускался: он намеренно требует успешный API readiness, которого нельзя получить без PostgreSQL/Redis.

## Найденная и исправленная проблема

Повторный NestJS build мог завершиться с кодом `0`, но удалить `apps/api/dist/main.js`. Причиной было наследование `composite/incremental` TypeScript state совместно с `deleteOutDir` Nest CLI: `dist` очищался, а неизменённый entrypoint не переэмитился.

Исправление: в build tsconfig API и worker отключены `composite`, `incremental` и declaration emit. Проверка после исправления: два последовательных build каждого приложения сохраняют `dist/main.js`; API production entrypoint запускается.

## Что остаётся подтвердить

На машине с Docker выполнить:

1. `docker compose build` для web/API/worker.
2. PostgreSQL и Redis health checks.
3. Первичный и повторный запуск bootstrap migration.
4. API и worker readiness при доступных зависимостях.
5. `pnpm smoke` и Playwright против Compose web.
6. `docker compose ps` без unhealthy/restarting services.

После фиксации успешного вывода этих команд BOOT-001 можно закрыть и подготовить VERT-001. До этого test server считается неразвёрнутым.

## BOOT-001.2 — проверка доступа к test server

- Дата: 2026-07-18.
- Docker CLI в текущей среде: отсутствует.
- Docker Compose: недоступен, поскольку отсутствует Docker CLI.
- SSH/SCP clients: установлены.
- Test-server hostname/IP, SSH user, SSH config alias и deployment credentials: не предоставлены и не обнаружены в разрешённой конфигурации проекта.
- Переменная `SSH_AUTH_SOCK` существует, но без известного target она не подтверждает доступ к какому-либо серверу и не использовалась для перебора hosts.

Вердикт: выполнить runtime verification непосредственно на test server сейчас невозможно. Результат Docker/Compose не имитировался, сетевые targets не угадывались.

Для продолжения требуется предоставить безопасным способом:

1. SSH hostname либо настроенный alias.
2. SSH user и способ аутентификации без помещения ключа в репозиторий.
3. Путь к checkout проекта либо разрешение создать его.
4. Test environment variables/secrets вне Git.
5. Подтверждение допустимого deployment window, поскольку команды изменят состояние test server.

После получения доступа выполнить на сервере из checkout нужного commit:

```bash
docker --version
docker compose version
cp .env.example .env
pnpm install --frozen-lockfile
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm migrate
docker compose up -d api worker web
pnpm smoke
pnpm test:e2e
docker compose ps
```

Дополнительно сохранить ответы API `/api/v1/health` и `/api/v1/health/ready`, worker `/health` и `/health/ready`, а также проверить web `/`, `/manifest.webmanifest` и `/sw.js`. Второй запуск migration обязателен для подтверждения повторяемости.
