# VERT-001.1 — технические контракты первого среза

## Статус и нормативность

- Статус: final для начала VERT-001.2.
- Область: onboarding, tracking, analytics, token economy, AI и REST API первого вертикального среза.
- Архитектурные решения не изменяются; AI-провайдер не выбирается.
- Имена JSON — camelCase, PostgreSQL — snake_case, время — ISO 8601 UTC, календарный контекст — IANA timezone пользователя.

Документ конкретизирует [VERT-001 design](VERT-001-design.md). При расхождении с PRD, ADR, privacy, AI safety или token economics реализация останавливается; этот документ не расширяет V1.

## 1. Общие типы и правила

### 1.1 Идентификаторы и время

- Все публичные ID — opaque UUID; клиент не извлекает из них тип, владельца или права.
- `createdAt`, `updatedAt`, `recordedAt`, `occurredAt` и `completedAt` возвращаются как ISO 8601 UTC.
- Клиентская дата не может быть более чем на 5 минут в будущем относительно backend clock.
- `timezone` — canonical IANA identifier, например `Asia/Irkutsk`; UTC offset без zone ID не принимается.
- Пустая строка не эквивалентна `null`. Необязательное поле либо отсутствует, либо содержит валидное значение.

### 1.2 Текст

- Строки принимаются в UTF-8, внешние пробелы удаляются, внутренние пробелы не переписываются.
- Control characters, кроме переносов строки в разрешённых multiline-полях, запрещены.
- HTML не является допустимым rich-text contract; содержимое отображается как escaped plain text.
- Лимиты считаются по Unicode code points после нормализации NFC.

### 1.3 Идемпотентность

- Header `Idempotency-Key` обязателен там, где это указано ниже.
- Значение: 16–128 printable ASCII characters; рекомендуемый формат — UUID v4/v7.
- Scope: authenticated user или anonymous registration attempt + endpoint operation type.
- Backend хранит key, canonical request hash, lifecycle и сохранённый HTTP result.
- Повтор того же key с тем же canonical payload возвращает тот же business resource и не повторяет business effect. Для registration создаётся новая session family, а вся предыдущая family этого registration attempt отзывается; другие login session families пользователя не затрагиваются. Session secrets никогда не сохраняются обратимо ради HTTP replay.
- Тот же key с другим payload возвращает `409 IDEMPOTENCY_KEY_REUSED`.
- Business-effect unique constraints сохраняются дольше HTTP idempotency record и являются последней защитой от дублей.

## 2. Onboarding contract

### 2.1 Минимальные данные

V0.1 не собирает display name, пол, дату рождения, рост, цель по весу, медицинские данные, пищевые предпочтения или фото профиля. Возраст подтверждается boolean без хранения даты рождения.

| Поле | Тип | Обязательность | Правила |
|---|---|---|---|
| `email` | string | registration: да | trim, lowercase normalization для unique lookup, валидный email, максимум 254 символа; original email отдельно не нужен в V0.1 |
| `password` | string | registration: да | 12–128 символов; минимум одна буква и одна цифра; denylist известных/скомпрометированных паролей допускается без изменения DTO; не trim и не логировать |
| `ageConfirmed` | boolean | registration: да | принимается только literal `true`; означает подтверждение возраста 18+ |
| `consents` | array | registration/onboarding: да | отдельное явное `accepted: true` для каждой обязательной версии; prechecked UI запрещён |
| `timezone` | string | до completion: да | canonical IANA timezone |
| `personaId` | enum | до completion: да | одно из пяти значений persona contract |
| `strictness` | enum | нет | default `medium`; настройка не ослабляет safety |
| `responseLength` | enum | нет | default `medium`; меняет объём, не смысл/safety |

### 2.2 Consent contract

```json
{
  "consentType": "privacy",
  "documentVersion": "opaque-published-version",
  "accepted": true
}
```

