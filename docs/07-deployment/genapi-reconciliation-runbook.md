# GenAPI outcome reconciliation — operator runbook

Этот runbook относится только к ручному восстановлению конкретной AI-operation
в состоянии `outcomeUnknown`, когда оператор уже получил подтверждённый GenAPI
`request_id`. Он не разрешает повторно отправлять provider request и не является
автоматической recovery policy.

## Предварительная проверка

1. Работать из проверенного checkout, содержащего
   `apps/worker/src/reconcile-genapi-operation.ts` (минимум commit `a621aacc`).
2. Read-only запросом подтвердить:
   - operation имеет ожидаемый ID и статус `outcomeUnknown` (либо уже
     `succeeded` с тем же provider request ID для safe replay);
   - существует ровно одна `aiReservation`;
   - отсутствуют `aiConfirmation` и `aiRefund`;
   - provider request ID относится именно к этой operation.
3. Не выводить в консоль значения `DATABASE_URL`, `GENAPI_API_KEY` и содержимое
   сообщений. Использовать существующий root-only runtime env-файл.

Инструмент требует следующие имена переменных:

- `DATABASE_URL`;
- `AI_PROVIDER=genapi`;
- `GENAPI_API_KEY`;
- `GENAPI_BASE_URL`;
- `GENAPI_MODEL`;
- `REDIS_URL` и остальные обязательные worker config variables;
- `GENAPI_RECONCILIATION_BASE_URL` — API, содержащий
  `/request/get/{request_id}`;
- `RECONCILE_OPERATION_ID`;
- `RECONCILE_PROVIDER_REQUEST_ID`.

## Запуск

Из уже собранного worker image или совместимого checkout:

```bash
pnpm --filter @atlas/worker reconcile:genapi
```

Перед транзакционной записью инструмент делает read-only lookup результата и
строго сверяет request ID, provider/model, полный упорядоченный набор messages и
временное окно результата. При несовпадении он завершается с ненулевым кодом и
событием `ai_outcome_reconciliation_failed`; ledger, messages и operation не
изменяются.

Успешный первый запуск печатает безопасный JSON с событием
`ai_outcome_reconciliation`, `operationId`, `providerRequestId`,
`status: "succeeded"` и `replay: false`. Транзакция создаёт ровно один assistant
message, одну `aiConfirmation` и audit/outbox markers. Повтор с теми же ID
возвращает `replay: true` без второго сообщения или финансового эффекта.

## Проверка после записи

Read-only запросами подтвердить:

- operation `succeeded` и содержит ожидаемый provider reference;
- по operation существует одна reservation и одна confirmation, refund нет;
- assistant message ровно один;
- `ai-companion.outcome_reconciled.v1` и memory-extraction event существуют по
  одному;
- повтор команды возвращает `replay: true` и не меняет эти количества.

## Ограничение текущего инструмента

Для строгой сверки request инструмент заново строит persona/profile/weight/memory
context из **текущего** состояния БД и историю разговора до исходного user
message. Если persona, профиль, вес или активная память изменились после submit,
восстановленный payload может отличаться от provider record, и инструмент обязан
отказать с `GenAPI request parameters mismatch`. Поэтому runbook не обещает
универсальное восстановление старых операций. Для него потребуется сохранённый
immutable request snapshot/hash; автоматический recovery и pre-request-ID
ambiguity остаются отдельными решениями.
