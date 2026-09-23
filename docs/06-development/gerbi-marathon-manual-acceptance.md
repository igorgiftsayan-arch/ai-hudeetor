# Герби-Марафон — ручная приёмка backend-пилота

## Предусловия

- отдельная test topology собрана из точного commit ветки;
- migration image содержит `0012_gerbi_marathon_pilot.sql`, migrations применены дважды;
- synthetic captain входит в `MARATHON_BOOTSTRAP_USER_IDS`, bootstrap включён только в test runtime;
- synthetic participant имеет тот же IANA timezone, что и марафон;
- API и worker используют одинаковые `AI_PROVIDER` и `IDENTITY_AI_PROVIDER_PROCESSING_VERSION`;
- для real-provider проверки используются только synthetic accounts и защищённый server env.

## Сценарий марафона

1. Зарегистрировать captain и participant, завершить onboarding и добавить дневной вес.
2. Captain создаёт marathon/team; сохранить join code вне логов и документации.
3. Participant присоединяется по коду; повтор с тем же idempotency key не создаёт вторую membership.
4. Оба пользователя читают `marathons/current`; пользователь без membership получает штатный `404 MARATHON_NOT_FOUND`.
5. Participant читает отчёт за вчера как `unknown`, сохраняет восемь отметок и после reload получает `reported` с тем же `markedCount`.
6. В первый день марафона отчёт за вчера возвращает `notApplicable`; отчёт за последний день допускается следующим утром.
7. Captain создаёт дневное задание. Participant отмечает выполнение и после reload видит `completed`.
8. Добавить точные дневные веса вчера/сегодня: `dailyPercent` равен `(вчера − сегодня) / вчера × 100%`; при отсутствии любой даты остаётся `unknown`, более старая запись не используется.
9. Проверить team today: только участники своей команды, nullable display name, wellness `0..8`, self-reported task completion и до трёх podium groups. Равные результаты находятся в одной группе общего места; отсутствуют raw weight, chat, memory и cumulative totals.
10. Проверить, что baseline равен первой записи внутри периода марафона и не меняется после обычного исправления веса за этот день.
11. Повторить mutation requests с тем же key/payload и затем с тем же key/другим payload: business effect не дублируется, изменённый payload получает `409`.

## Real-provider сценарий

1. Убедиться, что до consent quick reply отклоняется без provider request и без списания.
2. Прочитать configured disclosure/version, сохранить consent текущей версии.
3. Отправить два последовательных сообщения через browser UI; обе операции должны завершиться `succeeded`, ledger — одной reservation/confirmation на операцию.
4. Подтвердить, что второй provider request получил history и построенный bounded memory context, не раскрывая его содержимое в логах или отчёте.
5. Проверить trace/request IDs, usage/latency и wallet balance; API key, prompt, response, raw provider error и private memory в обычных logs/outbox отсутствуют.

## После проверки

- отключить/удалить изолированный real-provider runtime env;
- stable `atlas-v01` оставить без изменений;
- зафиксировать точный branch/commit/image, результаты migrations, PostgreSQL/regression/browser проверок и все `TBD`.