| `consentType` | Когда обязателен | Правило |
|---|---|---|
| `terms` | registration | опубликованная текущая версия |
| `privacy` | registration | опубликованная текущая версия |
| `aiWellnessNotice` | до onboarding completion | non-medical notice и предупреждение, что AI может ошибаться |
| `aiProviderProcessing` | до первого реального AI request | версия раскрывает выбранного provider, географию и запрет обучения; недоступна до отдельного выбора provider |

`marketing` не является обязательным consent и не входит в VERT-001. Consent evidence дополнительно сохраняет server `acceptedAt`, source `web`, user/session и версию. Клиент не присылает доверенное время принятия.

### 2.3 Enums

```text
OnboardingStatus = registered | profileReady | personaReady | completed
OnboardingStepId = legal | timezone | persona
PersonaId = gentleFriend | strictCoach | russianLuli | glamorousFriend | analyst
Strictness = low | medium | high
ResponseLength = short | medium | long
ConsentType = terms | privacy | aiWellnessNotice | aiProviderProcessing
ConsentSource = web
```

Persona IDs стабильны в API и данных; отображаемые русские названия берутся из UI/content mapping. `russianLuli` означает утверждённую персону «Русские люли» и не разрешает мат, стыд или унижение.

### 2.4 Переходы

1. `registered`: identity, обязательные registration consents и session созданы.
2. `profileReady`: timezone валиден, `terms`, `privacy`, `aiWellnessNotice` приняты.
3. `personaReady`: действующая persona preference сохранена.
4. `completed`: предыдущие условия выполнены; starter grant и completion committed атомарно.

Повтор completion возвращает существующий completion resource и не создаёт второй grant/event. Изменение persona после completion допустимо в V1 через тот же preference resource и создаёт `ai_persona_selected` только при фактическом изменении.

## 3. Tracking contract

### 3.1 WeightEntry

| Поле | Тип | Обязательность | Правила |
|---|---|---|---|
| `weightKg` | decimal | да | 20.0–500.0 kg inclusive; максимум 1 знак после запятой; JSON number, в БД exact numeric, не float |
| `recordedAt` | timestamp | нет | default server now; допускается историческое значение, но не более 5 минут в будущем |
| `source` | enum | server/default | VERT-001 принимает только `manual` |

Одна и та же величина в разное время является допустимой отдельной записью. Required `Idempotency-Key` защищает сетевой retry. Первая committed запись создаёт одновременно `first_weight_added` и `weight_added` с `is_first=true`; последующие — только `weight_added` с `is_first=false`.

### 3.2 BodyMeasurement

Body parameters входят в V1, но не обязательны для onboarding и не реализуются в VERT-001.2. Контракт фиксируется сейчас для согласованности tracking.

| Поле | Тип | Обязательность | Правила |
|---|---|---|---|
| `measurementType` | enum | да | один из типов ниже |
| `valueCm` | decimal | да | 10.0–300.0 cm inclusive; максимум 1 знак после запятой; exact numeric |
| `recordedAt` | timestamp | нет | default server now; не более 5 минут в будущем |
| `source` | enum | server/default | только `manual` в V1 |

```text
BodyMeasurementType = waist | hips | chest | abdomen | thigh | upperArm
TrackingSource = manual
```

Каждая запись содержит ровно один measurement type; batch DTO не вводится. Height не является временным измерением и при появлении хранится в profile отдельным контрактом, не в `body_measurements`.

### 3.3 ActivityEntry

Простая фиксация спорта не рассчитывает калории и не интегрируется с устройствами.

| Поле | Тип | Обязательность | Правила |
|---|---|---|---|
| `activityType` | enum | да | тип ниже |
| `durationMinutes` | integer | да | 1–1440 inclusive |
| `intensity` | enum | нет | default `moderate` |
| `occurredAt` | timestamp | нет | default server now; не более 5 минут в будущем |
| `note` | string | нет | 1–500 символов; plain text; не попадает в analytics/logs |
| `source` | enum | server/default | только `manual` |

```text
ActivityType = walking | running | cycling | strength | swimming | mobility | other
ActivityIntensity = low | moderate | high
```

Weight, body measurement и activity resources всегда owner-scoped. Чужой ID возвращает `404 RESOURCE_NOT_FOUND`.

