# Текущий статус

## Актуальный срез — локальная разработка продолжается, 2026-09-24

Текущий общий интеграционный checkpoint: `1c6a234`, включает backend `b9a60be`/`5a08efb`, policy `e1472a7` и предыдущие `ca24217`/`3531480`/`fa13d8d` (включает предыдущую базу
`1ffd048` и исправления worker `ca3d612`). Пользователь разрешил продолжать
разработку и проверки локально, пока увеличивает RAM/storage сервера. Расширение
remote capacity ожидается; новый remote build/deploy не является результатом
этого документального обновления. Продуктовый scope сохранён, `main` не менялся.

- Новые локальные gates, вошедшие в `fa13d8d`, учитываются **по отдельным suites**:
  - Food UI `f231fed`: защита от устаревших ответов при смене аккаунта;
    food **33/33**, web typecheck/scoped lint PASS.
  - Push `e226448` + `156a138`: catch-up при переходе через полночь и отдельный
    запланированный occurrence; actual PostgreSQL **9/9** PASS. Это проверка
    scheduler/persistence, не физической доставки на телефон.
  - Prepared replay `01832ac`: chat/food используют сохранённые immutable
    request payload/hash при изменении профиля/контекста, сохраняют current
    consent и attempt locking, не resubmit/refund для ambiguous/submitting.
    Targeted **14/14** в трёх suites, включая actual PostgreSQL **9/9**;
    worker typecheck/scoped lint PASS. До исправления три новые regressions
    воспроизводили отказ восстановления.
  Эти результаты не складываются в новый full-worker count и не означают
  повторного полного API/web/worker прогона на общем head.
- Terminal photo retention `ea4525f` с исправлением `3531480` **локально
  проверен независимым review; real S3/runtime acceptance НЕ закрыта**. Migration0015 фиксирует неизменяемый terminal timestamp;
  через 30 дней после завершения/ошибки durable cleanup удаляет original/staging
  с lease/retry, защищает от повторной загрузки и сохраняет ledger, receipt,
  результат анализа и подтверждённую историю. Pending/outcomeUnknown,
  never-analyzed и история без доказанного terminal time не удаляются.
  Targeted **12/12** PASS: 7 actual PG retention, 3 runner, 2 existing actual PG
  lifecycle; backend build, worker typecheck/scoped lint и migrate/repeat PASS.
  S3 в тестах stubbed; живые объекты не удалялись. На этом историческом retention-checkpoint добровольное удаление ещё отсутствовало;
  его текущая реализация описана ниже. Новый срок хранения
  never-analyzed uploads не вводился.
  Review закрыл P2: устаревший invalid HEAD/body больше не переводит новое
  available/deleted изображение в quarantine; UPDATE ограничен pendingUpload
  без deleted_at. Затронутые retention/lifecycle **13/13** PASS, backend
  typecheck/scoped lint PASS; независимый reviewer повторил **4/4 actual PG**.
  Это отдельные наборы, не новый суммарный full-worker count.
- Terminal deletion `b9a60be`: отдельные owner-scoped DELETE фото/результата,
  безопасный status после tombstone, durable cleanup original/staging и очистка
  content-bearing receipt/idempotency replay. Ledger и подтверждённая история
  сохранены; ADR-012 разделяет удаляемое содержимое и неизменяемые метаданные.
  **32/32** targeted PG/runner PASS; независимый reviewer не нашёл P1/P2 и
  повторил **7/7 actual PG**. Это локально проверенный terminal-checkpoint,
  не доказательство физического удаления или 24-часового SLA.
- Known-unsent cancellation `5a08efb` **локально проверен независимым review;
  remote/runtime acceptance НЕ закрыта**. Reviewer не нашёл конкретных P1/P2
  и независимо повторил **10/10 actual PG**. Операция cancelled с отдельным cancellation reason и полным
  aiRefund атомарно блокирует будущую отправку. Missing provider ID сам по себе
  не разрешает возврат: submitting/accepted/ambiguous и любые признаки возможной
  отправки дают409 без удаления/возврата. Pre-ID unknown goodwill остаётся TBD.
  **41/41** в шести targeted suites; позднейший cancellation subset **10/10**
  после strict-NULL/empty-ID и repeated-delete regressions. Эти числа перекрываются
  и **не складываются**. Миграции0016/0017 и repeat PASS; backend/worker/API
  typecheck, scoped lint, generated contracts и contracts:check PASS.
