# ADR-006: authentication и authorization

- Статус: принято
- Дата: 2026-07-18

## Решение

Browser authentication использует короткоживущий access context и ротируемую refresh-сессию в `HttpOnly`, `Secure`, `SameSite` cookies. Refresh secret хранится серверно только в хешированном виде. Повторное использование старого refresh token отзывает связанную session family.

Cookie-auth защищается CSRF token и проверкой Origin/Referer; изменяющие GET запрещены. Logout отзывает текущую сессию, logout-all — все. Пароли хешируются memory-hard алгоритмом. Recovery token одноразовый, короткоживущий и хешированный; канал доставки выбирается до реализации recovery.

## Authorization

NestJS применяет default-deny guards/policies. Каждый пользовательский запрос scoped владельцем; frontend guard не является контролем доступа. Роли минимум `user` и `admin`, административные операции используют granular permissions, MFA, короткую session и re-auth для чувствительных действий. Все admin commands аудируются.

## Последствия

Конкретные auth/CSRF/hash/rate-limit библиотеки, cookie names и TTL выбирает BOOT-001. External identity provider не выбран. RLS может быть дополнительной защитой, но не заменяет application ownership checks.
