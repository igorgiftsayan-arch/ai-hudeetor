# VERT-001.3 — ручная приёмка

## Предусловия

- Выполнены SQL migrations до `0002_profiles_onboarding_outbox`.
- Пользователь зарегистрирован и имеет действующие `atlas_access`, `atlas_refresh` и CSRF token.

## Сценарий

1. Открыть `/onboarding`; технический экран показывает timezone и явное согласие с non-medical notice.
2. Отправить `PATCH /api/v1/users/me/profile` с canonical IANA timezone и текущей версией `aiWellnessNotice`, передав CSRF header и Origin.
3. Убедиться, что ответ содержит `profileReady`; `GET /api/v1/users/me/onboarding` возвращает шаги `legal`, `timezone` и CSRF token для следующего mutation request.
4. Отправить `PUT /api/v1/users/me/ai-preference` с одной из пяти persona.
5. Убедиться, что ответ и onboarding read model содержат `personaReady`, а `canComplete=false`.
6. Проверить в PostgreSQL одну запись `outbox_messages` с `event_type=profiles.ai_persona_selected.v1`, `personaId` и `context=onboarding`, без email/timezone/consent data.
7. Повторить тот же `PUT`; число outbox records не увеличивается.

## Негативные проверки

- Запрос выбора persona до profile setup возвращает `409 ONBOARDING_INCOMPLETE`.
- Mutation без CSRF возвращает `403 CSRF_VALIDATION_FAILED`.
- Неканонический timezone или неизвестная persona возвращает `422 VALIDATION_ERROR`.
- В системе не появляются wallet, token transaction, weight entry, AI request, queue job или published outbox record.