## 4. Analytics contract

### 4.1 Общая оболочка

Каждое событие содержит:

| Поле | Тип | Обязательность | Источник |
|---|---|---|---|
| `event_id` | UUID | да | producer; стабилен при retry |
| `occurred_at` | ISO 8601 UTC | да | producer/server clock для backend events |
| `schema_version` | integer | да | `1` для текущего registry contract |
| `user_id` | opaque ID | если пользователь известен | auth/backend context, не DTO |
| `anonymous_id` | opaque ID | если user неизвестен | frontend-generated non-PII ID |
| `session_id` | opaque ID | если применимо | session context; raw session token запрещён |

Должен присутствовать ровно один из `user_id`/`anonymous_id`, кроме server operational events без пользователя, которых нет в этом срезе. Backend events записываются в outbox в той же транзакции, что бизнес-эффект. Frontend events отправляются после подтверждённого UI/server состояния. Точный вес, email, тексты AI/feedback, balance history и cookie values запрещены.

### 4.2 События VERT-001

| Event | Required properties | Contract trigger | Source |
|---|---|---|---|
| `onboarding_started` | `entry_point` | первый показ onboarding в session | frontend |
| `onboarding_step_completed` | `step_id`, `step_index` | frontend получил success сохранения шага | frontend |
| `onboarding_completed` | `persona_id` | completion + starter grant committed | backend |
| `ai_persona_selected` | `persona_id`, `context` | новая persona preference committed | backend |
| `first_weight_added` | `entry_id`, `source` | первая weight entry committed | backend |
| `weight_added` | `entry_id`, `source`, `is_first` | любая weight entry committed | backend |
| `ai_scenario_opened` | `scenario_id`, `entry_point` | quick reply UI показан | frontend |
| `ai_request_sent` | `action_id`, `scenario_id`, `price_tokens` | operation + reservation + outbox committed | backend |
| `ai_response_success` | `action_id`, `scenario_id`, `latency_ms` | response + confirmation committed | backend |
| `ai_response_error` | `action_id`, `scenario_id`, `error_class`, `tokens_refunded` | technicalError + refund committed | backend |
| `tokens_spent` | `transaction_id`, `action_id`, `amount`, `balance_after` | confirmation committed | backend |
| `response_liked` | `message_id`, `scenario_id` | rating changed to like | backend |
| `response_disliked` | `message_id`, `scenario_id` | rating changed to dislike | backend |
| `feedback_submitted` | `target_type`, `target_id`, `feedback_category` | non-empty category/comment feedback committed | backend |
| `starter_tokens_added` | `transaction_id`, `amount`, `balance_after` | unique starter grant committed | backend |
| `balance_low` | `balance_after`, `threshold` | confirmed available balance crosses configured threshold downward | backend |
| `balance_empty` | `balance_after`, `trigger` | confirmed available balance впервые меняется с positive на `0` | backend |

### 4.3 Закрытые словари properties

```text
entry_point (onboarding) = registration | login | resumeOnboarding
entry_point (AI) = postWeight | conversation
step_id = legal | timezone | persona
step_index = legal:1 | timezone:2 | persona:3
persona_id = gentleFriend | strictCoach | russianLuli | glamorousFriend | analyst
context = onboarding | settings
source = manual
scenario_id = quickReply
error_class = providerUnavailable | timeout | invalidProviderResponse | safetyRejected | internalError | outcomeReconciliationExpired
target_type = aiMessage
feedback_category = notHelpful | incorrect | tone | unsafe | other
trigger = aiAction | manualAdjustment | starterGrant
```

`price_tokens`, `amount`, `balance_after`, `threshold`, `tokens_refunded`, `latency_ms` и `step_index` — non-negative integers; token amounts в spend/refund events передаются положительными magnitudes. Low-balance threshold — управляемая server configuration/data; пока threshold не настроен, событие не отправляется. Analytics platform не выбирается в VERT-001.

