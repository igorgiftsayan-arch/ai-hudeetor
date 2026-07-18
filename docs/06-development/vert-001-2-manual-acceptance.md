# VERT-001.2 — ручная приёмка identity/session

Дата локальной проверки: 2026-07-18.

## Предусловия

- Node.js `24.18.0`, pnpm `11.14.0`;
- PostgreSQL с применённой migration `0001_identity_sessions.sql`;
- Redis для login rate limit;
- актуальные `CSRF_SECRET`, версии terms/privacy и cookie policy в environment.

## Сценарий

1. Зарегистрировать новый email с `Idempotency-Key`, подтверждением 18+ и актуальными terms/privacy; проверить `201`, opaque cookies и `onboardingStatus=registered`.
2. Повторить тот же request/key; проверить тот же `userId`, новые cookies и отзыв предыдущей registration session family.
3. Вызвать `GET /api/v1/users/me` с новой access cookie; проверить `200`. Старые/revoked cookies должны вернуть `401 SESSION_INVALID`.
4. Выполнить login, затем refresh с CSRF header и допустимым Origin; повторно использовать старую refresh cookie и проверить отзыв family с `401 SESSION_INVALID`.
5. Выполнить logout с CSRF; проверить `204`, очистку cookies и недоступность всех sessions этой family.
6. Проверить отказ для неверного password, устаревшего consent, изменённого payload с прежним idempotency key и cookie mutation без CSRF.
7. Выполнить пять неверных login attempts одного scope; пятый должен вернуть `429 RATE_LIMITED`.
8. Убедиться в PostgreSQL, что password/access/refresh хранятся только как hash, consents содержат version evidence, а sessions имеют expiry/rotation/revocation state.

## Результат

Локальная автоматизированная эквивалентная проверка выполнена unit/API/integration tests с реальной PostgreSQL; migration повторно применена безопасно. Test-server deployment не входил в VERT-001.2 и остаётся частью VERT-001.8.

## Definition of Done

- Код, migration, API/OpenAPI, ownership текущей identity, CSRF и tests: выполнено.
- Analytics: N/A — event registry не содержит identity registration/login events, новые события не добавлялись.
- Test server: N/A для этой задачи; полный вертикальный runtime acceptance запланирован в VERT-001.8.