- Food UI `1c6a234`: отдельные фото/результат controls, server-authoritative
  cancellation/refund marker, reload/account-switch/polling guards.
  **43/43** food tests, full web typecheck и scoped lint PASS. Browser/runtime
  приёмка pending. Старые unconfirmed/technicalError analyses ещё нельзя найти
  через отдельный список: controls доступны для текущего анализа и подтверждённой
  истории, discoverability gap остаётся следующим пакетом.
- Предыдущая локальная база доказательств: API **92/92**, worker **44/44**, включая реальные
  PostgreSQL lifecycle/concurrency проверки; provider-prompt tests **15/15**.
  Food UI на `d52eb9f`: **24/24**. Это отдельные зафиксированные наборы, а не
  заявление о повторном прогоне всех тестов на каждом следующем commit.
- Последующий Food UI checkpoint `cd48570`: явно показаны четыре статуса
  suitability (`matches`, `doesNotMatch`, `mixed`, `insufficientData`) и точные
  элементы server `missingData`. При изменении состава прежняя оценка и список
  недостающих данных не выдаются за оценку исправленного блюда; stale guard
  сохранён. Food **29/29**, web typecheck и scoped lint PASS. Это локальная UI
  проверка, без новой real-provider или browser/runtime приёмки.
- Submit/acceptance/recovery используют общий operation-row lock; прежняя
  late-provider/sweep race закрыта локальными PostgreSQL regressions. Food
  ledger/lifecycle проверены на настоящих миграциях. Старые FAIL/SKIPPED ниже
  относятся к предыдущим checkpoints и не отменяют этот результат.
- Последний live осмотр сервера `5.42.126.71`: **1 CPU / 2 GB RAM**. У API
  `atlas-gerbi-marathon` и `atlas-v01` зафиксировано `State.OOMKilled=true`;
  для двух worker exit1 установлены отдельные причины: у обоих
  `OOMKilled=false`. Marathon worker завершился из-за необработанного
  `EAI_AGAIN postgres` в outbox publisher (причина DNS-сбоя не установлена).
  Daily-coach с `AI_PROVIDER=fake` не прошёл validation пустых optional GenAPI
  env, подставленных Compose. Нельзя считать прежние стенды healthy.
- Локальное исправление `ca3d612`: outbox publisher обрабатывает отказы и
  повторяет попытку на следующем tick, не допускает overlap, сохраняет durable
  outbox до приёма очередью, использует стабильный job ID и корректно завершает
  работу. Только пустые optional chat GenAPI env нормализуются в undefined;
  непустые некорректные значения и обязательные real GenAPI настройки сохраняют
  validation. Независимые food/push настройки проверяются даже при fake chat.
  Worker **52/52** PASS, включая actual PostgreSQL; backend/worker typecheck и
  scoped lint PASS. Сервер не перезапускали и не обновляли: исправления там
  ещё не действуют, DNS recovery и пользовательский путь remote не проверены.
- Root удалил **только неиспользуемый Docker build cache**: Docker сообщил об
  освобождении **4.721 GB**. После очистки `df`: **4.2 GB свободно, 85% занято**;
  **24 running контейнера**, их состав не изменён этой очисткой. Доступная RAM
  около **510 MiB**, swap около **1.5 GiB используется**. Очистка диска не
  подтверждает достаточность памяти и не означает восстановление API/worker.
- Real storage round trip, реальный GenAPI food, новый browser/runtime путь и
  физический phone push остаются **PENDING / NOT ACCEPTED**. Домен/HTTPS и
  телефонная приёмка также не закрыты. Старые standalone/core-marathon проверки
  не принимают за них расширенный пилот.

Подробности и границы: [local ledger/recovery checkpoint](../07-deployment/gerbi-local-ledger-recovery-checkpoint.md).

## История checkpoints — не актуальный health/status

Следующие записи сохранены для истории. Их FAIL, пропущенные проверки, SSH без
banner, старые значения свободного диска и заявления healthy относятся только
к названным тогда commit и наблюдениям. Для текущих действий использовать срез
выше; история не доказывает ни сегодняшнюю недоступность всего сервера, ни
здоровье всех старых стендов.

### Исторический expanded pilot local PostgreSQL checkpoint — 2026-09-24