Для `tokens_spent` поле `transaction_id` указывает на zero-amount confirmation ledger entry, а `amount` содержит положительную стоимость связанной reservation. Это не создаёт второй balance effect.

## 5. Token Economy contract

### 5.1 Ledger model V0.1

Balance snapshot не используется. Авторитетные значения вычисляются из immutable ledger entries:

```text
availableBalance = sum(amountTokens for all committed entries)
```

| Entry type | `amountTokens` | Reference | Эффект |
|---|---:|---|---|
| `starterGrant` | `+100` | user/onboarding completion | однократное начисление |
| `reservation` | `-price` | AI operation | сразу уменьшает available balance |
| `confirmation` | `0` | reservation | терминально подтверждает расход |
| `refund` | `+price` | reservation | компенсирует reservation при technical error |
| `manualCredit` | positive | admin action | вне первого среза; требует audit |
| `manualDebit` | negative | admin action | вне первого среза; требует audit и non-negative invariant |

Ledger entries не обновляются и не удаляются. Terminal state определяется существованием ровно одного `confirmation` или `refund` для reservation. Unique constraint запрещает оба terminal effects и повтор каждого эффекта.

### 5.2 Reserve

Input: wallet/user, AI operation ID, action type `quickReply`, server-resolved active price record/version, idempotency key.

В одной PostgreSQL transaction:

1. Lock wallet aggregate row.
2. Найти active price; VERT-001 documented default — 1 token, но значение читается из `ai_action_prices`, не из application code.
3. Сверить `expectedPriceTokens` и `priceVersion` клиента.
4. Вычислить current balance из ledger под lock.
5. При balance `< price` завершить без operation/message/reservation с `409 INSUFFICIENT_TOKENS`.
6. Создать immutable negative reservation, AI operation/input message и outbox atomically.

### 5.3 Confirm

Confirm допустим только после сохранения пригодного safe assistant response. В одной transaction создаются zero-amount `confirmation`, response, usage/cost metadata, operation `succeeded` и outbox events. Повтор возвращает существующий результат. Confirm после refund отклоняется `409 TOKEN_RESERVATION_FINALIZED`.

### 5.4 Refund

Refund допустим только для confirmed technical error/safety rejection/reconciliation expiry. В одной transaction создаются compensating `+price` entry, operation `technicalError` и `ai_response_error`. Refund после confirmation отклоняется. Business dislike/incorrectness не вызывает автоматический refund.

### 5.5 Idempotency и constraints

- Один wallet на user.
- Один `starterGrant` business effect на user.
- Одна reservation на AI operation.
- Ровно один terminal effect (`confirmation` XOR `refund`) на reservation.
- `availableBalance >= 0` проверяется внутри locked transaction; Redis lock запрещён.
- API idempotency key scoped user + `startQuickReply`; worker effects scoped operation/reservation, не HTTP key.
- Retry после commit возвращает сохранённый operation/balance; retry после ambiguous DB connection проверяет business keys до нового эффекта.

## 6. AI contract

### 6.1 Persona contract

| `personaId` | Display name | Required style | Запрещено дополнительно к общим safety rules |
|---|---|---|---|
| `gentleFriend` | Бережный друг | тепло, принятие, небольшой следующий шаг | жалость сверху, обесценивание |
| `strictCoach` | Строгий тренер | прямо, структурно, действие | крик, угрозы, наказание |
| `russianLuli` | Русские люли | разговорный юмор, доброжелательная встряска | мат, оскорбления, стереотипы |
| `glamorousFriend` | Гламурная подруга | ярко, уверенно, умеренно игриво | оценка привлекательности по весу, токсичная позитивность |
| `analyst` | Аналитик | нейтрально, причинно-следственно, с неопределённостью | диагнозы, ложная точность |

`strictness` регулирует прямоту, `responseLength` — объём. Ни одно значение не меняет запреты: унижение, стыд, диагноз, голодание, наказание едой/спортом и гарантии результата запрещены.

### 6.2 QuickReply request

