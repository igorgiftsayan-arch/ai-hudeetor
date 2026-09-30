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
