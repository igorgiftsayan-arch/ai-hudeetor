# GERBI-MARATHON-PILOT — runtime evidence

**Контур:** isolated Compose project `atlas-gerbi-marathon`.

**Public URL:** `http://5.42.126.71:3112/login`.

**Граница:** только synthetic accounts и данные test topology. Credentials,
prompts, AI responses, cookies, CSRF values и provider secrets не записываются
в репозиторий.

## Runtime checkpoint 2026-09-24

- API, web, worker, PostgreSQL, Redis и gateway находятся в `healthy` state;
  наружу опубликован только gateway port `3112`.
- `GET /login` и `GET /api/v1/health/ready` через public gateway вернули
  `200`.
- API и worker используют `AI_PROVIDER=genapi` и одну актуальную consent
  version `test-v1`.
- Deployed local image digests:
  - API: `sha256:cc25c4d423be591ec578066a41c8cd048b85a49b92217c9a0721bc1bf1fef1f4`.
  - Web: `sha256:8c342e02812702a49f7e86fe57c400c450c0e81bb334ef04b9111a1ee98ba9c8`.

## Daily metrics

Для synthetic team setup read model вернул:

- weight: `1%`, `1%`, `0%`, `unknown`; shared first place contains two
  members;
- wellness: `5`, `5`, `8`, `0`; podium groups are `8`, then shared `5`, then
  `0`;
- captain task: one shared completed group with two members.

Daily weight API update changed the current synthetic captain value to `98.50`
with `result: updated`. The following read model showed `1.5%`; PostgreSQL
still had exactly one current row for today and immutable marathon baseline
`100.00`.

## Browser and provider checks

- Clean browser login reached `/today`; `/marathon` rendered current daily
  podiums and the mobile `390px` viewport had `scrollWidth=390` with no
  horizontal overflow.
- Before external-provider consent, the chat composer and send button were
  disabled. After current-version consent was accepted, two sequential
  synthetic browser messages completed without an inline error. Server-side
  evidence recorded `runtimeAdapter=genapi`, two reservations and two
  confirmations, with no refund. Message contents and credentials are not
  recorded here.
- On the clean `390px` browser profile, the pre-consent disclosure is exactly:
  `Сообщения и необходимый контекст будут переданы внешнему сервису GenAPI для
  формирования ответа.` The former test-mode claim is absent; this UI change
  does not alter the server-provided `test-v1` consent version or evidence.
- Existing `outcomeUnknown` UI coverage keeps the composer blocked and polling
  active, does not promise a refund and does not render an automatic retry.
- A loaded synthetic task was made stale only in the isolated test database.
  Its completion returned `409 MARATHON_TASK_DATE_INVALID`; the UI reloaded,
  removed the outdated card and showed a calm date-change message. The
  synthetic task date was restored after the check.

## Non-goals and isolation

No changes were made to `main`, `atlas-v01`, `atlas-ui-001`, their containers,
volumes, runtime environment or ports. This is a test evidence checkpoint, not
approval to deploy the provider or marathon pilot to stable.
