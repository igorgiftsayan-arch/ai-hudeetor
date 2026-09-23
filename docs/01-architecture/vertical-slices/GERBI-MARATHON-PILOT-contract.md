# GERBI-MARATHON-PILOT — backend contract

**Статус:** минимальный контракт для параллельной реализации backend/frontend.
Формулы, отмеченные `TBD`, не вычисляются до решения владельца.

## API conventions

- все endpoints имеют prefix `/api/v1`;
- session cookie обязательна;
- mutating endpoints требуют CSRF, разрешённый Origin и `Idempotency-Key`;
- один key с тем же payload возвращает сохранённый response;
- один key с другим payload или resource возвращает `409
  IDEMPOTENCY_KEY_REUSED`;
- error envelope соответствует `docs/03-api/error-format.md`.

## Bootstrap и membership

### `POST /marathons`

Test/pilot bootstrap, доступен только при server-side
`MARATHON_BOOTSTRAP_ENABLED=true`. Создаёт marathon, первую team и membership
текущего пользователя с ролью `captain` одной транзакцией.

Request:

```json
{
  "name": "Герби-Марафон",
  "startsOn": "2026-09-28",
  "endsOn": "2026-10-11",
  "teamName": "Команда Антонины"
}
```

Response `201`:

```json
{
  "marathonId": "uuid",
  "teamId": "uuid",
  "membershipId": "uuid",
  "role": "captain",
  "joinCode": "opaque-code"
}
```

Реальный вызов не выполняется, пока владелец не даст даты и капитана.

### `POST /marathon-team-memberships`

Request: `{ "joinCode": "opaque-code" }`.

Response `201`: marathon/team/membership IDs и `role: "participant"`.
Ограничение: одна активная membership пользователя на marathon. Повторное
присоединение идемпотентно; чужой/отозванный код возвращает `404` без раскрытия
существования команды.

## Current marathon

### `GET /marathons/current`

Response `200`:

```json
{
  "marathon": {
    "id": "uuid",
    "name": "Герби-Марафон",
    "startsOn": "2026-09-28",
    "endsOn": "2026-10-11"
  },
  "team": { "id": "uuid", "name": "Команда Антонины" },
  "membership": { "id": "uuid", "role": "participant" },
  "displayDate": "2026-09-29",
  "reportDate": "2026-09-28"
}
```

`displayDate` — сегодняшняя дата пользователя. `reportDate` — вчерашняя дата
пользователя, для которой принимается Веллнес отчёт.

## Wellness report

### `PUT /marathon-wellness-reports/{reportDate}`

Принимает только `reportDate = userLocalToday - 1 day`.

```json
{
  "morningShake": true,
  "physicalActivity": true,
  "waterTarget": false,
  "secondShake": false,
  "healthyDinner": true,
  "goodSleep": false,
  "noJunkFood": true,
  "noSmoking": true
}
```

Response `200` содержит те же восемь boolean, `reportDate`, `updatedAt` и
`markedCount` как техническое количество `true` (`0..8`). `markedCount` не
называется общим score и не определяет командный podium до решения владельца.
Отсутствующая row остаётся `unknown`, а не отчётом с восемью `false`.

## Captain task

### `PUT /marathon-captain-tasks/{taskDate}`

Только membership `captain` текущей team. Один task на team/local date.

Request: `{ "title": "...", "description": "..." }`.

Response `200`: task ID, team ID, taskDate, title, description, updatedAt.

### `PUT /marathon-captain-tasks/{taskId}/completion`

Request: `{ "completed": true }`.

Response `200`: taskId, membershipId, completed, updatedAt. Один completion на
membership/task; повтор обновляет row без дубля.

## Team daily read model

### `GET /marathon-teams/current/today`

Response содержит только сегодняшний read model:

```json
{
  "displayDate": "2026-09-29",
  "reportDate": "2026-09-28",
  "team": { "id": "uuid", "name": "Команда Антонины" },
  "captainTask": null,
  "members": [
    {
      "membershipId": "uuid",
      "displayName": "Игорь",
      "role": "participant",
      "weight": { "status": "unknown", "dailyPercent": null },
      "wellness": { "status": "reported", "markedCount": 5 },
      "captainTask": { "status": "notAssigned" }
    }
  ],
  "podiums": {
    "weight": null,
    "wellness": null,
    "captainTask": null
  }
}
```

`unknown` никогда не заменяется нулём. `podiums.*` остаются `null`, пока не
приняты соответствующая формула и правила равенств. API не содержит cumulative
fields, raw weights, chat или memory.

## Existing weight boundary

Новых endpoints записи веса нет. Используются существующие:

- `POST /weight-entries` — daily upsert;
- `GET /weight-entries` — owner-scoped history.

Исправление текущей записи меняет дневной read model. После фиксации baseline
оно не изменяет `baselineWeightKg`; способ фиксации baseline пока `TBD`.

## Consent

### `PUT /users/me/ai-provider-consent`

Request: `{ "accepted": true, "documentVersion": "<server-current>" }`.
Backend принимает только актуальную configured version, сохраняет evidence и
возвращает `accepted`, `documentVersion`, `acceptedAt`. `accepted=false` и
отзыв согласия требуют отдельной retention/revocation модели и не входят в
первый pilot increment.

Без сохранённого актуального consent внешний provider не вызывается; fake
adapter может работать независимо.

## Error semantics

- `MARATHON_NOT_FOUND` — `404`;
- `MARATHON_MEMBERSHIP_REQUIRED` — `403`;
- `MARATHON_CAPTAIN_REQUIRED` — `403`;
- `MARATHON_REPORT_DATE_INVALID` — `409`;
- `MARATHON_NOT_ACTIVE` — `409`;
- `MARATHON_ALREADY_JOINED` — `409` для другой membership;
- `IDEMPOTENCY_KEY_REUSED` — `409`;
- стандартные `SESSION_INVALID`, `CSRF_VALIDATION_FAILED`, `VALIDATION_ERROR`.

