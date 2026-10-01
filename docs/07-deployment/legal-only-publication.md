# Публикация только условий и privacy policy

Этот runbook публикует только `/terms` и `/privacy`. Он не открывает `/login`,
`/onboarding`, `/today`, `/quick-reply` или `/api/`.

## Зафиксированные версии

- Условия: `terms-2026-10-01-v2`.
- Политика конфиденциальности: `privacy-2026-10-01-v2`.

В production Compose web build получает их как
`NEXT_PUBLIC_IDENTITY_TERMS_VERSION` и
`NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION` из тех же `IDENTITY_*` переменных,
которые API сверяет при регистрации.

## Порядок публикации

1. Собрать legal build с указанными версиями, не меняя `main` и public
   application runtime.
2. Разместить
   `infrastructure/nginx.legal-only-host.conf.template` на отдельном legal
   domain, подставив `LEGAL_DOMAIN` и существующий loopback
   `PRODUCTION_GATEWAY_PORT`.
3. Выпустить TLS-сертификат для legal domain, проверить Nginx до reload.
4. Проверить снаружи: `/terms`, `/privacy` и `/_next/` отвечают; `/`,
   `/login`, `/onboarding`, `/today`, `/quick-reply` и `/api/v1/health/ready`
   возвращают `404`.

## Границы

- Не открывать регистрацию, API или другие пользовательские экраны.
- Публикация этих страниц сама по себе не включает внешний AI, платежи, фото,
  аналитику, export/delete или retention jobs.
- Публикация legal pages не является юридическим одобрением всего приложения
  или разрешением на public-production запуск.
