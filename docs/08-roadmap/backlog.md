# Backlog и открытые решения

## Решено в BOOT-000/BOOT-001

- Закреплены версии Node.js, pnpm, TypeScript, Next.js, React и NestJS.
- Выбраны Drizzle/node-postgres, reviewed migrations, BullMQ, PWA, validation, OpenAPI и testing tooling.
- Принят pnpm workspace без дополнительного task runner.
- Создан технический каркас и local/test Compose topology без CI и бизнес-функций.

## Перед первым вертикальным продуктовым срезом

- Docker Compose runtime smoke, migrations, PostgreSQL/Redis readiness и API/worker/web health подтверждены в BOOT-001.
- [Дизайн VERT-001](../01-architecture/vertical-slices/VERT-001-design.md) и [контракты VERT-001.1](../01-architecture/vertical-slices/VERT-001-contracts.md) подготовлены; следующая отдельная задача — VERT-001.2 identity/server sessions.
- Реализовать только необходимые identity/profile boundaries вместе с первым сценарием, без пустых доменных модулей.
- Выбрать канал password recovery до реализации recovery flow.
- Выбрать S3 implementation до первого upload-сценария.

Декомпозиция первого продуктового среза находится в [VERT-001 backlog](vert-001-backlog.md). Его задачи не запускаются без отдельного подтверждения.

## Решено в DOC-002

- Реферальное окно, активный день и успешное AI-действие.
- Расчётная модель токенов, округление, минимум и правила возврата.
- Продуктовая модель покупки пакетов через «Пополнить токены».
- Разделение технической ошибки и бизнес-неуспеха AI.
- Возраст 18+, продуктовые сроки хранения и порядок удаления.

## Отложено до feature-задач или production

- Финансы: значения компонентов себестоимости, состав пакетов, цены, поставщик платежей, чеки, налоги и обязательные денежные возвраты.
- Analytics: словари параметров, ключевое событие retention, исключение тестовых аккаунтов и платформа.
- Privacy/safety: юридическая проверка по юрисдикциям, оператор/обработчики данных, контакт, тексты согласий и локализованные кризисные сценарии.
- Product: точные поля онбординга/чек-инов, параметры строгости и длины, содержание недельного отчёта и глубокого разбора.
- AI: provider/model, streaming, prompt UI, vector search и критерии будущего Python-service.
- Operations: production topology, окончательные RPO/RTO, autoscaling и disaster recovery.
- UX: navigation, accessibility, long-running operation states и безопасные drafts.

Эти пункты не разрешают добавлять функции за пределами V1.
