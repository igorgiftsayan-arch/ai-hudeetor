# UI-007: публичный вход и будущий HTTPS gateway

UI-007 использует только существующий browser-to-API REST contour. Регистрация, вход,
onboarding и выход работают через same-origin gateway: web вызывает относительный
`/api/v1`, а gateway направляет запросы в API. Браузер не хранит пароль, cookies,
CSRF-токен или session state в Web Storage.

## Обязательная конфигурация

Перед публичным включением registration web build должен получить следующие **публичные,
но точные** значения:

- `NEXT_PUBLIC_IDENTITY_TERMS_VERSION` = `IDENTITY_TERMS_VERSION`;
- `NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION` = `IDENTITY_PRIVACY_VERSION`.

Если browser versions отсутствуют, экран блокирует регистрацию. Если они не совпадают с
API, API вернёт `CONSENT_VERSION_OUTDATED`; это безопасное состояние, которое требует
согласованной перекатки web и API, а не fallback-значения в UI.

## Подготовка HTTPS без включения домена

Для будущего домена gateway должен быть единственным публичным сервисом и завершать
TLS. Его canonical origin одновременно задаётся `API_CORS_ORIGIN`. В production:

- `NEXT_PUBLIC_API_BASE_URL=/api/v1` сохраняет same-origin requests;
- `API_CORS_ORIGIN=https://<public-domain>` без wildcard;
- `IDENTITY_SECURE_COOKIES=true`;
- gateway не публикует API, worker, PostgreSQL или Redis ports;
- HTTPS certificate, DNS and redirect HTTP → HTTPS включаются отдельной операционной
  задачей после выбора домена.

Тестовые HTTP environments используют `IDENTITY_SECURE_COOKIES=false` только потому,
что Secure cookie не передаётся по HTTP. Это не production configuration.

## Блокер публичного включения

UI-007 технически готов к isolated synthetic acceptance, но **не разрешает** открыть
публичный production registration gateway сам по себе. Проектная политика данных
пока является implementation decision, а не юридически проверенной опубликованной
политикой: до публичного доступа должны быть утверждены и доступны пользователю
актуальные тексты условий и privacy policy, их версии должны попасть в server/web
configuration, а provider geography and downstream data handling — быть раскрыты
перед первым AI request. Этот блокер не снимается подстановкой test versions или
выдачей тестовых credentials.

Кроме legal gate, backend применяет fail-closed Redis rate limit к каждому
`POST /registrations`; trusted Origin/Referer также проверяется до выдачи session
cookie. Эти технические границы не заменяют утверждённую anti-abuse policy и
email ownership verification: direct API POST по-прежнему не должен становиться
публично доступным до отдельного release decision. UI-007 не имитирует эти
защиты и не публикует registration topology.
