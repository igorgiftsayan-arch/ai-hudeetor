# Стратегия тестирования

## Уровни

- Unit: доменные правила, персона/настройки, расчёты и классификация ошибок.
- Integration: PostgreSQL/Redis/S3-адаптеры, миграции, транзакции, API auth и владение.
- Contract: единый API error format и адаптеры внешних поставщиков.
- E2E: критические пользовательские пути на тестовой среде.
- Smoke: короткая проверка после выкладки по [чек-листу](../07-deployment/smoke-test.md).

## Обязательные негативные проверки

Чужие данные недоступны; баланс не уходит ниже нуля; повтор не списывает/не начисляет дважды; техническая AI-ошибка возвращает резерв; стартовые и реферальные токены однократны; заблокированная реферальная связь не награждается; опасные AI-запросы получают безопасную реакцию; загрузки ограничены.

Тесты детерминированы, не используют реальные секреты или платные внешние вызовы и очищают изолированные данные.

## Runtime policy

Локальный host runtime Codex может не совпадать с baseline Node.js/pnpm. В таком случае unit, static и иные совместимые проверки разрешено выполнять локально, но их результат не заменяет final verification. Authoritative проверка зависимостей, образов, migrations, PostgreSQL/Redis integration, E2E и smoke выполняется в Docker/test-server среде, соответствующей [engineering baseline](../01-architecture/engineering-baseline.md). Несовпадение host runtime фиксируется как ограничение среды, а не как project failure.

## Tooling BOOT-001

- Backend unit/HTTP: Jest и Supertest.
- Database/queue integration: Jest с реальными PostgreSQL/Redis, добавляется вместе с первым соответствующим use case.
- Frontend component: Vitest, React Testing Library и user-event.
- E2E: Playwright; BOOT-001 содержит mobile Chromium scaffold smoke.
- OpenAPI generation и Orval client generation образуют начальный contract gate.