- `content`: plain text, 1–4000 Unicode code points после trim; пустое/whitespace-only запрещено.
- `conversationId`: owned active conversation.
- `scenarioId`: только `quickReply`.
- Одна незавершённая AI operation на пользователя; новая возвращает `409 AI_OPERATION_IN_PROGRESS`.
- Server execution timeout: 60 seconds на один provider attempt.
- `outcomeUnknown` reconciliation deadline: 15 minutes; после deadline операция терминально становится `technicalError`, резерв возвращается с class `outcomeReconciliationExpired`.
- Автоматический повтор после возможного принятия запроса provider запрещён без provider idempotency/reconciliation evidence.

### 6.3 Lifecycle

```text
queued → processing → succeeded
                    ↘ technicalError
                    ↘ outcomeUnknown → processing | succeeded | technicalError
```

`succeeded` и `technicalError` terminal. `outcomeUnknown` временный. Пользовательский dislike не меняет lifecycle. Отмена пользователем после начала provider call не поддерживается в V0.1.

### 6.4 Provider-neutral adapter

Нормативный port, выраженный TypeScript-подобной сигнатурой только для контракта:

```ts
interface AiProviderAdapter {
  execute(request: ProviderAiRequest): Promise<ProviderAiResult>;
  reconcile(reference: ProviderRequestReference): Promise<ProviderReconciliationResult>;
}

type ProviderAiResult =
  | { kind: "success"; text: string; usage: AiUsage; providerReference?: string }
  | { kind: "technicalError"; errorClass: AiErrorClass; retryable: boolean }
  | { kind: "outcomeUnknown"; providerReference?: string };
```

`ProviderAiRequest` содержит operation ID/idempotency reference, prompt version, persona style instructions, safety instructions и минимальный разрешённый context. Он не содержит email, cookies, token balance, consent evidence или analytics IDs.

### 6.5 Fake adapter

Fake adapter разрешён только в automated tests и явно маркированном local/test mode; test server для product acceptance не может выдавать его ответ за реальный AI.

| Mode | Deterministic result |
|---|---|
| `success` | безопасный фиксированный response + zero/fixture usage |
| `technicalError` | выбранный `errorClass` |
| `outcomeUnknownThenSuccess` | unknown, затем success при reconcile |
| `outcomeUnknownThenError` | unknown, затем technical error при reconcile |
| `timeout` | контролируемое превышение test timeout |

Mode задаётся test fixture на стороне adapter harness, не пользовательским DTO и не production environment variable.

### 6.6 Ошибки

```text
AiOperationStatus = queued | processing | outcomeUnknown | succeeded | technicalError
AiErrorClass = providerUnavailable | timeout | invalidProviderResponse | safetyRejected | internalError | outcomeReconciliationExpired
```

Безопасный ответ, не соответствующий ожиданию пользователя, остаётся `succeeded`. Полный provider error/body/stack не возвращается клиенту и не пишется в product analytics.

## 7. API contract

Все endpoints имеют `/api/v1`. Одиночный success возвращает resource без `data`; списки — `{items, nextCursor}`. Cookie commands требуют CSRF header/token и Origin/Referer validation после создания session.

### 7.1 Endpoint list