- Recovery and initial submission now share operation-row locks; a stale sweeper cannot overwrite a newer provider receipt. Real PostgreSQL concurrency regressions pass.
- Food reservation/confirmation/refund use existing ledger columns; no schema workaround. FoodService create/replay → worker result → correction → explicit consumption/replay → edit/read → delete/replay is verified on actual migrations, with separate technical-error refund and owner-read isolation. PostgreSQL dates remain `YYYY-MM-DD`.
- Isolated runtime preparation: source `aee4755` transferred; compatible Linux dependencies verified, local Node 24 builds ready. Runtime start blocked by 656MB disk / ~476MB available RAM ; other projects preserved. DockerHub references were corrected to verified public official Quay digests; no owner registry credentials are needed, no images pulled.
- Local gates and limits: [verification evidence](../07-deployment/gerbi-local-ledger-recovery-checkpoint.md). This is local synthetic/provider-stub evidence; real GenAPI image, physical phone push and isolated runtime acceptance remain pending.

### Историческая промежуточная интеграция расширенного пилота — 2026-09-24

- Конституция и scope синхронизированы в `e6874de`. Общий backend/UI checkpoint `31fd0c8`: локальные builds/lint/contracts PASS, worker 40/40, API 46/46 и web 94/94 по отчёту исполнителя; 46 PostgreSQL-проверок локально пропущены. Повторный review оставляет late-provider/sweep race незакрытой до следующего исправления. Test server SSH без banner, прежние HTTP-стенды недоступны; причина не подтверждена, owner console запрошена. Runtime и физический phone push НЕ приняты.

- UI checkpoints `baccdf5` и `b28b2b3`: настройки телефонных push и edit/delete подтверждённой еды завершены на уровне кода. Исполнители подтвердили web 94/94 (22 файла), typecheck и scoped lint PASS. Backend push lookup `900a25c` интегрирован; активной API-зависимости у push UI нет. Физическая доставка, реальная food vision и сквозная runtime-приёмка ещё не подтверждены.

- Food UI recovery `add1a63` реализован; исполнитель подтвердил 79/79 web tests (включая параллельные push tests) и scoped lint. Полный typecheck на том шаге ожидал завершения notifications WIP. Это не подтверждение runtime готовности.
- Backend checkpoint `ae0f95f` интегрирован в UI-ветку: browser-reachable private upload, food known-ID reconciliation, DTO validation и runtime push config/per-device revoke. По отчёту бэка: worker 37/37, API regression 44/44 и новые validation 2/2. Сквозной запуск ещё проверяется.
- Фото/разбор не считаются употреблением без подтверждения. Edit/delete подтверждённого питания и push UI завершаются отдельными исполнителями.
- Phone push acceptance ждёт HTTPS hostname и тестового телефона владельца. Правило возврата при неизвестном результате до provider ID ещё не утверждено. Main/stable и публичный запуск не изменены.

### Историческое уточнение марафонного пилота — 2026-09-24

