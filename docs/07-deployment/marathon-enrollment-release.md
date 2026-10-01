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
- Вес до старта не становится baseline; обновление веса в первый день baseline
  не переписывает. Данные прежнего release не теряются.
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
Исправление food labels `462da6d` включено как `7e950a2`; новое приложение ещё
не опубликовано. Public runtime пока предыдущий GERBI release, main не меняется.

Food E2E предыдущего выпуска уже прошёл на synthetic photo, one paid call.
Общий журнал проверок: 4/15 разрешённых запросов; новые вызовы для изменения
марафона не требуются. Резервные копии исключены по решению владельца.

## Проверка координатора перед публикацией

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
