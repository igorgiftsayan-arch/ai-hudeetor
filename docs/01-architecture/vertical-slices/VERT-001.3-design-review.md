# VERT-001.3 — design review: onboarding и состояние пользователя

**Статус:** технический дизайн перед реализацией.  
**Дата:** 2026-07-19.  
**Границы:** onboarding profile state и выбор персоны; подготовка контракта первого веса. Без AI Gateway, сообщений, токенов, стартового начисления, фотографий и графиков.

Основания: [PRD V1](../../00-product/prd-v1.md), [границы V1](../../00-product/scope-v1.md), [VERT-001 design](VERT-001-design.md), [VERT-001 contracts](VERT-001-contracts.md), [API architecture](../api-architecture.md), [database architecture](../database-architecture.md) и [privacy policy](../../05-security/privacy-and-data-policy.md).

## 1. Вердикт review

Реализация profile/persona возможна без изменения PRD или архитектурных ADR. Для VERT-001.3 принимается следующая техническая граница:

- пользователь может пройти profile и persona этапы до состояния `personaReady`;
- VERT-001.3 **не** переводит пользователя в `completed` и не выдаёт стартовые 100 токенов;
- полный переход `personaReady → completed` остаётся частью VERT-001.4, потому что контракт требует атомарность completion, starter grant и backend event;
- VERT-001.4 включает завершение onboarding, стартовое начисление 100 токенов, первый ввод веса и инициализацию tracking. Первый вес не является зависимостью profile/persona state и не реализуется в VERT-001.3.

Такое разделение не меняет пользовательскую цель V1: оно исключает временное состояние «onboarding completed без стартовых токенов».

## 2. Границы модулей и источник истины

| Область | Владеет | Ответственность | Не владеет |
|---|---|---|---|
| Identity | `identity` | `users`, credentials, sessions, registration consent evidence, инициализация `registered`, чтение auth context | timezone, persona, tracking records, критерии profile/persona readiness |
| Profile state | `profiles` | `user_profiles`, проверка timezone, onboarding criteria, read model onboarding | password/session, token grant, AI execution |
| Persona preference | `profiles` | `ai_preferences`, allowlist пяти persona, strictness/response length | prompt, memory, conversation, provider |
| Tracking | `tracking` | будущие `weight_entries`, owner-scoped history, определение первой записи | profile state, persona, analytics transport |
| Analytics delivery | `analytics` | публикация записей outbox и дедупликация | выбор persona и изменение onboarding state |

### 2.1 Onboarding state

Уже созданная migration VERT-001.2 хранит `users.onboarding_status`. Это остаётся единственным persisted state machine: дублировать status в `user_profiles` запрещено.

`profiles` владеет правилами переходов, а `identity` предоставляет узкий application port для допустимого изменения поля. `profiles` не импортирует identity repository, Drizzle schema или таблицу `users`. Согласованный порт принимает только `userId` и target status; identity проверяет монотонный переход.

```text
registered ── profile prerequisites ──> profileReady
profileReady ── persona saved ────────> personaReady
personaReady ── VERT-001.4 atomic completion + grant ──> completed
```

Нельзя пропустить этап, вернуть status назад обычным user endpoint или установить `completed` в VERT-001.3. `GET /users/me/onboarding` дополнительно сверяет фактическое наличие profile/preference/consent; несовместимость не раскрывается клиенту как новый API-code, а попадает в reconciliation/операционный сигнал. Клиент получает authoritative безопасный read model и продолжает с первой фактически незавершённой ступени.

## 3. Domain model changes

### 3.1 `UserProfile`

Добавляется минимальный `UserProfile` с одной V0.1-целью: сохранить timezone для календарного контекста и перехода `profileReady`.

- один profile на `User`;
- timezone — canonical IANA ID, например `Asia/Irkutsk`;
- рост, пол, дата рождения, медицинские сведения, фото и nutrition preferences не входят в этот срез;
- `aiWellnessNotice` хранится как immutable `user_consents` evidence, а не boolean в profile.