- Completion audit на verification commit `629f576` подтвердил PostgreSQL marathon gates `9/9`, calendar boundary `2/2` и GenAPI reconciliation matcher `2/2`: межкомандные read/write запрещены, captain create/edit разрешён, participant write запрещён, safe team DTO не содержит raw weight/chat/memory/baseline/cumulative totals, первый и последний дни/rollover обработаны по контракту. Frontend отдельно подтвердил в браузере видимый восстановленный assistant reply и разблокированный composer без нового платного запроса.
- Operator tool и [runbook GenAPI reconciliation](../07-deployment/genapi-reconciliation-runbook.md) доступны в изолированном test checkout; строгая сверка fail-closed и safe replay подтверждены. Изолированный synthetic пилот подготовлен к ручной приёмке владельцем, но **не** принят как production или stable release; `main`, stable `atlas-v01`, frontend и runtime images этим audit не менялись.
- Открытые ограничения: pre-request-ID ambiguity не имеет автоматического recovery; reconciliation реконструирует persona/profile/weight/memory из текущего состояния, поэтому context drift после submit требует отказа до появления immutable request snapshot/hash. Runtime timeout не изменялся.
- В отдельной backend-ветке реализованы marathon/team/membership, отчёт за вчера по восьми отметкам, задание капитана, participant completion, safe daily team read model и current-version provider consent. Migration `0012` создаёт marathon schema, `0013` фиксирует immutable baseline; PostgreSQL integration 8/8, API 44/44 и worker 32/32 подтверждены.
- Shared isolated stand `atlas-gerbi-marathon` проверяет join, wellness, captain task, daily weight, daily podiums и AI boundary без изменения stable. Browser GenAPI acceptance подтвердила disabled UI до consent, сохранение consent актуальной версии, два последовательных `succeeded` ответа и ledger delta `-2`; privacy-safe builder proof подтвердил передачу структурированного timezone/persona/weight context во второй запрос.
- Финальный browser checkpoint на isolated checkout `912d000` подтвердил public login/readiness `200`, mobile `390px` без overflow, понятный GenAPI disclosure и безопасное обновление UI после `MARATHON_TASK_DATE_INVALID`. Targeted memory/history gate отдельно подтвердил один active safe fact в bounded context и два prior messages; следующий реальный provider-вызов первоначально получил `outcomeUnknown`, сохранил reservation без terminal effect и заблокировал composer.
- Audited post-request-ID reconciliation реализована в backend commit `e4b930f` и проверена на provider request `54055527`: строгий request match, `outcomeUnknown → succeeded`, одна confirmation, ноль refunds, одна assistant message, один audit marker и идемпотентный replay без дубликатов. Чистая PostgreSQL integration прошла `1/1`; текущий пользователь больше не заблокирован незавершённой operation. `main`, stable и frontend не изменялись.
- Read-only provider review подтвердил native async contract Grok 4.5 с `request_id` и polling, но не нашёл документированной идемпотентности initial submit или lookup по client ID. Поэтому post-request-ID recovery подтверждена, а pre-ID timeout остаётся блокером полного real-AI recovery до ответа GenAPI или отдельной принятой policy. Автоматическая reconciliation orchestration и blind resubmit не добавлялись.
- Точная UI evidence-граница и image digests сохранены в [runtime evidence](../07-deployment/gerbi-marathon-runtime-evidence.md); disclosure прямо называет передачу сообщения и необходимого контекста в GenAPI.
- Командный API не раскрывает raw weight, AI chat/memory или накопленные итоги. `unknown` не заменяется нулём; первый день возвращает `notApplicable`; отчёт за последний день доступен следующим утром.
- Приняты и проверены правила дневных показателей: точный вчера→сегодня процент, immutable first-in-marathon baseline, wellness как сумма восьми boolean, self-reported captain task и общие места при равенстве. PostgreSQL suite 8/8 и shared UI runtime подтверждают contract; stale task ID отклоняется `409 MARATHON_TASK_DATE_INVALID`, а точный успешный replay остаётся стабильным. Реальные даты, команды и капитаны остаются входными данными владельца.
- Расширенный обязательный pilot scope теперь включает food photo analysis, phone push reminders и автоматическое AI recovery. Фото сначала анализируется, а употребление фиксируется только отдельным подтверждением «Съели ли вы это?»; только подтверждённые записи входят в дневник и наблюдаемую динамику питания/веса. Push требует отдельного opt-in и browser subscription. Причинные диагнозы и выдуманные профильные данные запрещены.
- В отдельной UI-ветке от интеграционной базы `2bf0430` подготовлены local client-компоненты: выбор/preview/валидация фото, явное разделение analysed/confirmed с датой и временем только на этапе подтверждения, а также capability/permission UI для push. Добавлен `/food`: он читает управляемую цену и только подтверждённую историю, загружает выбранное фото через private upload intent, создаёт идемпотентную analysis operation и poll-ит typed status. Анализ не создаёт дневник; перед confirmation сохраняется correction. Fake adapter видимо помечается тестовым режимом. Реальные vision/push runtime acceptance и уже подтверждённые correction/delete ожидают следующих backend checkpoints и isolated verification.

## Документальный срез 2026-09-23

- В ветке `docs/project-vision` добавлен корневой `PROJECT-VISION.md` и обязательное чтение в `AGENTS.md`. Это документальная работа, без изменения приложения, миграций и окружений.
- Локально проверено: `main`/`origin/main` указывают на `ac398f20e49e6c45696022928f21b32688e55607`; AI-001 (`4f823f8`), AI-002 (`4f169b1`) и AI-003 (`d5a4e0a`) остаются отдельными ветками. Статус работающего сервера в этой задаче не проверялся.
- Следующие строки этого файла описывают исторические результаты отдельных задач. Указание ниже, что UI-ветка ожидает merge, относится к более раннему срезу и не является текущим статусом `main`.

