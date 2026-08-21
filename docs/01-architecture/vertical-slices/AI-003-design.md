# AI-003 — Daily Coach backend design

## Статус и границы

Документ фиксирует backend-only вертикаль AI-003. В неё входят persisted daily
state, state machine, lazy initialization, структурированный daily context и REST
API. Frontend, cron, push, уведомления, prompt-тексты, характер AI и AI-004 не
входят.

База реализации — `back/ai-002-companion-memory` commit
`4f169b1b1e03b8c57426af3e599cde2148cfee2c`. Она включает `origin/main`
`ac398f20e49e6c45696022928f21b32688e55607`, AI-001 и AI-002 без расхождений
по weight/UI backend contracts.

## Доменная модель

`AiDailyState` принадлежит одному пользователю и одной локальной календарной
дате. Состояние не является расписанием или уведомлением и не запускает AI.

Состояния:

- `notStarted` — строка создана lazy initialization, взаимодействие дня ещё не
  начато;
- `inProgress` — пользователь начал дневной сценарий;
- `completed` — дневной сценарий завершён, состояние terminal.

Разрешённые переходы:

| Текущее | Целевое | Результат |
|---|---|---|
| `notStarted` | `inProgress` | transition |
| `inProgress` | `completed` | transition |
| любое | то же состояние | безопасный replay/no-op |
| `notStarted` | `completed` | `409 DAILY_STATE_TRANSITION_INVALID` |
| `inProgress` | `notStarted` | `409 DAILY_STATE_TRANSITION_INVALID` |
| `completed` | другое | `409 DAILY_STATE_TRANSITION_INVALID` |

State machine работает только для пользователя с `onboardingStatus=completed`.
Переход блокирует строку `FOR UPDATE`; ответ и эффект mutating-команды
сохраняются в общей PostgreSQL idempotency model в одной транзакции.

## Persistence

Migration `0011_ai_003_daily_coach.sql` создаёт:

```text
ai_daily_states
├── id uuid primary key
├── user_id uuid not null references users(id) on delete cascade
├── local_date date not null
├── status text not null
├── started_at timestamptz null
├── completed_at timestamptz null
├── created_at timestamptz not null default now()
└── updated_at timestamptz not null default now()
```

Ограничения:

- `uq_ai_daily_states_user_local_date` на `(user_id, local_date)`;
- `ck_ai_daily_states_status` ограничивает три состояния;
- `ck_ai_daily_states_timestamps` согласует status/timestamps;
- индекс `idx_ai_daily_states_user_local_date` для owner-scoped history/read;
- migration additive, не меняет существующие данные и повторно применяется
  штатным Drizzle runner.

Локальная дата вычисляется PostgreSQL expression
`(CURRENT_TIMESTAMP AT TIME ZONE user_profiles.timezone)::date`. Серверная UTC
дата не используется как пользовательская. Concurrent lazy initialization
выполняет `INSERT ... ON CONFLICT (user_id, local_date) DO UPDATE` без изменения
business state, поэтому все конкурирующие запросы получают одну строку.

## Daily context

Daily context — структурированный server-side read model, а не prompt artifact.
Он вычисляется на каждый read и не сохраняется в `ai_daily_states`, логах,
analytics или outbox.

```text
localDate
timezone
profile.displayName? / targetWeightKg? / personaId?
weight.startWeightKg? / currentWeightKg? / changeWeightKg? / lastRecordedAt?
memories[]: category, key, value (только active, максимум 12)
```

Отсутствующие значения не подменяются. Вес берётся только из дневных
`is_current=true` записей. Memory owner scope и soft-delete сохраняются;
чувствительные значения повторно исключаются defense-in-depth. Контекст не
смешивается с `MemoryContextBuilder` prompt string и не меняет AI provider
boundary AI-001/AI-002.

## API contract

### `GET /api/v1/ai-daily-states/today`

- authenticated cookie session;
- owner-scoped;
- требует completed onboarding;
- определяет текущую локальную дату по сохранённой IANA timezone;
- атомарно создаёт `notStarted`, если строки ещё нет;
- concurrent calls возвращают один `id`;
- response `200`:

```json
{
  "id": "uuid",
  "localDate": "2026-08-21",
  "status": "notStarted",
  "startedAt": null,
  "completedAt": null,
  "createdAt": "ISO-8601 UTC",
  "updatedAt": "ISO-8601 UTC",
  "context": {
    "localDate": "2026-08-21",
    "timezone": "Asia/Irkutsk",
    "profile": {},
    "weight": {},
    "memories": []
  }
}
```

Ошибки: `401 SESSION_INVALID`, `409 ONBOARDING_INCOMPLETE`, `409
PROFILE_TIMEZONE_REQUIRED`.

### `POST /api/v1/ai-daily-states/{id}/transitions`

- authenticated cookie session, CSRF и permitted Origin;
- required `Idempotency-Key` (16–128 visible ASCII characters);
- body `{ "targetStatus": "inProgress" | "completed" }`;
- owner check скрывает чужой resource как `404 RESOURCE_NOT_FOUND`;
- same key + same payload возвращает сохранённый `200` response;
- same key + changed payload — `409 IDEMPOTENCY_KEY_REUSED`;
- same current/target state — успешный `200` no-op;
- недопустимый переход — `409 DAILY_STATE_TRANSITION_INVALID`;
- response содержит только транзакционно сохранённое состояние; актуальный
  daily context читается через `GET /today`. Это гарантирует точный replay
  сохранённого HTTP-результата без повторного построения изменяемого контекста.

## События и privacy

Новых продуктовых событий нет: event registry не содержит события AI daily
state. Outbox не создаётся, поскольку в scope отсутствует consumer/worker effect.
В логах допустимы request ID, resource ID и безопасный error code; daily context,
memory values, profile values и weight values не логируются.

## Verification

- unit: transition matrix и same-state replay;
- PostgreSQL integration: lazy initialization, concurrency, timezone boundary,
  owner scope, idempotency и rollback;
- API/contract: auth, CSRF/Origin, DTO validation, error envelope и OpenAPI drift;
- migration: clean database, `0000–0011`, repeat run, Drizzle metadata/table;
- isolated runtime: два timezone users, concurrent GET, valid/invalid/replayed
  transitions, privacy log scan;
- full relevant backend/API regressions; fake/genapi configuration unchanged.
