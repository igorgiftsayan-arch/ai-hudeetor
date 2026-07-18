# Backlog и открытые решения

## Перед BOOT-001

- Закрепить совместимые версии Node.js, pnpm, TypeScript, Next.js, React и NestJS.
- Выбрать ORM/query builder и migration tool короткой проверкой транзакций, locks, constraints и raw SQL.
- Выбрать Redis queue, PWA, form/query/schema/test/OpenAPI tooling без изменения ADR.
- Решить, нужен ли monorepo task runner сверх pnpm.
- Создать только технический каркас, local/test Docker и CI skeleton в границах ARCH-001.
- Выбрать S3 implementation и observability tools для test; AI-провайдера не выбирать.
- Зафиксировать канал password recovery до реализации соответствующего сценария.

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
