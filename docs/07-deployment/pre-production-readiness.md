# Pre-production readiness — registration and onboarding

This runbook prepares, but does not authorize, a production deployment. Domain,
DNS, certificates, secrets, legal document versions and the release window must
be approved separately.

Последний isolated backend result зафиксирован в [pre-production runtime verification](pre-production-runtime-verification.md).

## Exact backend journey

All browser mutations use the same HTTPS origin, credentials/cookies and the
returned CSRF token. `Origin` must exactly equal `API_CORS_ORIGIN`.

1. `POST /api/v1/registrations` with `Idempotency-Key`, email, password,
   `ageConfirmed=true`, current terms/privacy consents. Returns `201`, an opaque
   HttpOnly session and CSRF token.
2. `GET /api/v1/users/me` and `GET /api/v1/users/me/onboarding`.
3. `PATCH /api/v1/users/me/profile` with timezone and accepted current
   `aiWellnessNotice`; send `X-CSRF-Token`.
4. `PUT /api/v1/users/me/ai-preference`; send `X-CSRF-Token`.
5. `POST /api/v1/users/me/onboarding-completions` with a new
   `Idempotency-Key` and `X-CSRF-Token`. The empty command grants starter tokens
   once and returns `completed`.
6. `GET /api/v1/ai-daily-states/today`, then transition with
   `POST /api/v1/ai-daily-states/{id}/transitions` and an idempotency key.

Password: 12–128 characters, at least one Unicode letter and one digit. Email:
valid syntax, 3–254 characters, normalized to trimmed lowercase. Registration
requires exactly current `terms` and `privacy` versions. The profile timezone
must be a supported canonical IANA timezone.

## Security boundary

- Production refuses insecure cookies, non-HTTPS browser origins and a zero
  trusted-proxy hop count.
- Registration and login require trusted Origin/Referer even though they do not
  yet have a session-bound CSRF token.
- Redis limits failed login attempts and all registration attempts; host Nginx
  provides an independent edge limit. Redis failure is fail-closed.
- Session cookies are host-only, HttpOnly, Secure, SameSite=Lax and scoped to
  `/api/v1`. Refresh rotation/reuse detection and PostgreSQL session truth remain
  unchanged.
- Registration, completion and other critical commands retain PostgreSQL
  uniqueness/idempotency constraints. User-owned reads and writes remain scoped
  by the authenticated user.
- Request bodies, passwords, cookies, consent payloads and profile/daily context
  must not appear in normal logs.

Unrestricted public signup is **not approved** until email ownership verification
and the abuse policy (invite-only, CAPTCHA/WAF, or equivalent) are chosen. An
isolated pre-production signup may be exposed only behind explicit access
control to named testers. The current response still distinguishes an already
registered email; hiding that difference requires an email verification flow,
not a cosmetic error-code change.

## UI blocker

UI-006 has login and Daily Coach, but no registration screen. Its `/onboarding`
route is a technical local state demo and does not call the profile, persona or
completion endpoints. A browser E2E from signup to `/today` therefore requires a
separate frontend implementation against the contract above. Backend API E2E is
independently testable now.

## Configuration gate

1. Copy `infrastructure/production.env.example` to a root-owned file outside the
   checkout; permissions `600`.
2. Replace every `REQUIRED_*` placeholder. Never render or print secret values.
3. Ensure `APP_DOMAIN` and `API_CORS_ORIGIN` describe the same HTTPS origin.
4. Render `nginx.production-host.conf.template` only after DNS and certificate
   approval. Validate with `nginx -t`; do not reload during preparation.
5. Validate Compose without starting containers:

   ```sh
   docker compose --env-file /secure/path/production.env \
     -f compose.yaml -f infrastructure/compose.production.yaml config --quiet
   ```

Only the host reverse proxy exposes 80/443. The Compose gateway binds loopback;
API, web, worker, PostgreSQL and Redis have no public ports.

## Migration, backup and rollback

Before migration, record the release commit/image digests and create a custom
format PostgreSQL backup in a protected directory:

```sh
docker compose --env-file "$RUNTIME_ENV" $COMPOSE_FILES exec -T postgres \
  pg_dump --format=custom --no-owner --dbname="$POSTGRES_DB" > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
```

Verify restore in a separate disposable PostgreSQL instance/database, run
`pg_restore --list`, restore, then check expected migration metadata and core
table counts. A backup without this drill is not accepted.

Run migrations as a one-shot exact-image service, then run them again:

```sh
docker compose --env-file "$RUNTIME_ENV" $COMPOSE_FILES --profile tools run --rm migrate
docker compose --env-file "$RUNTIME_ENV" $COMPOSE_FILES --profile tools run --rm migrate
```

Confirm the expected Drizzle entry and tables directly in PostgreSQL. Do not
infer migration success from exit status alone.

Application rollback means restoring the previous immutable images while
keeping additive schema. If health, migration metadata, signup/session smoke or
privacy checks fail, stop rollout and keep public routing closed. Database
restore is a separately approved last resort because it can discard writes made
after the backup.

## Smoke checklist

- HTTPS redirect, valid certificate and HSTS.
- Gateway exposes only the approved domain; direct API/DB/Redis ports closed.
- API `/health` and `/health/ready`; worker readiness inside the network.
- PostgreSQL and Redis readiness, expected migration count, repeat migration.
- Browser registration with current consents; wrong Origin and missing Origin
  return `403`; registration burst returns `429`.
- Session cookies have HttpOnly, Secure, SameSite=Lax and `/api/v1` path.
- `users/me` → profile → persona → completion → wallet → `/today` Daily Coach.
- Same idempotency key replays; changed payload conflicts; starter grant remains
  single.
- Invalid login is neutral and rate-limited; refresh reuse revokes the family.
- Another user cannot read/change profile, weight, memory or daily state.
- Logs contain request IDs but no email, password, cookies, CSRF token, profile,
  weight, prompt, response or memory values.
- Backup artifact exists and isolated restore verification is recorded.
- Browser/mobile E2E remains blocked until the frontend signup/onboarding route
  is implemented and reviewed.
