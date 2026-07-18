# ADR-006: authentication и authorization

- Статус: принято
- Дата: 2026-07-18

## Решение

Browser authentication использует короткоживущий access context и ротируемую refresh-сессию в `HttpOnly`, `Secure`, `SameSite` cookies. Refresh secret хранится серверно только в хешированном виде. Повторное использование старого refresh token отзывает связанную session family.

Cookie-auth защищается CSRF token и проверкой Origin/Referer; изменяющие GET запрещены. Logout отзывает текущую сессию, logout-all — все. Пароли хешируются memory-hard алгоритмом. Recovery token одноразовый, короткоживущий и хешированный; канал доставки выбирается до реализации recovery.

## Authorization

NestJS применяет default-deny guards/policies. Каждый пользовательский запрос scoped владельцем; frontend guard не является контролем доступа. Роли минимум `user` и `admin`, административные операции используют granular permissions, MFA, короткую session и re-auth для чувствительных действий. Все admin commands аудируются.

## Уточнение BOOT-000

Реализация принадлежит project-owned модулю `identity` в NestJS. Используются opaque access/refresh secrets в cookies; PostgreSQL хранит только hashes, session family, rotation lineage, expiry и revoke state. Redis не используется как источник session state. Refresh rotation и reuse detection выполняются транзакционно.

Password hashing — Argon2id. Для cookie-auth используется session-bound signed double-submit CSRF token (`csrf-csrf` при Express adapter) совместно с Origin/Referer checks. Passport допустим только как transport helper и не владеет lifecycle сессии. Recovery token одноразовый, хешированный и короткоживущий; delivery provider остаётся отложенным.

Безопасные defaults V0.1: access context 15 минут, абсолютный refresh lifetime 30 дней, recovery token 30 минут. Cookie names/domains задаются конфигурацией и не являются публичным контрактом.

## Последствия

Rate-limit library, recovery delivery и admin MFA provider выбираются feature-задачами. External identity provider не выбран. RLS может быть дополнительной защитой, но не заменяет application ownership checks.
