# AGENTS.md

Инструкции для Codex и других исполнителей проекта.

## Обязательное чтение перед каждой задачей

1. [PRD V1](docs/00-product/prd-v1.md)
2. [Границы V1](docs/00-product/scope-v1.md)
3. [Обзор системы](docs/01-architecture/system-overview.md)
4. [Доменная модель](docs/02-domain/domain-model.md)
5. [Реестр событий](docs/04-analytics/event-registry.md)
6. [Definition of Done](docs/06-development/definition-of-done.md)
7. [Техническая архитектура](docs/01-architecture/system-architecture.md)
8. [Структура репозитория](docs/01-architecture/repository-structure.md)
9. [Engineering baseline V0.1](docs/01-architecture/engineering-baseline.md)

Дополнительно прочитать документы затрагиваемой области и проверить [текущий статус](docs/08-roadmap/current-status.md).

## Непереговорные правила

- Не добавлять функции за пределами V1.
- Не создавать аналитические события вне единого реестра.
- Не хранить цены AI-действий в коде: источник истины — управляемые данные админки.
- Все токенные операции выполнять транзакционно; баланс не может быть отрицательным.
- При технической ошибке AI полностью возвращать зарезервированные токены.
- Бизнес-неуспех AI не является технической ошибкой и не вызывает автоматический возврат.
- Реферальным AI-действием считается только успешно завершённое действие, включая бесплатный быстрый AI-ответ.
- Все изменения базы выполнять миграциями.
- Все API используют [единый формат ошибок](docs/03-api/error-format.md).
- Все ручные действия администратора журналировать.
- Пользователь не может читать или изменять чужие данные.
- Новую функциональность сопровождать тестами.
- После каждой задачи обновлять `docs/08-roadmap/current-status.md` и `CHANGELOG.md`.
- При конфликте документации не начинать реализацию: описать противоречие и запросить решение.
- Не выбирать AI-провайдера без отдельного архитектурного решения.
- Не хранить секреты в репозитории.
- Не обрабатывать аккаунты пользователей младше 18 лет в V1.
- Начинать реализацию с application use case и явно определять транзакционную границу.
- Не размещать бизнес-логику в `apps/*`; API и worker — только composition roots.
- Не импортировать repositories, infrastructure или ORM entities чужого backend-модуля.
- Не обходить NestJS API через Next.js Route Handlers или Server Actions.
- Не использовать Redis, очередь или аналитику как источник бизнес-истины.
- Для критических операций добавлять idempotency и ограничения PostgreSQL.
- Соблюдать naming/structure/API/event patterns из [технической архитектуры](docs/01-architecture/system-architecture.md).
- Любое архитектурное отклонение документировать новым/обновлённым ADR до реализации.
- Использовать утверждённый engineering baseline; смену ORM, queue, auth, contract, testing, PWA или monorepo tooling предварительно оформлять ADR.
- Не использовать `drizzle-kit push` для общих или тестовых сред: изменения схемы проходят через проверяемые SQL migrations.
- Не выносить Drizzle schemas/client за `infrastructure` и не заменять явные критические транзакции удобством ORM.
- Не использовать Redis или BullMQ как session/business truth; подтверждённое состояние хранится в PostgreSQL.
- Не хранить auth secrets, cookies или session state в browser Web Storage и не кешировать персональные/API/admin данные service worker.
- Generated API contracts не редактировать вручную; изменение REST DTO сопровождается OpenAPI regeneration и contract check.
- Не логировать raw DTO, cookies, authorization headers, секреты, PII, signed URLs, изображения или полный AI-контент.
- Утверждённый runtime baseline остаётся обязательным. Несовпадение локальных версий Node.js или pnpm у Codex не является дефектом проекта и не блокирует реализацию, если проверка не требует точного runtime; такие проверки окончательно выполняются в совместимом Docker/test-server окружении.

Для задач, затрагивающих токены, AI или персональные данные, дополнительно обязательны [модель экономики токенов](docs/02-domain/token-economics-model.md), [обработка AI-ошибок](docs/05-security/ai-error-handling.md) и [политика данных](docs/05-security/privacy-and-data-policy.md).

## Рабочий цикл

Одна задача — один проверяемый результат. Использовать [шаблон задачи](docs/06-development/codex-task-template.md), следовать [процессу разработки](docs/06-development/development-process.md) и перед завершением проверить [Definition of Done](docs/06-development/definition-of-done.md).