- Дата рабочего backend-среза: 2026-09-24.
- AI-003: Daily Coach backend реализует и изолированно проверяет одну timezone-aware state row на локальную дату, state machine `notStarted → inProgress → completed`, lazy initialization, structured daily context и owner-scoped REST API в отдельной ветке; migration repeatability, 76 API и 32 worker tests подтверждены, `main` и stable не изменены; frontend, scheduling, prompts и Character не входят.
- AI-002: structured companion memory, nullable profile context, migration `0010`, owner list/delete API, deterministic worker extraction и bounded memory context реализованы и проверены в отдельной ветке; `main` не изменён.
- AI-001: GenAPI adapter реализован и проверен в отдельной ветке на synthetic test-пользователях; `main` и stable остаются на fake до приёмки и merge.

### Исторический срез 2026-07-28

- В feature ancestry текущей UI-ветки присутствуют AI-001/002/003, однако `main` не меняется: он остаётся на fake AI. GenAPI выбран и реализован в AI-001, но обычным пользователям доступен только после отдельного consent-flow и решения о включении.
- AI-003: Daily Coach backend изолированно проверяет timezone-aware state row на локальную дату, переходы `notStarted → inProgress → completed`, lazy initialization, structured daily context и owner-scoped REST API; frontend, scheduling, prompts и Character в AI-003 не входят.
- Следующие строки — исторические результаты отдельных задач. Упоминание UI-ветки, ожидающей merge, относится к срезу 2026-07-28 и не является текущим статусом `main`.
- Текущая задача: UI-005/BACK-UI-001 объединены и проверены в ветке `ui/ui-001-daily-weight`; слияние в `main` не выполнялось, результат ожидает ручной приёмки.
- Код приложения: scaffold web/API/worker, identity/profiles modules, token-economy completion/wallet, tracking веса с графиком, daily upsert и persisted fake-runtime AI chat.
- Реальный AI provider остаётся только в несмёрженной AI-001 базе; платежи, рефералы, memory frontend и feedback отсутствуют.
- Тестовый сервер: технический scaffold web/API/worker с PostgreSQL 17 и Redis 8 развёрнут и проверен.
- AI-провайдер: GenAPI выбран ADR-011 и технически проверен; merge и пользовательский consent-flow не выполнены.
- BUG-UI-001/UI-003 добавляют owner-scoped чтение уже существующих conversation/messages и корректирующую ledger migration `0007`; AI provider и analytics events не меняются.

## UI-001 — ежедневная фиксация веса

- Добавлен mobile-first `/today` с сегодняшней датой, последним весом, нейтральной динамикой и последними 10 записями.
- Вес сохраняется через существующий `POST /api/v1/weight-entries`; подтверждённый ответ обновляет экран без optimistic update.
- Неизменённый payload повторяет стабильный `Idempotency-Key` после сетевой ошибки, поэтому server-side idempotency не создаёт дубль.
- Реализованы loading, empty, saved, validation, network retry, session expired и disabled/loading states.
- Минимальная навигация связывает `Сегодня` и существующий `/quick-reply`; completed user перенаправляется с технического onboarding на `/today`.
- Backend, ledger, database schema, generated contracts и event registry не менялись.
- Добавлен минимальный `/login` через существующий `POST /sessions`; фактический onboarding state читается после входа и completed user направляется на `/today`.
- Истёкшая session на `/today` направляет на `/login`; auth cookies остаются HttpOnly и не сохраняются в browser storage.
- Для внешнего тестового доступа подготовлен isolated Compose project `atlas-ui-001`: browser API идёт через same-origin gateway, наружу публикуется только port, заданный `UI001_PUBLIC_PORT`.
- Ручной сценарий: [UI-001 manual acceptance](../06-development/ui-001-manual-acceptance.md).
- Isolated test-server topology `atlas-ui-001` проверена на commit `4e906d8`: migrations repeatable, все шесть сервисов healthy, наружу опубликован только gateway. Login → today → weight retry → quick reply и mobile viewport прошли; `atlas-v01` остался healthy и неизменным.

## UI-002 — точность веса

- Реализована поддержка значений с нулём, одним или двумя знаками после запятой во frontend, API и PostgreSQL numeric persistence.
- Migration `0006_ui_002_weight_precision.sql` переводит `weight_entries.weight_kg` с `numeric(4,1)` на `numeric(5,2)` без потери существующих строк; idempotency weight command сохраняет исходный request hash.
- Первичная runtime verification была отменена: web container не был пересоздан из актуального image, а PWA использовал неизменённый shell cache `v1`. Исправление `4339439` меняет cache на `atlas-shell-v2`; web/gateway изолированного стенда пересобраны и пересозданы из этого commit.
- В чистом browser profile `98.45` сохраняется и показывается как `98,45 кг`; migrations repeatable, `98` / `98,4` / `98,45` сохраняются, `98,456` отклоняется в UI и API, identical retry не создаёт дубль. Stable `atlas-v01` остался healthy и неизменным.

