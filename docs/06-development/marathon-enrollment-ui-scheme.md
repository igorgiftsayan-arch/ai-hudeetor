# Герби-Марафон: UI набора и старта

Этот документ описывает только web presentation для подтверждённого backend
контракта `GET /api/v1/marathons/lobby`. Он не является заменой backend state
machine или API-контракта.

## Экран до старта

| Lobby status | Пользователь | Экран | Действие |
| --- | --- | --- | --- |
| `marathon: null` + `canOpenEnrollment: true` | allowlisted captain | Поле длительности 1–365 дней | «Открыть набор» |
| `marathon: null` + `canOpenEnrollment: false` | любой другой пользователь | Спокойное ожидание открытия набора | нет |
| `enrollmentOpen` без `currentMembership` | любой пользователь | Название, длительность, число участников | «Вступить в марафон», без кода |
| `enrollmentOpen` + `canManage: true` | captain | Те же сведения | «Завершить набор» |
| `enrollmentClosed` + `canManage: true` | captain | Ожидание первого дня | «Начать первый день» |
| `enrollmentClosed` без `canManage` | participant | Ожидание первого дня | нет |
| `completed` + `canOpenEnrollment: true` | allowlisted captain | Завершение прошлого марафона | «Открыть новый набор» |

В статусах до `inProgress` web **не загружает** старый active-day набор
`/marathons/current`, отчёт за вчера, задание капитана или пьедесталы и не
выдаёт их за действующий день. После успешного start web сначала повторно
загружает lobby; только при `inProgress` он загружает сохранённый существующий
daily screen. Номер и даты дней определяет backend от фактического `startedAt`.

## Точки подключения

После OpenAPI regeneration страница использует generated DTO/client для:

- `GET /marathons/lobby`;
- `POST /marathons/enrollment` с `durationDays`;
- `POST /marathons/:id/memberships` с пустым payload;
- `POST /marathons/:id/enrollment-close`;
- `POST /marathons/:id/start`.

Каждая mutation использует существующие CSRF, allowed Origin и стабильный
`Idempotency-Key` для безопасного retry одинакового payload. До regeneration
`MarathonLobby` остаётся чистым presentation-компонентом: он не содержит
fetch, локального mock API или бизнес-правил.
