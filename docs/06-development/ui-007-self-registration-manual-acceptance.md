# UI-007 — ручная приёмка самостоятельной регистрации

## Предусловия

- Запущен только изолированный test-server topology с same-origin gateway.
- `NEXT_PUBLIC_IDENTITY_TERMS_VERSION` и
  `NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION` совпадают с API `IDENTITY_*` values.
- Используется чистый browser profile и новый синтетический email; тестовые
  credentials не сохраняются в репозитории или этом документе.
- Fake AI adapter остаётся включённым; отправлять AI-сообщение для этой проверки
  не требуется.

## Основной путь

1. Открыть `/login`, выбрать `Создать аккаунт`.
2. Ввести новый email и пароль минимум из 12 символов с буквой и цифрой.
3. Проверить, что три согласия не отмечены заранее. Отметить подтверждение 18+,
   условия и обработку данных; создать аккаунт.
4. На `/onboarding` указать свой IANA timezone, явно принять wellness notice и
   сохранить профиль.
5. Выбрать одну из пяти уже существующих AI personas и завершить настройку.
6. Убедиться, что открывается `/today`; добавить или обновить вес, проверить
   history/chart и Daily Coach без отправки платного AI-запроса.
7. Открыть нижнюю вкладку `AI`, убедиться, что чат доступен, затем вернуться на
   `Сегодня`.
8. Нажать `Выйти`, затем войти с тем же email/password. `/login` обязан
   прочитать server-side onboarding state и направить completed user на
   `/today`.

## Негативные сценарии

1. Отправить форму без одного согласия: создание недоступно.
2. Во время registration отключить сеть после принятого POST и повторить
   отправку: используется тот же `Idempotency-Key`; второго пользователя не
   появляется.
3. Во время onboarding completion потерять ответ и повторить: используется тот
   же key, starter grant не дублируется.
4. Очистить либо просрочить cookie и открыть `/onboarding`, `/today` или AI:
   маршрут ведёт на `/login` без локального session fallback.
5. Открыть registration build без public document versions: форма явно сообщает,
   что регистрация недоступна, и не делает POST.

## Definition of Done applicability

- Код и component/browser E2E: применимо.
- Миграции: N/A — UI-007 использует существующие persisted identity, profile,
  persona, completion and wallet flows без изменения schema.
- API/OpenAPI: применимо — используются существующие generated DTO; контракт не
  изменён.
- Analytics: N/A — новых frontend-событий не добавлено.
- Ownership/PII: применимо — только server-side cookie session и owner-scoped
  routes; Web Storage не используется.
- Test server: применимо после отдельной isolated runtime verification.