## BUG-UI-001 / UI-003 / UI-004

- Точная причина `Unexpected server error` установлена runtime-проверкой: legacy constraint `uq_token_transactions_starter_grant_user` ошибочно запрещал второй `aiReservation` одного пользователя, PostgreSQL возвращал `23505`, а общий API filter скрывал infrastructure exception.
- Migration `0007_ai_reservation_uniqueness.sql` заменяет constraint частичным уникальным индексом только для `starterGrant`; последовательные AI reservations снова разрешены, одноразовый starter grant остаётся защищён.
- Дополнительно старый `/quick-reply` повторно использовал один `Idempotency-Key` для разных payload, из-за чего API возвращал `409 IDEMPOTENCY_KEY_REUSED`.
- Ключ AI operation теперь живёт вместе с каноническим payload: новая отправка получает новый ключ, а потерянный сетевой ответ безопасно повторяется с прежним ключом.
- `/quick-reply` переделан в mobile-first чат с persisted PostgreSQL messages, разделёнными user/assistant сообщениями, ожиданием fake AI, inline error/retry и компактной ценой.
- Реализованы owner-scoped `GET /ai-conversations/current` и ранее спроектированный `GET /ai-conversations/{id}`; пустые conversation не скрывают последнюю беседу с сообщениями.
- На `/today` добавлен лёгкий SVG-график над сохранённым списком. Одна запись и несколько записей в один день отображаются без изменения модели данных и без UI-библиотеки.
- Automated verification: lint и production build проходят; web 31/31, API unit 27/27, worker 2/2 и PostgreSQL AI integration 4/4. Root `pnpm typecheck` по-прежнему выявляет baseline `TS6307` в существующей API/project-reference конфигурации, при этом production build выполняет TypeScript-проверку успешно.

## UI-005 / BACK-UI-001 — daily weight upsert

- `weight_entries` хранит одну актуальную запись на локальную календарную дату пользователя: первое сохранение возвращает `created`, повтор за ту же дату — `updated`.
- Дата вычисляется по IANA timezone профиля в момент сохранения; PostgreSQL partial unique index защищает одну текущую строку на `(user_id, local_date)`.
- Исторические дубли не удаляются. Migration `0008_back_001_daily_weight.sql` помечает текущей последнюю строку по `updated_at DESC`, `created_at DESC`, `id DESC`; API history возвращает только актуальные ежедневные значения.
- Контракт и хранение веса сохраняют точность UI-002: до двух знаков после запятой, OpenAPI `multipleOf: 0.01`, PostgreSQL `numeric(5,2)`.
- Изолированная runtime-проверка `atlas-ui-001` пройдена: migration `0008` выполнена повторно, PostgreSQL integration 6/6, contract/client drift отсутствует, targeted `/today` web tests 11/11 и browser/mobile сценарий create → update → reload → `/quick-reply` подтверждены.
- В `atlas-v01` не вносились изменения: его контейнеры, volumes, runtime env и опубликованные ports сохранены.

## VERT-001.5 — завершена

- Persistence: завершён — цены, conversations/messages/operations и ledger constraints проверены на PostgreSQL.
- API transaction: завершён — idempotent operation creation, reservation и durable outbox реализованы и проверены.
- Worker: завершён — BullMQ delivery, fake adapter lifecycle, confirmation/refund/outcomeUnknown и restart/duplicate delivery verified.
- Web boundary: завершён — `/quick-reply` показывает цену, явное предупреждение fake runtime, submit и polling состояний `queued`/`processing`/`succeeded`/`technicalError`/`outcomeUnknown`.
- Final test-server acceptance: пройдена в изолированной topology. Подтверждены success, refund, outcomeUnknown, idempotency, duplicate outbox delivery, worker restart, safe logs/outbox payloads, migrations и targeted regression tests.
- Реальный AI provider по-прежнему не подключён и не проверялся.
- Следующая вертикаль не начата и требует отдельного задания.

## VERT-001.4 verification

