# Production candidate runtime verification

Дата: 2026-09-30. Ветка: `production/ai-hudeetor-candidate`. Проверенный
source commit: `71a01703151e69554d1ae0a466e34f44144a1128`.

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

- API image: `sha256:54b2d7ef4662bb225754a451b1ef232717d0d9f93e9dfd95371de14b2a1393f9`.
- Web image: `sha256:475abb5c2d5cbfe4a4092e027441eb51135fad9f534b8396f9aa232652faee0b`.
- Worker image: `sha256:b410c8c2923e788036bdb73516ebdb99f991d535de7b96205928bb3acff85c26`.
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
- Missing и untrusted `Origin` для registration вернули `403`.
- После очистки только disposable candidate Redis пять registration attempts
  были приняты, шестая вернула `429`.
- Worker работал с `AI_PROVIDER=fake`; E2E лишь открывал `/quick-reply` и не
  отправлял AI-action, поэтому не было provider call или token spend.

## Release boundary

Это production candidate, не public production approval. Тест использовал
синтетические документы и пользователей. Email ownership verification,
утверждённая anti-abuse policy, опубликованные legal texts и versions, DNS/TLS
для домена, RPO/RTO и off-host backup policy остаются отдельными release gates.
