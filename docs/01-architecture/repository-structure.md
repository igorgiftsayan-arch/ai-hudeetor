# Структура монорепозитория

Основание: [ADR-001](architecture-decisions/ADR-001-monorepository.md), [ADR-002](architecture-decisions/ADR-002-technical-stack.md) и [ADR-004](architecture-decisions/ADR-004-backend-framework.md).

```text
/
├── apps/
│   ├── web/{public,src/{app,features,shared,middleware}}/
│   ├── api/src/{main.ts,api-composition-root}/
│   └── worker/src/{main.ts,worker-composition-root}/
├── packages/
│   ├── backend/src/
│   │   ├── identity/           ├── profiles/
│   │   ├── tracking/           ├── ai-companion/
│   │   ├── food/               ├── planning/
│   │   ├── token-economy/      ├── payments/
│   │   ├── referrals/          ├── content/
│   │   ├── notifications/      ├── analytics/
│   │   ├── files/              └── administration/
│   ├── api-contracts/
│   ├── test-kit/
│   ├── config-typescript/
│   └── config-lint/
├── database/{migrations,seeds}/
├── tests/{integration,contract,e2e}/
├── infrastructure/{containers,reverse-proxy,deployment,observability}/
├── scripts/
├── docs/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

Это целевая структура BOOT-001; ARCH-001 не создаёт runtime-каталоги.

## Границы

`apps/*` — только запуск/composition; бизнес-логика запрещена. `apps/web` работает только через REST. `packages/backend` организован по доменам; каждый модуль содержит `domain`, `application`, `infrastructure`, `transport`. Domain не зависит от infrastructure, а модуль не импортирует infrastructure другого.

`packages/api-contracts` содержит DTO/схемы/типы без ORM, domain objects и правил. Миграции — единственный источник схемы; seeds — только test data. Unit tests рядом с кодом, остальные — в `tests/`. Пользовательские файлы существуют только в S3.

## Карта функций

| V1 | Backend modules | Web feature |
|---|---|---|
| Auth/onboarding | identity, profiles | onboarding, profile |
| Вес/check-ins/sport | tracking | tracking |
| AI-друг | ai-companion, token-economy | ai-companion |
| Фото/продукты | files, food, ai-companion | food |
| Меню/списки | planning | planning |
| Токены/платежи | token-economy, payments | tokens |
| Рефералы | referrals | referrals |
| Контент/уведомления | content, notifications | соответствующие features |
| Админка | administration + application APIs | administration |
