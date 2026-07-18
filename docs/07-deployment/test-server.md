# Тестовый сервер

Первая общая рабочая среда проекта — тестовый сервер. BOOT-001 подготовил Compose topology и инструкции; фактический внешний сервер ещё не развёрнут.

## Предусмотренные компоненты

- PWA frontend;
- backend API;
- PostgreSQL;
- Redis;
- S3-совместимое хранилище;
- reverse proxy;
- HTTPS;
- защищённые переменные окружения;
- резервное копирование;
- централизованное структурированное логирование;
- smoke test после каждой выкладки.

Среда изолирована от production. Реальные адреса, пароли, ключи и секреты не документируются и не коммитятся; [.env.example](../../.env.example) содержит только имена и фиктивные значения.

## BOOT-001 topology

Обязательные сервисы сейчас: `web`, `api`, `worker`, `postgres`, `redis`. S3 добавляется перед первым upload-сценарием. Reverse proxy и HTTPS обязательны до доступа реальных пользователей, но не создаются локальным Compose.

Порядок test запуска:

1. Установить защищённые environment variables вне checkout.
2. Выполнить `docker compose build` из проверенного commit.
3. Поднять PostgreSQL/Redis и дождаться health.
4. Запустить `docker compose --profile tools run --rm migrate`.
5. Поднять API/worker/web и дождаться readiness.
6. Настроить HTTPS reverse proxy.
7. Выполнить `pnpm smoke` и чек-лист [smoke-test.md](smoke-test.md).

BOOT-001 не выполнял реальный deployment, поэтому адрес, commit SHA deployment и результаты внешнего smoke пока отсутствуют. Последняя проверка и остающиеся шаги: [runtime-verification.md](runtime-verification.md).
