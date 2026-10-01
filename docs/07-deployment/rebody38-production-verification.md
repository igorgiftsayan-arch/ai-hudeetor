# Rebody production verification

Дата: 2026-10-01. Public URL: `https://rebody38.ru`.

## Release and isolation

- Release branch: `release/rebody38-production-20261001`.
- Application and gateway source at deployment: `d4a331b75eea8bd7e7038e31990856211f7ef400`.
- Отдельный Compose project: `atlas-rebody38-production`.
- Отдельные named volumes: `atlas-rebody38-production_postgres-data` и
  `atlas-rebody38-production_redis-data`.
- Host публикует только Nginx на 80/443; Compose gateway опубликован только на
  `127.0.0.1:3340`. API, worker, PostgreSQL и Redis не имеют host ports.
- Backup host Nginx/listeners/containers/volumes создан до изменений в
  `/root/rebody38-release-backups/20261001T004259Z` на server.

## Public transport and documents

- DNS `rebody38.ru` и `www.rebody38.ru` указывает на `5.42.126.71`.
- Let’s Encrypt certificate покрывает оба имени и действителен до 2026-12-29.
- HTTP перенаправляет на `https://rebody38.ru`; `www` перенаправляет на apex.
- `/terms` показывает `terms-2026-09-30-v1`, `/privacy` —
  `privacy-2026-09-30-v1`; оба текста содержат утверждённые реквизиты и
  privacy-contact.
- Web build получает версии из тех же `IDENTITY_*` values, которые API
  server-side проверяет при регистрации.

## Runtime checks

- Migrations `0000–0011` выполнены дважды; в `drizzle.__drizzle_migrations`
  12 rows.
- Все шесть services healthy.
- Browser E2E на public HTTPS прошёл 6/6 на Chromium desktop и Pixel 7:
  registration → onboarding → weight → Daily Coach → logout/login, а также
  idempotent weight retry и quick-reply navigation.
- Missing/untrusted Origin при registration возвращают `403`.
- Secure session cookies выданы при successful registration.
- Deliberate synthetic signup burst вернул `429`; host Nginx явно возвращает
  этот status для registration/login rate limit.
- После recreate API gateway некоторое время держал устаревший Docker IP и
  возвращал `502`. Fix `d4a331b` добавляет dynamic Docker DNS resolution;
  gateway был recreated, `nginx -t` и API readiness снова прошли. Последующий
  E2E запуск был ограничен уже накопленным rate-limit состоянием и получил
  ожидаемый `429`, поэтому не выдаётся за отдельный новый success run.
- После gateway fix отдельный чистый Chromium profile прошёл защищённый путь
  существующего synthetic completed-пользователя: login → today → daily weight
  update → Daily Coach start → logout → login (`1/1`). Он не создавал новую
  регистрацию и не сбрасывал rate-limit state.

## AI boundary

`AI_PROVIDER=fake`, `AI_FAKE_MODE=success`. Реальный AI provider не включался,
paid GenAPI calls не выполнялись. Пользовательские terms явно сообщают, что
текущий AI-раздел показывает тестовые ответы.

## Unchanged systems

`main`, `atlas-production-candidate` и `atlas-production-readiness` не
изменялись; последние два Compose projects оставались healthy во время release.
