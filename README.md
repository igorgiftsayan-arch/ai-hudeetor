# AI-друг для похудения

PWA с персональным AI-компаньоном для людей 30–50 лет, которым важно продолжать путь снижения веса после срывов, а не начинать заново.

Репозиторий содержит технический каркас BOOT-001: mobile-first PWA, NestJS API, отдельный worker, PostgreSQL и Redis. Продуктовые функции ещё не реализованы.

## Навигация

- [Видение продукта](docs/00-product/product-vision.md)
- [PRD V1](docs/00-product/prd-v1.md) и [границы V1](docs/00-product/scope-v1.md)
- [Архитектура](docs/01-architecture/system-overview.md) и [технологический стек](docs/01-architecture/technology-stack.md)
- [Доменная модель](docs/02-domain/domain-model.md)
- [API](docs/03-api/api-conventions.md)
- [Аналитика](docs/04-analytics/analytics-plan.md)
- [Безопасность](docs/05-security/security-baseline.md)
- [Разработка](docs/06-development/development-process.md)
- [Развёртывание](docs/07-deployment/test-server.md)
- [Текущий статус](docs/08-roadmap/current-status.md)

Исполнителям необходимо начать с [AGENTS.md](AGENTS.md). Термины определены в [глоссарии](docs/00-product/glossary.md).

## Требования

- Node.js `24.18.x`;
- pnpm `11.14.0`;
- Docker с Compose plugin для PostgreSQL/Redis и полного окружения.

Версии и причины выбора зафиксированы в [engineering baseline](docs/01-architecture/engineering-baseline.md).

## Установка

```bash
cp .env.example .env
pnpm install --frozen-lockfile
```

Значения `.env.example` предназначены только для локальной среды. Реальные секреты и test-server credentials в Git не хранятся.

## Локальная разработка

Поднять зависимости и применить миграции:

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm db:check
```

Запустить web, API и worker:

```bash
pnpm dev
```

Endpoints:

- web: `http://localhost:3000`;
- API liveness: `http://localhost:3001/api/v1/health`;
- API readiness: `http://localhost:3001/api/v1/health/ready`;
- OpenAPI: `http://localhost:3001/api/v1/docs`;
- worker liveness/readiness: внутри Compose `http://worker:3002/health` и `/health/ready`.

## Полный запуск через Docker Compose

```bash
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d api worker web
pnpm smoke
docker compose ps
```

Остановка без удаления данных:

```bash
docker compose down
```

Удаление volumes не является штатной командой и выполняется только осознанно для локальной среды.

## Проверки качества

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:generate
pnpm test:e2e
```

Playwright E2E требует запущенного web. PostgreSQL/Redis integration checks требуют поднятых сервисов.

## Test environment

Compose описывает минимальную топологию `web`, `api`, `worker`, PostgreSQL и Redis. На тестовом сервере необходимо заменить dummy credentials через защищённые environment variables, обеспечить HTTPS/reverse proxy, применить миграции отдельной командой и выполнить [smoke test](docs/07-deployment/smoke-test.md). S3, CI и production deployment в BOOT-001 не входят.
