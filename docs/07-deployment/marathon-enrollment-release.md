# Герби-Марафон: набор и отдельный первый день

## Решение владельца 2026-10-01

Участники вступают кнопкой без кода. Капитан выбирает длительность в днях,
открывает набор, завершает набор и отдельной кнопкой начинает первый день.
Даты определяются фактическим запуском первого дня, а не открытием набора.
Email настоящего капитана владелец предоставит позднее; это требуется для
назначения прав, но не для разработки и проверки сценария.

Один общий поток нового марафона доступен всем зарегистрированным пользователям.
Название: «Герби-Марафон». Новая форма не запрашивает имя команды или join code.
Существующие команды, участники и данные прежнего контракта сохраняются.

## Поведение

| Состояние | Участник | Капитан |
| --- | --- | --- |
| Набор ещё не открыт | Нет доступного набора | Длительность 1–365 дней и «Открыть набор» |
| Набор открыт | «Вступить в марафон»; вступивший ожидает начала | «Завершить набор» |
| Набор закрыт, первый день не запущен | Участники ожидают; новых вступлений нет | «Начать первый день» |
| Марафон идёт | Номер дня, вес, вчерашний индекс, задание, пьедесталы | Те же данные и существующее управление заданием |
| Срок завершён | Завершённый марафон | Возможность следующего набора по проверенному lifecycle |

Промежуточные состояния не создают дневных отчётов/задач и не фиксируют
стартовый вес. Первый вес внутри периода становится неизменяемым baseline.
Окончание включительно: дата первого дня + длительность − 1 в timezone марафона.

## Обязательная приёмка

- Additive upgrade 0019→0020 сохраняет identity, вес, ledger, food и прежний марафон.
- Auth/CSRF/guarded captain права проверяются сервером, независимо от UI.
- Повтор открытия/вступления/закрытия/старта с тем же ключом не дублирует данные.
- Конкурентные вступление и закрытие сериализуются на marathon row:
  после подтверждённого закрытия новые участники не появляются.
- Одновременные старт/открытие не создают два действующих марафона.
- Нельзя запустить день до закрытия набора; повтор старта не сдвигает даты.
- Номер дня, конечная дата и boundary midnight проверяются в timezone марафона.
- Вес с `recorded_at` до фактического `started_at` не становится
  public-enrollment baseline. Первая post-start запись/правка
  фиксирует `NEW` вес; последующие правки baseline не переписывают.
  Legacy-code поведение и данные прежнего release сохраняются.
- На `endsOn + 1` участнику доступно финальное окно отчёта.
  Если новый марафон уже открыт/запущен, lobby/default current
  не скрывают его; старый отчёт выбирается через server-provided
  `lobby.finale.marathonId`. На `endsOn + 2` scoped access отклоняется.
- Пользователь до вступления/во время ожидания/после старта видит правильный
  экран. Капитан видит только доступные переходы; закрытие набора отражается
  у участника после обновления страницы.
- Public browser проверка и реальные integration/runtime tests обязательны.

## Выпуск

Условия и политика обновляются до `terms-2026-10-01-v4` и
`privacy-2026-10-01-v4`, чтобы описание вступления совпало с интерфейсом.
Ограничения видимых команде полей сохраняются. Версия согласия GenAPI
`genapi-chat-food-2026-10-01-v2` не меняется: новый набор не расширяет AI payload.

Ветка координатора: `release/marathon-enrollment-20261001`, база `e88532d`.
Backend и frontend работают в отдельных ветках и возвращают коммиты координатору.
Исправление food labels `462da6d` включено как `7e950a2`. Публичный runtime
обновлён до `f8eade4`; `main` не менялся. Найденные пограничные дефекты исправлены;
назначение настоящего капитана и полный публичный protected browser путь
остаются открытыми, как описано в актуальном checkpoint ниже.

Food E2E предыдущего выпуска уже прошёл на synthetic photo, one paid call.
Общий журнал проверок: 4/15 разрешённых запросов; новые вызовы для изменения
марафона не требуются. Резервные копии исключены по решению владельца.

## Проверка координатора перед публикацией

Ниже исторический checkpoint `115a1f9`; актуальная публикация и последующая
проверка описаны в следующем разделе.

- Source `115a1f9`: immutable image
  `sha256:a77e8e85410f0baa7890c9c614c61e5d1823958c21e8dfe191c7d7ddfb727a80`,
  Node 24.18.0 / pnpm 11.14.0, общий build PASS, journal 21 entries до 0020.
- На этой сборке: 12 PostgreSQL suites, **75/75 PASS**, в отдельной
  `atlas_marathon_verify`; production DB не использовалась для fixture tests.
- Browser: captain open 14 days → participant join without code → reload
  membership persisted → captain closes → participant waiting → captain starts
  actual local 2026-10-01. Before start dates NULL, reports/tasks/baselines zero.
- Captain task published, participant completion rendered on the tasks podium.
  No paid provider calls, real captain not assigned, public marathon not created.
- Runtime guards PASS for anonymous/participant management, malformed UUID,
  start-before-close and joining after close. Actual HTTP close/start returned
  201 despite documented 200; fixed with explicit `HttpCode(200)`, two focused
  HTTP regressions RED→GREEN. This requires a fresh final image/recheck.
- Browser found the daily screen missing the marathon day number. Added a
  presentation-only counter from server-resolved calendar dates (not device
  timezone). First/second/final-day regressions RED→GREEN; web **180/180 PASS**,
  typecheck/lint and generated contract drift check PASS. Final build pending.

## Публикация и независимая проверка, 2026-10-01

### Актуальный checkpoint: f8eade4

