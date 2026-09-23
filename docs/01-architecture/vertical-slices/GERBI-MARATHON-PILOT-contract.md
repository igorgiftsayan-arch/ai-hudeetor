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

Test/pilot bootstrap доступен только при одновременном выполнении двух условий:

- `MARATHON_BOOTSTRAP_ENABLED=true`;
- ID текущего пользователя присутствует в server-side
  `MARATHON_BOOTSTRAP_USER_IDS`.

Одного feature flag недостаточно. Endpoint создаёт marathon, первую team и
membership разрешённого пользователя с ролью `captain` одной транзакцией.

Request:

```json
{
  "name": "Герби-Марафон",
  "startsOn": "2026-09-28",
  "endsOn": "2026-10-11",
  "timezone": "Asia/Irkutsk",
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
    "endsOn": "2026-10-11",
    "timezone": "Asia/Irkutsk"
  },
  "team": { "id": "uuid", "name": "Команда Антонины" },
  "membership": { "id": "uuid", "role": "participant", "isCurrentUser": true },
  "displayDate": "2026-09-29",
  "reportDate": "2026-09-28"
}
```

`displayDate` и `reportDate` вычисляются в IANA timezone марафона. Это единая
календарная граница для всех участников одной команды. Tracking продолжает
хранить user-local `weight_entries.local_date`; marathon read model выбирает
последнее актуальное измерение, попавшее в календарный день марафона по
`recorded_at`, не меняя tracking contract.

## Wellness report

### `GET /marathon-wellness-reports/{reportDate}`

Owner-scoped read для восстановления формы после reload. При наличии отчёта
возвращает `status: "reported"`, `reportDate`, восемь boolean и `updatedAt`.
При отсутствии row возвращает `status: "unknown"`, `reportDate` и `report:
null`; отсутствующий отчёт не материализуется как восемь `false`.

### `PUT /marathon-wellness-reports/{reportDate}`

Принимает только `reportDate = marathonLocalToday - 1 day`.

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

Response `200` содержит `status: "reported"`, те же восемь boolean, `reportDate`, `updatedAt` и
`markedCount` как техническое количество `true` (`0..8`). `markedCount` не
называется общим score и не определяет командный podium до решения владельца.
Отсутствующая row остаётся `unknown`, а не отчётом с восемью `false`.

## Captain task

### `PUT /marathon-captain-tasks/{taskDate}`

Только membership `captain` текущей team. Один task на team/local date.

Request: `{ "title": "...", "description": "..." }`.

Response `200`: task ID, team ID, taskDate, title, description, updatedAt.
`taskDate` определяется в timezone марафона. Captain может читать созданное
задание через team daily read model и безопасно повторять тот же PUT.

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
  "currentMembership": { "id": "uuid", "role": "participant" },
  "captainTask": {
    "id": "uuid",
    "taskDate": "2026-09-29",
    "title": "...",
    "description": "...",
    "currentUserCompletion": { "status": "unknown", "updatedAt": null }
  },
  "members": [
    {
      "membershipId": "uuid",
      "displayName": "Игорь",
      "isCurrentUser": true,
      "role": "participant",
      "weight": { "status": "unknown", "dailyPercent": null },
      "wellness": { "status": "reported", "markedCount": 5 },
      "captainTask": { "status": "unknown" }
    }
  ],
  "podiums": {
    "weight": null,
    "wellness": null,
    "captainTask": null
  }
}
```

`displayName` nullable: API не подставляет email. `captainTask.status` имеет
значения `notAssigned`, `unknown`, `completed`, `notCompleted`; отсутствие
completion row — `unknown`, а не `notCompleted`. `isCurrentUser` и
`currentMembership` позволяют восстановить owner/captain UI после reload.

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

### `GET /users/me/ai-provider-consent`

Response:

```json
{
  "providerMode": "fake",
  "externalProviderEnabled": false,
  "documentVersion": "v1",
  "disclosure": "...",
  "accepted": false,
  "acceptedAt": null
}
```

`providerMode`, current version и disclosure приходят только с backend.

### `PUT /users/me/ai-provider-consent`

Request: `{ "accepted": true, "documentVersion": "<server-current>" }`.
Backend принимает только актуальную configured version, сохраняет evidence и
возвращает `accepted`, `documentVersion`, `acceptedAt`. `accepted=false` и
отзыв согласия требуют отдельной retention/revocation модели и не входят в
первый pilot increment.

Без сохранённого consent именно актуальной configured version внешний provider
не вызывается. Проверка выполняется до dispatch и повторяется в worker boundary;
stale version не считается согласием. Fake adapter может работать независимо.

## Error semantics

- `MARATHON_NOT_FOUND` — `404`;
- `MARATHON_BOOTSTRAP_FORBIDDEN` — `403`;
- `MARATHON_MEMBERSHIP_REQUIRED` — `403`;
- `MARATHON_CAPTAIN_REQUIRED` — `403`;
- `MARATHON_REPORT_DATE_INVALID` — `409`;
- `MARATHON_NOT_ACTIVE` — `409`;
- `MARATHON_ALREADY_JOINED` — `409` для другой membership;
- `IDEMPOTENCY_KEY_REUSED` — `409`;
- стандартные `SESSION_INVALID`, `CSRF_VALIDATION_FAILED`, `VALIDATION_ERROR`.
