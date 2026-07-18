# Каталог endpoints V1

ARCH-001 зафиксировал REST API `/api/v1`, но feature URL и payload создаются вместе с соответствующими задачами. Ниже — обязательные группы контрактов без реализации.

| Группа | Назначение |
|---|---|
| Auth/onboarding | регистрация, сессия, шаги и завершение онбординга |
| Profile/tracking | профили, вес, параметры тела, чек-ины, активность |
| AI | предпочтения, разговоры, сообщения, сценарии, feedback |
| Food/planning | загрузки, анализы, блюда, меню, списки покупок |
| Tokens/payments | баланс, история, резервирование через действия, пополнение/запрос |
| Referrals | ссылка, прогресс и статус награды |
| Content | мем дня и иной управляемый контент V1 |
| Admin | цены, разрешённые ручные действия, аудит |

Каждый endpoint перед реализацией обязан описать метод, путь, auth/role, request/response, ошибки, идемпотентность, права владения и события из [реестра](../04-analytics/event-registry.md).

Первый конкретизированный набор endpoints, DTO и ошибок зафиксирован в [контрактах VERT-001.1](../01-architecture/vertical-slices/VERT-001-contracts.md#7-api-contract).

VERT-001.2 реализует `POST /api/v1/registrations`, `POST /api/v1/sessions`, `POST /api/v1/sessions/refreshes`, `DELETE /api/v1/sessions/current` и `GET /api/v1/users/me`. Registration idempotency повторно использует account business result, но заменяет только session family соответствующей registration attempt вместо хранения обратимых session secrets. Login ограничен пятью ошибками на SHA-256 scope IP + normalized email за 15 минут через Redis; session truth остаётся в PostgreSQL.

VERT-001.3 реализует `GET /api/v1/users/me/onboarding`, `PATCH /api/v1/users/me/profile` и `PUT /api/v1/users/me/ai-preference`. Onboarding read model выдаёт короткоживущий CSRF token для следующих mutation requests; все mutation routes требуют существующую cookie session, CSRF и Origin/Referer validation. Profile сохраняет только IANA timezone и явное согласие `aiWellnessNotice`; preference принимает только пять утверждённых persona. Повтор `PUT` с тем же persona не добавляет второй outbox event. Завершение onboarding, токены, вес и AI-запросы отсутствуют.