Дополнение после ответа владельца: публичная non-AI проверка разрешена и
выполнена в браузере по HTTPS на существующем synthetic account. Login →
verify-email → штатное «Продолжить без AI» → Today:84.24 → update84.10 → reload.
Ровно одна weight row подтверждена SQL; original9 weights fingerprints совпали.
Пользователи14, ledger18, food analyses1 и consumptions1 также сохранили прежние
fingerprints. Marathon показывает «Набор ещё не открыт» без captain controls;
Food показывает выбор фото и private-confirmation workflow, без загрузки/AI.
Proof: `/tmp/rebody-public-weight-verified.png`,
`/tmp/rebody-public-marathon-waiting.png`, `/tmp/rebody-public-food-entry-verified.png`.
Это не публичный enrollment/start E2E: настоящий марафон ещё не создан.
Владелец предоставил email капитана; два read-only lookup подтверждают, что
matching account пока отсутствует. Её регистрацию/согласия/password не создаём
от её имени; allowlist остаётся пустым до появления точного user ID.

- Source `f8eade4c330d9d560eb8f6a52c40d457d39b2938`, полный Node24.18/pnpm11.14
  build PASS. Production API/worker/web используют image
  `sha256:c2a8a74dc2e9f1104d139d5fd2e050ec2636a141690f4c472aaf69c52a0a1d9c`.
  Protected env `marathon-csrf-final.env` сохраняет SMTP/GenAPI/private-photo
  настройки; legal versionsv4, bootstrapfalse, captain allowlist пуст.
- Migration0021 применена в checkpoint8630503, migration runner выполнен дважды;
  journal22. Все семь сервисов healthy, restartunless-stopped сохранён.
  PostgreSQL/Redis/MinIO не пересоздавались при финальном cutover. Postgres volume
  `atlas-rebody38-production_postgres-data` и private-photo volume
  `atlas-rebody38-production_food-images` сохранены. Host reboot не выполнялся.
- До/после обоих обновлений совпали fingerprints: users14, weights9, ledger18,
  food analyses1, consumptions1. Active chat/food operations0, public marathons0.
- Full API regression на8630503:152/152,30suites в отдельной PostgreSQL DB.
  После этого backend не менялся. Финальные UI source files (page и regression)
  проверены в Node24 image8630503 через read-only overlays:184/184,34files,
  typecheck/lint PASS. Полная финальная сборкаf8eade4 PASS.
- Read-only review проверил finale scope, reverse lock ordering, точность
  started_at до PostgreSQL microseconds и latest-CSRF sequence; нерешённых
  Critical/Important по этим изменениям не найдено.
- QA browser на финальном image: новый marathon day1/7 и выполненное задание
  соседствуют со старым финальным отчётом. Добавление «Хороший сон» сохранено;
  сообщение «Отчёт за вчера обновлён», reload сохраняет3/8 и новое completion.
  Доказательство: `/tmp/rebody-marathon-finale-csrf-verified.png`.
  Это synthetic isolated QA, не настоящий публичный марафон.
- После final cutover public trusted HTTPS readiness200; DNS A5.42.126.71;
  www301→apex, anonymous lobby401, unsigned private-object GET403.
  Terms/privacyv4 доступны по HTTPS;
  protected non-AI browser smoke принят в дополнении выше.
  Настоящий капитан ещё не назначен: предоставленный email пока не зарегистрирован.
  Набор/первый день запускает он; fixture не переносится в production.
- Main/stable не изменены; GenAPI4/15, новых платных вызовов0; S3/backups вне scope.

### Исторический checkpoint: 38ef5dc

- `38ef5dc` опубликован в существующий production Compose project; API/worker/web
  используют immutable image
  `sha256:8e603107051a2a0470c619905fca6e6791d716c1dd3b2227df9c07d3af69b9cb`.
  Миграции до 0020 применены, повторный запуск миграций PASS. Все семь сервисов
  healthy; restart policies сохранены. Реальный reboot не выполнялся.
- Перед/после обновления совпали counts и fingerprints всех существующих
  пользователей, весов, ledger, food analyses и confirmed consumptions.
  Data volumes PostgreSQL и приватных фото сохранены. Публичный марафон и
  настоящий капитан не создавались.
- На чистой изолированной БД final image прошёл 146 API tests / 29 suites;
  web180/180 на Node24. Test identity versions/origin и timezone задавались
  согласно test baseline, а не production consent/origin.
- Runtime/browser подтверждают close/start HTTP200, сохранение участия,
  отдельный первый день, выполнение задания и daily weight update84.24→84.10
  без изменения уже захваченного baseline84.24. Платных вызовов нет.
- Mobile fix `576c3ed` собран в image
  `sha256:9cc5689b65380eb634a3aec6c958ecdb6e087349585f48a7b7c192a3ba43f72c`:
  Node24 build PASS, web181/181. Browser QA320/393px: пять ссылок, подписи
  внутри своих ячеек, нет горизонтального overflow; targets55px. Это кандидат,
  production всё ещё38ef5dc.
- Независимый read-only review выявил Important: final-day wellness form
  недоступна на endsOn+1, хотя write endpoint принимает этот report; pre-start
  same-day weight ошибочно становится baseline public enrollment. Исправления
  назначены backend/frontend в отдельных ветках, новая миграция только additive;
  применённая0020 не переписывается. До их проверки выпуск не принят полностью.
- Публичный synthetic account создан штатно, вход дошёл до verify-email.
  Продолжение browser non-AI проверки ждёт разрешения владельца на штатную
  кнопку «Продолжить без AI»; подтверждение email/AI guards не обходятся.
- Email зарегистрированного настоящего капитана пока не предоставлен;
  production bootstrap выключен. S3/backups вне scope; GenAPI использовано4/15.