- Реализованы `personaReady → completed`, одноразовый `starterGrant +100`, append-only wallet ledger, owner-scoped weight entries и минимальная PostgreSQL HTTP-idempotency persistence.
- На test server подтверждены repeatable migration, health всех сервисов и основной сценарий от registration до first weight.
- Повторы completion/weight не дублируют effects; key reuse с изменённым payload возвращает `409 IDEMPOTENCY_KEY_REUSED`.
- AI actions, reserve/confirm/refund, prices, payments, referrals и outbox consumers не входят в задачу.
- Runtime verification policy: local Codex runtime может отличаться от baseline; Docker/test server остаётся authoritative средой final verification.

## Решения ARCH-001

- pnpm/TypeScript monorepo, Next.js/React PWA и NestJS modular monolith с отдельным worker.
- PostgreSQL — бизнес-истина; Redis — очередь/координация; private S3 — файлы.
- REST/OpenAPI, idempotency, operation resources и reconciliation `outcomeUnknown`.
- Cookie auth, refresh rotation, CSRF, ownership, admin MFA/RBAC/audit.
- Transactional outbox, repeatable jobs и single-server Docker test topology.
- AI Gateway/provider adapters без выбора AI-провайдера.

Код, зависимости, контейнеры и CI не создавались. Решения BOOT-001 и production перечислены в [backlog.md](backlog.md).

## Acceptance ARCH-002

Целевая архитектура сохранена без изменений. Для V0.1 разрешена инкрементальная реализация без пустых модулей и универсальных платформ; ledger, ownership, idempotency, constraints, минимальный outbox/worker и security baseline обязательны. Полный review и входные решения BOOT-001 — в [architecture-acceptance-review.md](../01-architecture/architecture-acceptance-review.md).

## Engineering baseline BOOT-000

- Runtime/frameworks: Node.js 24 LTS, pnpm 11, TypeScript 5.9, Next.js 16/React 19 и NestJS 11.
- Persistence/queue: Drizzle + reviewed SQL migrations + node-postgres; BullMQ поверх PostgreSQL transactional outbox.
- Auth: project-owned opaque cookie sessions в PostgreSQL, rotation/reuse detection, CSRF и Argon2id.
- Contracts/tests: Nest validation/OpenAPI, Zod, Orval; Jest/Supertest, Vitest/Testing Library и Playwright.
- Monorepo/PWA/operations: pnpm workspace без task runner, network-first safe-cache PWA, structured JSON logs и nightly off-host PostgreSQL backup.

Полные решения, ограничения, compatibility notes, prerequisites и deferred decisions находятся в [engineering-baseline.md](../01-architecture/engineering-baseline.md). На момент завершения BOOT-000 код, зависимости, scaffold, Docker и CI ещё не создавались.

## BOOT-001 scaffold

- Созданы pnpm workspace, lockfile, strict TypeScript, ESLint/Prettier и test tooling.
- Созданы Next.js PWA health page, NestJS API health/OpenAPI/error/request-ID contour и отдельный BullMQ worker.
- Подключены Drizzle/node-postgres и Redis health adapters, пустая bootstrap migration и contract generation.
- Созданы Dockerfile/Compose для web/API/worker/PostgreSQL/Redis, migration service и smoke commands.
- S3, CI, production deployment и любые продуктовые функции не создавались.

Локальные tests/typecheck/build выполняются. Финальная Docker-проверка выполнена на test server; детали зафиксированы в [runtime verification](../07-deployment/runtime-verification.md).

## BOOT-001.1 runtime verification

- Frozen install повторно прошёл под Node.js 24.18.0/pnpm 11.14.0.
- Production entrypoints web/API/worker запускаются локально; liveness проходит.
- Manifest, service worker registration и Playwright smoke подтверждены.
- Исправлен build defect API/worker, связанный с Nest `deleteOutDir` и incremental TypeScript emit; повторные build сохраняют entrypoints.
- PostgreSQL, Redis, migrations, Compose readiness и `pnpm smoke` не проверены без Docker.

Эти локальные ограничения закрыты последующей проверкой на test server. VERT-001 не запускался.

## BOOT-001.2 test-server runtime

На test server подтверждены GitHub checkout, Docker Engine, Docker Compose, Docker Hub authentication, сборка images, PostgreSQL 17, Redis 8, Drizzle migration, API health, web HTTP `200`, worker health и deployment workflow. BOOT-001 полностью закрыт.

## BOOT-001.2 migration compatibility fix

Test-server run выявил CJS transform error из-за top-level `await` в `database/migrate.ts`. Migration entrypoint переведён на async `main()` без изменения общего module strategy и без новых зависимостей. Исправление проверено в migration container: Drizzle migration выполняется успешно.

## Переход к VERT-001

