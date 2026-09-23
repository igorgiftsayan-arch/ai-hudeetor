# GERBI-MARATHON-PILOT — backend contract

**Статус:** минимальный контракт для параллельной реализации backend/frontend.

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
Captain tasks принимаются только когда marathon-local today лежит внутри
`startsOn..endsOn`. Отчёт принимается утром за вчера, если сам `reportDate`
лежит внутри диапазона; поэтому отчёт за `endsOn` допустим утром `endsOn + 1`.
Owner/team reads остаются доступны после периода.

### `POST /marathon-team-memberships`

Request: `{ "joinCode": "opaque-code" }`.

Response `201`: marathon/team/membership IDs и `role: "participant"`.
Ограничение: одна активная membership пользователя на marathon. Повторное
присоединение идемпотентно; чужой/отозванный код возвращает `404` без раскрытия
существования команды.

В pilot membership допускается только при совпадении `user_profiles.timezone`
с timezone марафона. Это минимальная защита от потери дневного веса на границе,
когда tracking upsert хранит одну запись на user-local date, а командный день
иначе мог бы пересечь две такие даты. Значение timezone реального марафона
остаётся входным параметром владельца, а не захардкоженным решением.

## Current marathon

### `GET /marathons/current`

Для пользователя без membership возвращает `404 MARATHON_NOT_FOUND`, что
является штатным сигналом показать join flow, а не ошибкой прав доступа.

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
null`; отсутствующий отчёт не материализуется как восемь `false`. Если
`reportDate` вне периода (в частности, «вчера» в первый день), read возвращает
`status: "notApplicable"` и `report: null`, а не ошибку экрана.

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
membership/task; повтор обновляет row без дубля. Новая команда разрешена только
для задания текущей marathon-local даты; известный ID вчерашнего задания
возвращает `409 MARATHON_TASK_DATE_INVALID`. Точный replay ранее успешной
idempotent-команды возвращает сохранённый response и после смены даты.

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
      "weight": { "status": "reported", "dailyPercent": 1.25 },
      "wellness": { "status": "reported", "markedCount": 5 },
      "captainTask": { "status": "unknown" }
    }
  ],
  "podiums": {
    "weight": [{ "place": 1, "value": 1.25, "members": [] }],
    "wellness": [{ "place": 1, "value": 5, "members": [] }],
    "captainTask": [{ "place": 1, "value": true, "members": [] }]
  }
}
```

`displayName` nullable: API не подставляет email. `captainTask.status` имеет
значения `notAssigned`, `unknown`, `completed`, `notCompleted`; отсутствие
completion row — `unknown`, а не `notCompleted`. `isCurrentUser` и
`currentMembership` позволяют восстановить owner/captain UI после reload.

`unknown` никогда не заменяется нулём. Дневной процент вычисляется только как
`(вес вчера − вес сегодня) / вес вчера × 100%` по точным актуальным записям
двух соседних локальных дат и округляется до двух знаков; произвольная более
старая запись не подставляется. Веллнес `value` равен числу выполненных отметок
`0..8`. В podium входят максимум три группы отличающихся значений: равные
участники находятся в одном `members` и делят место, следующие отличающиеся
значения получают следующее место. Для задания podium содержит только
самостоятельно отметивших `completed=true`. API не содержит cumulative fields,
raw weights, chat или memory.

## Existing weight boundary

Новых endpoints записи веса нет. Используются существующие:

- `POST /weight-entries` — daily upsert;
- `GET /weight-entries` — owner-scoped history.

Первая актуальная дневная запись пользователя внутри периода марафона один раз
фиксируется как `baselineWeightKg`/`baselineWeightEntryId`. Исправление текущей
записи меняет дневной read model, но после фиксации не изменяет baseline.

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
- `MARATHON_TASK_DATE_INVALID` — `409`;
- `MARATHON_ALREADY_JOINED` — `409` для другой membership;
- `IDEMPOTENCY_KEY_REUSED` — `409`;
- стандартные `SESSION_INVALID`, `CSRF_VALIDATION_FAILED`, `VALIDATION_ERROR`.
