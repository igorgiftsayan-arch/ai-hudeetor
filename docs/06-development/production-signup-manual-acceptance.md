# Manual acceptance — production-like registration

Этот сценарий выполняется только на изолированном pre-production домене с синтетическим пользователем. Он не разрешает открывать регистрацию публично.

1. В чистом browser profile открыть HTTPS registration route и создать аккаунт с актуальными terms/privacy consent.
2. Проверить host-only cookies: HttpOnly, Secure, SameSite=Lax, path `/api/v1`; секреты отсутствуют в Local/Session Storage.
3. Проверить `GET /users/me`, затем profile → persona → completion; после повторного входа API возвращает фактический `completed` status.
4. Убедиться, что completion replay не создаёт второй starter grant.
5. Открыть Daily Coach today state и выполнить разрешённые state transitions; чужой user ID/state недоступен.
6. Повторить регистрацию без Origin и с чужим Origin — оба запроса получают `403`. Подтвердить registration/login rate limits и отсутствие email/password в логах.
7. Проверить mobile viewport, refresh/session rotation, logout и истёкшую session.

Текущий UI не содержит реального registration route и его onboarding не вызывает backend profile/persona/completion API. Поэтому browser steps 1–5 остаются `BLOCKED` до отдельной frontend-задачи; backend API acceptance выполняется независимо.
