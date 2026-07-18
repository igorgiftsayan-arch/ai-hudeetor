# ADR-004: NestJS modular monolith

- Статус: принято
- Дата: 2026-07-18

## Решение

Использовать NestJS + TypeScript как modular monolith. `apps/api` и `apps/worker` — разные composition roots одной backend-кодовой базы и одного commit. Доменные модули живут в `packages/backend`.

Внутри модуля зависимости направлены `transport → application → domain`, а `infrastructure` реализует domain/application ports. NestJS DI используется для composition, но domain не зависит от framework. Application use case задаёт транзакционную границу.

## AI boundary

AI-модуль содержит Scenario Service, AI Gateway, provider adapters, Prompt Registry, Context Builder, Safety Layer и Usage/Cost Recorder. Provider SDK существует только в адаптере. Gateway не принимает решений о доступе, цене, токенах, рефералах или retention. AI-провайдер не выбран.

## Ограничения

- Модуль не импортирует infrastructure/repository/ORM entity другого модуля.
- API и worker используют общие application/domain use cases.
- Критические транзакции, locks, raw SQL и constraints не скрываются ORM.
- Циклы и `forwardRef` не являются нормальным способом связи модулей.
- Микросервисы и отдельный AI-service отложены до измеримой необходимости.
