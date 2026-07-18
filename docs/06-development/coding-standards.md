# Стандарты кода

Конкретные линтеры и форматтеры выбираются в BOOT-001. Независимо от tooling:

- Явные границы модулей и один уровень ответственности.
- Типизированные/валидируемые контракты на внешних границах.
- Никаких секретов, цен AI-действий или environment-specific адресов в коде.
- Доменная логика не зависит напрямую от конкретного AI, платежного или аналитического поставщика.
- Токенные и реферальные изменения транзакционны и идемпотентны.
- Ошибки используют [единый формат](../03-api/error-format.md); логи структурированы и не содержат чувствительные payload.
- Все изменения схемы выполняются миграциями; ручное изменение production/test БД запрещено.
- Имена соответствуют [глоссарию](../00-product/glossary.md), публичные контракты документированы.
- Комментарии объясняют причину, а не повторяют код.

## ARCH-001 conventions

- PostgreSQL: snake_case, plural tables, `<entity>_id`, `idx_<table>_<columns>`, `uq_<table>_<purpose>`.
- TypeScript: camelCase values/functions, PascalCase types/components, kebab-case files.
- Backend организован по доменам и слоям `domain/application/infrastructure/transport`.
- REST resources plural, JSON camelCase, internal events `<domain>.<event>.v1`.
- Деньги и токены — integer. Async commands возвращают operation resource.
- Полные правила и enforcement — [system-architecture.md](../01-architecture/system-architecture.md).