- Runtime-блокеров со стороны BOOT-001 не осталось.
- Входная база: принятая архитектура, engineering baseline, работающий monorepo scaffold и проверенный test deployment.
- Scope, acceptance criteria, затрагиваемые доменные модули, API, события и security requirements должны быть заданы отдельной задачей VERT-001.
- До отдельного подтверждения продуктовая реализация не начинается.

## VERT-001-DESIGN

- Описаны registration → onboarding → persona → weight → async AI → token ledger → response → feedback.
- Определены границы identity, profiles, tracking, ai-companion, token-economy и analytics.
- Подготовлены database/API proposals, AI success/refund/reconciliation flow, event mapping и testing strategy.
- Реализация разбита на VERT-001.1—VERT-001.8 в [отдельном backlog](vert-001-backlog.md).
- AI-провайдер не выбран; реальная AI-приёмка остаётся заблокированной до отдельного решения.
- Код, migrations и инфраструктурные изменения в VERT-001-DESIGN не создавались.

## VERT-001.1 contracts

- Зафиксированы минимальные onboarding fields, consent types, states, validation и enums без лишних персональных данных.
- Зафиксированы контракты веса, параметров тела и простой активности; body/activity не входят в ближайшую VERT-001.2 реализацию.
- Конкретизированы properties событий существующего event registry и закрытые словари первого среза.
- Принят append-only token ledger без balance snapshot с PostgreSQL lock и идемпотентными reserve/confirm/refund.
- Зафиксированы AI lifecycle, persona IDs, provider-neutral/fake adapter contracts и error states без выбора provider.
- Зафиксированы REST endpoints, DTO, ownership/idempotency и error matrix.
- Код и migrations не создавались. Следующая разрешённая задача — VERT-001.2 после отдельного подтверждения.

## VERT-001.2 identity/session

- Реализованы registration, login, refresh rotation/reuse detection, current identity и logout только через утверждённые REST endpoints.
- Password хранится как Argon2id hash; opaque access/refresh secrets хранятся в PostgreSQL только как SHA-256 hashes.
- Registration/credentials/consents/sessions создаются одной PostgreSQL transaction; replay key не дублирует user и заменяет только связанную registration session family.
- Cookie baseline использует HttpOnly/Secure/SameSite, CSRF double-submit с Origin/Referer validation и server-side session truth.
- Login rate limit использует hashed IP + normalized-email scope в Redis; PostgreSQL остаётся источником session truth.
- Migration `0001_identity_sessions.sql`, OpenAPI generated client, unit/API/PostgreSQL integration tests и [ручная приёмка](../06-development/vert-001-2-manual-acceptance.md) добавлены.
- Новые analytics events не создавались: identity registration/login событий нет в утверждённом event registry.
- Test-server deployment не входил в эту задачу; полный runtime acceptance запланирован в VERT-001.8.

## VERT-001.3 design review

- Подготовлен [технический дизайн onboarding/profile state](../01-architecture/vertical-slices/VERT-001.3-design-review.md) без кода и миграций.
- `users.onboarding_status` остаётся единственным persisted state machine; `profiles` владеет criteria, но не получает прямой доступ к identity repository/table.
- Принят scope: VERT-001.3 безопасно завершается `personaReady`; VERT-001.4 включает `completed`, starter grant, первый вес и tracking initialization.
- Принят minimal transactional outbox: VERT-001.3 хранит и атомарно записывает `profiles.ai_persona_selected.v1` без consumer-ов, worker logic, AI Gateway или токенов. AI Gateway, token ledger и первый вес не запускались.

## VERT-001.3 implementation

- Добавлены profile/persona REST endpoints, `profiles` module и технический web route `/onboarding`; state machine останавливается на `personaReady`.
- Migration `0002_profiles_onboarding_outbox.sql` создаёт `user_profiles`, `ai_preferences` и private `outbox_messages` storage с индексом pending records.
- `profiles.ai_persona_selected.v1` сохраняется в той же PostgreSQL transaction, что preference и переход к `personaReady`; consumer, worker delivery, AI Gateway и token effects отсутствуют.
- Final verification на test server пройдена: clean checkout `3437087`, API health, повторяемые migrations, PostgreSQL persona/outbox integration (5/5), API regression (16/16) и manual persona scenario подтверждены. Один persona retry не создаёт второй outbox event.
- Добавлены API, PostgreSQL integration и frontend tests; OpenAPI/client generation выполнены. Test-server deployment не входил в задачу.
