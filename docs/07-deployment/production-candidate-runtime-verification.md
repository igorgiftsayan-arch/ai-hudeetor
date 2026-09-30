# Production candidate runtime verification

Дата: 2026-09-30. Ветка: `production/ai-hudeetor-candidate`. Проверенный
application source commit: `299f871b5bee58d0e65a513eae0eef5185db8fda`.

## Изоляция

- Отдельный Compose project: `atlas-production-candidate`.
- Отдельные volumes: `atlas-production-candidate_postgres-data` и
  `atlas-production-candidate_redis-data`; API, worker, PostgreSQL и Redis не
  имеют host ports.
- Для browser verification gateway опубликован только на
  `127.0.0.1:3443`; self-signed TLS существовал только в закрытом test runtime.
  DNS, публичный domain, host Nginx и сертификаты не менялись.
- `atlas-production-readiness` оставался healthy во время проверки и не
  пересоздавался. Свободное место host после запуска: около 21 GiB из 48 GiB.

## Exact runtime

- API image: `sha256:7855f3f84668fbf1d0463e0ebfad8310f5098d63514cea7a23251f9ebb2a628d`.
- Web image: `sha256:17414b6bddaa84eb5f8707b831e496604b6e6ade6e5ba4523902ab3efacc6135`.
- Worker image: `sha256:6b10b364c5f649ac5d2e94d80f9e3810d64d385b9faa51f10a92774e22da46ce`.
- Migrations `0000–0011` выполнены дважды; в journal подтверждены 12 записей.
- Все шесть candidate services достигли `healthy`.
- Focused PostgreSQL integration на exact image: identity, daily weight и daily
  state — 17/17 passed.

## Browser and security verification

- Chromium desktop и Pixel 7 прошли 6/6 browser E2E на same-origin HTTPS через
  временный localhost-only forward. Сценарии включают registration, profile,
  persona, completion, weight daily upsert с потерянным ответом и idempotent
  retry, Daily Coach `notStarted → inProgress → completed`, logout и fresh
  login для completed user.
- Missing и untrusted `Origin` для registration вернули `403`. Финальный P1
  hardening дополнительно отвергает в production `API_CORS_ORIGIN` с path,
  query или trailing slash, чтобы trusted-origin comparison оставался
  каноническим.
- После очистки только disposable candidate Redis пять registration attempts
  были приняты, шестая вернула `429`.
- Worker работал с `AI_PROVIDER=fake`; E2E лишь открывал `/quick-reply` и не
  отправлял AI-action, поэтому не было provider call или token spend.

## Release boundary

Это production candidate, не public production approval. Тест использовал
синтетические документы и пользователей. Email ownership verification,
утверждённая anti-abuse policy, опубликованные legal texts и versions, DNS/TLS
для домена, RPO/RTO и off-host backup policy остаются отдельными release gates.