| Method/path | Auth | Request | Success | Idempotency |
|---|---|---|---|---|
| `POST /registrations` | public | `RegistrationRequest` | `201 RegistrationResource` + cookies | required |
| `POST /sessions` | public | `CreateSessionRequest` | `201 SessionResource` + cookies | 5 ошибок на scope IP + normalized email за 15 минут; no key |
| `POST /sessions/refreshes` | refresh cookie | empty | `201 SessionResource` + rotated cookies | rotation/reuse protection |
| `DELETE /sessions/current` | session + CSRF | empty | `204` | natural |
| `GET /users/me` | user | none | `200 CurrentUserResource` | read |
| `GET /users/me/onboarding` | user | none | `200 OnboardingResource` | read |
| `PATCH /users/me/profile` | user + CSRF | `UpdateProfileRequest` | `200 UserProfileResource` | recommended |
| `PUT /users/me/ai-preference` | user + CSRF | `AiPreferenceRequest` | `200 AiPreferenceResource` | natural |
| `POST /users/me/onboarding-completions` | user + CSRF | `CompleteOnboardingRequest` | `201 OnboardingCompletionResource` | required |
| `POST /weight-entries` | user + CSRF | `CreateWeightEntryRequest` | `201 WeightEntryResource` | required |
| `GET /weight-entries` | user | cursor query | `200 WeightEntryPage` | read |
| `POST /body-measurements` | user + CSRF | `CreateBodyMeasurementRequest` | `201 BodyMeasurementResource` | required; later tracking task |
| `GET /body-measurements` | user | cursor/type query | `200 BodyMeasurementPage` | read; later task |
| `POST /activity-entries` | user + CSRF | `CreateActivityEntryRequest` | `201 ActivityEntryResource` | required; later task |
| `GET /activity-entries` | user | cursor/type query | `200 ActivityEntryPage` | read; later task |
| `GET /ai-action-prices/quick-reply` | user | none | `200 AiActionPriceResource` | read |
| `POST /ai-conversations` | user + CSRF | empty | `201 AiConversationResource` | required |
| `GET /ai-conversations/{id}` | owner | none | `200 AiConversationResource` | read |
| `POST /ai/operations` | user + CSRF | `StartAiOperationRequest` | `202 AiOperationResource` | required |
| `GET /ai/operations/{id}` | owner | none | `200 AiOperationResource` | read |
| `GET /token-wallets/current` | user | optional history cursor | `200 TokenWalletResource` | read |
| `PUT /ai-messages/{id}/feedback` | owner + CSRF | `UpsertAiFeedbackRequest` | `200 AiFeedbackResource` | natural |

### 7.2 DTO definitions

```text
RegistrationRequest
  email: string
  password: string
  ageConfirmed: true
  consents: ConsentAcceptance[] // terms + privacy

CreateSessionRequest
  email: string
  password: string

UpdateProfileRequest
  timezone: IanaTimezone
  consents?: ConsentAcceptance[] // aiWellnessNotice; provider consent later

AiPreferenceRequest
  personaId: PersonaId
  strictness?: Strictness = medium
  responseLength?: ResponseLength = medium

CompleteOnboardingRequest
  // empty object; server is the sole source of the starter grant amount

CreateWeightEntryRequest
  weightKg: decimal(4,1)
  recordedAt?: IsoUtcTimestamp

CreateBodyMeasurementRequest
  measurementType: BodyMeasurementType
  valueCm: decimal(4,1)
  recordedAt?: IsoUtcTimestamp

CreateActivityEntryRequest
  activityType: ActivityType
  durationMinutes: integer
  intensity?: ActivityIntensity = moderate
  occurredAt?: IsoUtcTimestamp
  note?: string

StartAiOperationRequest
  conversationId: OpaqueId
  content: string
  scenarioId: quickReply
  expectedPriceTokens: positive integer
  priceVersion: opaque string

UpsertAiFeedbackRequest
  rating: like | dislike
  category?: FeedbackCategory
  comment?: string // 1–1000 plain-text characters
```

`expectedPriceTokens` защищает UX от незаметного расхождения, но backend никогда не принимает его как источник цены. `CompleteOnboardingRequest` — пустая команда: сумма starter grant не передаётся клиентом и возвращается в onboarding resource. Сервер является единственным источником фиксированного правила `100`.

### 7.3 Resource shapes

Каждый resource содержит `id` и применимые timestamps. Минимальные domain fields:

