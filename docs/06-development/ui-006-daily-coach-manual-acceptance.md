# UI-006 — ручная приёмка Daily Coach

## Предусловия

- изолированная topology использует точный verification commit ветки
  `ui/ui-006-daily-coach`, построенной от AI-003;
- migrations `0000–0011` уже применены и повторно выполнены штатным runner;
- есть совершеннолетний test user с completed onboarding, timezone и сессией;
- наружу опубликован только gateway/web port Compose project
  `atlas-daily-coach`; API, worker, PostgreSQL и Redis host ports не имеют;
- проверка выполняется на mobile и desktop viewport.

## Основной сценарий

1. Войти через `/login` завершённым test user и открыть `/today`.
2. Подтвердить, что первым остаётся вес: последний вес, быстрая запись и график
   с историей работают как прежде.
3. Между записью веса и историей увидеть блок «На сегодня» со спокойным стартом
   и кнопкой «Начать день».
4. Нажать кнопку и подтвердить disabled state «Начинаем…», затем server-confirmed
   сообщение «День начат» и состояние «День идёт» с кнопкой «Завершить день».
5. Завершить день, подтвердить «Завершаем…», затем «День завершён» и terminal
   состояние «На сегодня достаточно» без дальнейшего действия.
6. Reload `/today`: terminal state остаётся server-sourced. Вес, график, история,
   навигация «Сегодня»/«AI» и `/quick-reply` остаются доступны.

## Негативные сценарии

1. Потерять сеть на transition, восстановить и нажать «Повторить»: запрос
   повторяет тот же `Idempotency-Key` и не создаёт второй effect.
2. Выполнить transition из другой сессии, затем нажать старую кнопку: `404` или
   `409 DAILY_STATE_TRANSITION_INVALID` показывают спокойное предложение
   обновить сценарий, без ложного успеха.
3. Просрочить session перед transition: браузер направляется на `/login`.
4. Сделать daily-state GET недоступным: блок сообщает, что сценарий временно
   недоступен, но вес и история остаются рабочими.

## Definition of Done applicability

- Код, web tests, API contract/client drift и browser acceptance: применимо.
- Миграции и backend logic: N/A для UI-006; используются уже проверенные AI-003
  migration `0011_ai_003_daily_coach.sql` и REST contract.
- Analytics: N/A — новых frontend events нет в утверждённом реестре.
- AI provider, prompts, Character, scheduler, push и AI-004: N/A — не входят
  в UI-006.
