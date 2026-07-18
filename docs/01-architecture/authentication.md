# Authentication и authorization

Основание: [ADR-006](architecture-decisions/ADR-006-authentication.md) и [security baseline](../05-security/security-baseline.md).

## Потоки

- Registration: подтверждение возраста/согласий, уникальная identity, безопасный пароль, создание server session.
- Login: нейтральные ошибки, rate limit, проверка password hash, новая session family.
- Refresh: rotation в HttpOnly/Secure/SameSite cookie; reuse отозванного token инвалидирует family.
- Logout: отзыв текущей session и очистка cookies; logout-all отзывает все sessions.
- Recovery: одинаковый внешний ответ для существующего/несуществующего аккаунта; одноразовый hashed token; канал доставки до реализации должен быть выбран отдельной задачей.

Пароль не логируется и хешируется memory-hard алгоритмом. Cookie mutations защищены CSRF token и Origin/Referer. CORS — allowlist с credentials, без wildcard.

## Authorization

Backend default-deny. Ownership включён в application/repository query, а не проверяется после загрузки чужого объекта. Роли user/admin дополняются permissions. Admin: MFA, короткая session, re-auth чувствительных команд и audit actor/action/target/reason/result/request ID.

Frontend route guards дают UX, но не полномочия. RLS может быть defense-in-depth после отдельного решения.