- `RegistrationResource`: `userId`, `onboardingStatus`, `sessionExpiresAt`.
- `SessionResource`: `userId`, `expiresAt`, `onboardingStatus`.
- `CurrentUserResource`: `userId`, `onboardingStatus`.
- `OnboardingResource`: `status`, `completedSteps`, `requiredSteps`, current consent versions, preference summary, `starterTokensAmount=100`.
- `OnboardingCompletionResource`: `onboardingStatus=completed`, `starterTokensGranted=100`, `tokenBalance`.
- `UserProfileResource`: `userId`, `timezone`, `onboardingStatus`.
- `AiPreferenceResource`: persona/strictness/responseLength.
- Tracking resources: normalized value, source, recorded/occurred time.
- `AiActionPriceResource`: `actionType=quickReply`, `priceTokens`, opaque `priceVersion`.
- `AiOperationResource`: `id`, `status`, `conversationId`, `inputMessageId`, optional `outputMessageId`, optional safe `errorCode`, `pollUrl`, optional terminal `balance`.
- `TokenWalletResource`: `walletId`, `availableBalance`, optional cursor page of entries; reservations отражаются immutable ledger items.
- `AiFeedbackResource`: `messageId`, rating, optional category/comment, timestamps.

### 7.4 Error matrix

| Code | HTTP | Основные endpoints/условие |
|---|---:|---|
| `VALIDATION_ERROR` | 422 | любое невалидное DTO/enum/range |
| `EMAIL_ALREADY_REGISTERED` | 409 | registration unique conflict |
| `AUTHENTICATION_FAILED` | 401 | login; нейтрально для email/password |
| `SESSION_INVALID` | 401 | expired/revoked/reused session |
| `CSRF_VALIDATION_FAILED` | 403 | cookie mutation без valid CSRF/origin |
| `RESOURCE_NOT_FOUND` | 404 | отсутствующий или чужой resource |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | обязательный key отсутствует/невалиден |
| `IDEMPOTENCY_KEY_REUSED` | 409 | key reused with different payload |
| `ONBOARDING_INCOMPLETE` | 409 | completion/AI до prerequisites |
| `CONSENT_VERSION_OUTDATED` | 409 | client отправил неактуальную обязательную версию |
| `INVALID_PERSONA` | 422 | persona вне allowlist |
| `AI_PROVIDER_CONSENT_REQUIRED` | 409 | real AI request до provider-specific consent |
| `AI_ACTION_PRICE_CHANGED` | 409 | expected price/version устарели |
| `INSUFFICIENT_TOKENS` | 409 | reserve невозможен |
| `AI_OPERATION_IN_PROGRESS` | 409 | у user уже есть незавершённая operation |
| `TOKEN_RESERVATION_FINALIZED` | 409 | конфликтующий confirm/refund |
| `AI_TECHNICAL_ERROR` | operation result | terminal failure; HTTP polling остаётся `200` resource |
| `RATE_LIMITED` | 429 | auth/AI abuse controls |
| `INTERNAL_ERROR` | 500 | безопасная общая ошибка с `request_id` |

Ошибка всегда использует единый `error` envelope. `AiOperationResource.status=technicalError` является успешным чтением operation resource, а не HTTP transport failure.

Login limiter хранит только SHA-256 scope key и короткоживущий счётчик в Redis. Успешный login очищает счётчик; Redis не становится источником session truth. Пятый неуспешный запрос и последующие запросы внутри окна получают `429 RATE_LIMITED` с `retryAfterSeconds` в `details`.

## 8. Решения и deferred scope

### Закрыто в VERT-001.1

- минимальные onboarding fields, consent types, states и enums;
- weight/body/activity value contracts;
- event properties и закрытые словари первого среза;
- append-only ledger без balance snapshot;
- reserve/confirm/refund/idempotency semantics;
- persona IDs, AI lifecycle, limits и fake adapter port;
- endpoint/DTO/error contract первого среза.

### Отложено без блокировки VERT-001.2

- AI provider и окончательная `aiProviderProcessing` версия — обязательны до реального AI request/приёмки VERT-001.5;
- password recovery channel и endpoints — вне первого среза;
- low-balance threshold value — управляемая конфигурация до включения события;
- body/activity реализация — последующие tracking задачи, контракт уже стабилен;
- display localization, UX copy и полноценная UX specification;
- admin управление AI prices; до admin реализации test data загружается контролируемым seed/deployment step, не hardcoded application constant.

Изменение перечисленных final contracts до реализации требует обновления этого документа, OpenAPI proposal и затрагиваемой документации; архитектурное отклонение требует ADR.