### 3.2 `AiPreference`

Добавляется одна preference на user:

- `personaId`: только `gentleFriend`, `strictCoach`, `russianLuli`, `glamorousFriend`, `analyst`;
- `strictness`: `low | medium | high`;
- `responseLength`: `short | medium | long`.

Это configuration data, а не реализация AI: VERT-001.3 не создаёт provider adapter, prompt, conversation, message, AI request или расход токенов.

### 3.3 `WeightEntry` — только подготовленный контракт

Будущий `WeightEntry` принадлежит user и имеет `weightKg numeric(4,1)`, `recordedAt`, `source=manual`, timestamps и immutable ID. Правила диапазона `20.0–500.0`, точности в один знак, future limit 5 минут и owner-scoped access остаются из [контракта](VERT-001-contracts.md#31-weightentry). Запись веса не является полем profile и не влияет на onboarding status.

## 4. Database design proposal

Все изменения реализуются только новой SQL migration в будущей задаче. Runtime schema change запрещён.

### 4.1 Таблицы VERT-001.3 profile/persona

| Таблица | Поля | Ограничения и индексы |
|---|---|---|
| `user_profiles` | `user_id uuid PK/FK users`, `timezone text`, `created_at`, `updated_at` | ровно один profile на user; `timezone` non-empty, длина до 64; IANA validation в application; `ON DELETE CASCADE` для account deletion workflow |
| `ai_preferences` | `user_id uuid PK/FK users`, `persona_id text`, `strictness text`, `response_length text`, `created_at`, `updated_at` | ровно одна preference; checks закрытых enum; `ON DELETE CASCADE` |

`users.onboarding_status` остаётся существующим source of truth. Удалять, копировать или переименовывать поле в этой задаче нельзя.

### 4.2 Consent evidence

Используется существующая `user_consents`. Для `aiWellnessNotice` application проверяет текущую управляемую version. На этапе profile setup одновременно принимаются только:

```text
consentType = aiWellnessNotice
accepted = true
documentVersion = configured current version
```

`terms` и `privacy` не принимаются повторно этим endpoint; они уже фиксируются registration flow. `aiProviderProcessing` запрещён до отдельного выбора provider.

### 4.3 Подготовка таблицы веса — не миграция этого этапа

| Таблица | Поля | Ограничения и индексы |
|---|---|---|
| `weight_entries` | `id uuid PK`, `user_id uuid FK`, `weight_kg numeric(4,1)`, `recorded_at timestamptz`, `source text`, `created_at` | check диапазона и scale; check `source='manual'`; `idx_weight_entries_user_id_recorded_at`; unique idempotency record scoped user/operation, не unique weight value |

Exact `numeric` исключает float. Ordering history: `recorded_at DESC, id DESC`. Внешний ID другой user возвращает `404 RESOURCE_NOT_FOUND`; repository queries всегда начинают с `user_id`.

### 4.4 Onboarding write transaction

`SaveProfileSetup` — явная transaction boundary. В одной PostgreSQL transaction выполняются:

1. upsert `user_profiles` для authenticated user;
2. insert current `aiWellnessNotice` evidence, если его ещё нет;
3. identity application port переводит `registered → profileReady` после проверки prerequisites.

`SavePersonaPreference` — отдельная transaction boundary: upsert `ai_preferences`, identity port переводит `profileReady → personaReady`, а при фактическом изменении записывается domain event `profiles.ai_persona_selected.v1` в transactional outbox. Этот internal event является durable-источником для зарегистрированного product event `ai_persona_selected`. Повтор с одинаковым resource не создаёт второй event.

VERT-001.3 включает минимальную platform-table `outbox_messages`. В той же PostgreSQL transaction, что preference и status transition, сохраняется только запись события: `id`, `event_type`, `aggregate_type`, `aggregate_id`, минимальный `payload jsonb`, `occurred_at`, `available_at`, `published_at`, `attempts` и `created_at`. Для дальнейшей выборки ожидающих записей создаётся индекс `idx_outbox_messages_pending` по состоянию публикации и времени доступности. Payload ограничен `userId`, `personaId`, `context=onboarding` и версией события; в нём запрещены email, timezone, consent evidence, cookies и другие PII.

В VERT-001.3 нет consumer, worker logic, публикации в Redis/BullMQ, AI Gateway, token effect или retry/reconciliation processing. Redis/BullMQ не являются доказательством committed события; они подключаются позднее к уже сохранённым outbox records.

## 5. API design

Все routes находятся под `/api/v1`, используют существующую cookie session, CSRF и Origin/Referer protection для mutation. JSON — camelCase, timestamps — ISO 8601 UTC.

### 5.1 Endpoints в реализации profile/persona

| Method/path | Auth | Request | Success | Ошибки |
|---|---|---|---|---|
| `GET /users/me/onboarding` | user | — | `200 OnboardingResource` | `401 SESSION_INVALID` |
| `PATCH /users/me/profile` | user + CSRF | `UpdateProfileRequest` | `200 UserProfileResource` | `401`, `403 CSRF_VALIDATION_FAILED`, `409 CONSENT_VERSION_OUTDATED`, `422 VALIDATION_ERROR` |
| `PUT /users/me/ai-preference` | user + CSRF | `AiPreferenceRequest` | `200 AiPreferenceResource` | `401`, `403`, `409 ONBOARDING_INCOMPLETE`, `422 INVALID_PERSONA`/`VALIDATION_ERROR` |

`POST /users/me/onboarding-completions` не реализуется в VERT-001.3: он блокируется атомарным starter grant VERT-001.4. `POST /weight-entries` и `GET /weight-entries` остаются спроектированными, но не входят в profile/persona implementation без отдельного решения о порядке.

### 5.2 DTO и validation

```text
UpdateProfileRequest
  timezone: IanaTimezone                  // required, canonical IANA, max 64 chars
  consents?: ConsentAcceptance[]          // only aiWellnessNotice; explicit accepted=true

AiPreferenceRequest
  personaId: PersonaId                    // required, five approved values
  strictness?: low | medium | high
  responseLength?: short | medium | long
```

- timezone проверяется server-side against IANA zone database; UTC offset и alias не принимаются;
- `PATCH profile` сохраняет timezone без `aiWellnessNotice`, но status остаётся `registered`; для `profileReady` требуется current notice;
- на первом `PUT preference` optional values default to `medium`; при последующем `PUT` отсутствующие optional values сохраняют текущее значение;
- `PUT preference` допускается только из `profileReady` или `personaReady`; фактическое изменение после `personaReady` допустимо;
- unknown fields, пустые строки, invalid enum и устаревшие consent versions отклоняются;
- Idempotency-Key не требуется: это natural resource update. Retry с тем же final payload не создаёт новую preference или event.

`OnboardingResource` возвращает `status`, `completedSteps`, `requiredSteps`, `canComplete=false` до VERT-001.4, current `aiWellnessNotice` version и безопасную preference summary. Не возвращаются consent history, session IDs, email или token amount как доступный баланс.

## 6. User flow

1. После registration или login `GET /users/me` показывает `registered`; UI открывает onboarding.
2. Frontend отправляет `onboarding_started` с `entryPoint=registration|login|resumeOnboarding` ровно при первом показе в session.
3. User читает wellness notice, явно принимает его и сохраняет timezone. Backend сохраняет profile/consent и при соблюдении prerequisites возвращает `profileReady`; frontend отправляет `onboarding_step_completed` для `legal` и `timezone` только после successful response.
4. User выбирает persona. Backend сохраняет preference, возвращает `personaReady` и, только при фактическом изменении, атомарно создаёт outbox domain event `profiles.ai_persona_selected.v1` для последующей публикации `ai_persona_selected`. Frontend отправляет `onboarding_step_completed` для `persona`.
5. UI показывает, что базовая настройка завершена, но не делает claim о token grant и не открывает AI action. Следующая серверная команда — VERT-001.4 completion + starter grant.
6. При новом login незавершённый user получает authoritative state из `GET /users/me/onboarding` и продолжает с первой незавершённой ступени. Frontend не выводит state из local storage.

## 7. Analytics

Используются только события из [event registry](../../04-analytics/event-registry.md); новых имён нет.

| Событие | Source | Момент | Properties |
|---|---|---|---|
| `onboarding_started` | frontend | первый показ flow в session | `entry_point` |
| `onboarding_step_completed` | frontend | после server success | `step_id`, `step_index` |
| `ai_persona_selected` | backend | preference реально изменилась и committed; VERT-001.3 сохраняет его как `profiles.ai_persona_selected.v1` в outbox | `persona_id`, `context=onboarding` |

В VERT-001.3 product event ещё не доставляется consumer-ом: сохраняется только его durable domain-event source. Не отправляются `onboarding_completed`, `starter_tokens_added`, `first_weight_added` и `weight_added`: их business triggers перенесены в VERT-001.4. Event payload не содержит timezone, email, consent version, точный вес, cookie или session secret.

## 8. Test strategy и ручная приёмка

### Unit

- calculate next onboarding state для всех допустимых и недопустимых переходов;
- IANA timezone validation и rejection offset/alias;
- allowlist persona/strictness/response length;
- default/preserve semantics optional preference settings;
- current-version consent rule;
- event создаётся только при effective persona change.

### Integration (PostgreSQL)

- PK/FK/enum checks и one-profile/one-preference invariant;
- profile + consent + status transition атомарны;
- preference + `personaReady` + outbox event атомарны;
- repeated natural update не дублирует event;
- direct/invalid transition и inconsistent record detection;
- owner-scoped lookup не раскрывает ресурс другого user.

### API / E2E

- authenticated `registered → profileReady → personaReady`;
- missing CSRF, expired session, unknown persona, invalid timezone, stale consent version;
- login/resume returns same authoritative progress;
- frontend sends только three разрешённых onboarding events с закрытыми properties;
- service worker не кеширует onboarding/API responses или personal state.

Ручная приёмка: зарегистрировать user, сохранить timezone + notice, выбрать persona, обновить persona, перелогиниться и убедиться, что server state восстановлен. Проверить отсутствие AI request, wallet/ledger effect, weight entry и токенного event.

## 9. Implementation breakdown

| Подзадача | Цель | Изменения | Done |
|---|---|---|---|
| VERT-001.3.1 | profile state foundation | `profiles` module, `user_profiles`, IANA validator, profile/consent use case, state port | `registered → profileReady` проходит атомарно и owner-scoped |
| VERT-001.3.2 | persona preference | `ai_preferences`, persona use case, REST DTO/OpenAPI | только пять persona; natural retry не создаёт дубль |
| VERT-001.3.3 | onboarding read model и outbox storage | onboarding resource, `outbox_messages`, запись `profiles.ai_persona_selected.v1`, tests | resume flow authoritatively восстановим; event durable; consumers и worker отсутствуют |
| VERT-001.4 | completion, starter grant и первый вес | token economy + wallet/ledger + completion command + `tracking`/`weight_entries` initialization | `personaReady → completed`, `+100` и первый вес реализованы в согласованном порядке |

## 10. Открытые решения перед реализацией

1. **IANA source:** зафиксировать library/runtime source для timezone validation в implementation task; fallback на free-form string запрещён.
2. **UI/UX:** UX specification отсутствует. Архитектуру это не блокирует, но до frontend работы нужны тексты wellness notice, порядок экранов и доступные состояния ошибки/retry.

## 11. Принятые решения 2026-07-19

- VERT-001.3 заканчивается в `personaReady`; переход в `completed` в этой задаче запрещён.
- VERT-001.4 включает completion onboarding, одноразовое стартовое начисление 100 токенов, первый ввод веса и инициализацию tracking.
- Минимальный transactional outbox реализуется в VERT-001.3 только как PostgreSQL storage и атомарная запись `profiles.ai_persona_selected.v1`; consumer-ы, worker logic, AI Gateway и токенная логика не входят в его scope.
