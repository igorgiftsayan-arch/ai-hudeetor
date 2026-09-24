# ADR-012 — Удаляемое содержимое и сохраняемые метаданные terminal food analysis

- **Дата:** 2026-09-24
- **Статус:** решение для ограниченного terminal-delete инкремента; runtime acceptance отдельно.

## Контекст и граница

Политика данных разрешает отдельное удаление фотографии (активное объектное хранилище и производные в течение24часов после запроса) и структурированного анализа. Ledger и подтверждённый пользователем факт употребления имеют самостоятельные сроки хранения. Запросы queued/processing/outcomeUnknown не отменяются этим инкрементом: политика добровольной отмены и возврата ещё не определена.

Request receipt нужен для неизменяемого воспроизведения незавершённой операции, но содержит объектный ключ/контекст пользователя. После terminal-исхода и явного удаления анализа этот payload больше не нужен для reconciliation и не должен бессрочно удерживать удалённый контент.

## Решение

- Две независимые owner-scoped команды: DELETE `/food-analyses/:id/photo` и DELETE `/food-analyses/:id`. Никакого каскада между ними. Обе требуют Idempotency-Key и terminal analyzed/technicalError; нет доступа —404, операция не terminal —409 `FOOD_ANALYSIS_NOT_TERMINAL`.
- Обе возвращают202 и безопасное состояние `{analysisId, photoStatus: available|pending|deleted, analysisStatus: available|deleted}`. GET `/food-analyses/:id/deletion-status` доступен владельцу после tombstone, не содержит результата или ключей хранилища.
- Удаление анализа: атомарно ставится deleted_at, очищаются recognized_result/suitability_result/user_correction и content-bearing receipt.request_payload. Исходный terminal status/time, opaque request hash, provider/model/reference, submission outcome и ledger не меняются. request_payload становится nullable только вместе с content_deleted_at; DB guard запрещает подмену снимка и разрешает только необратимое удаление после terminal tombstone. Нет удаления или возобновления pending receipt.
- Content-bearing idempotency responses, связанные с удалённым analysis, очищаются до contentDeleted marker. Старый key/hash остаётся для конфликтов/idempotency, но replay возвращает410 `FOOD_CONTENT_DELETED`, не старое содержимое. Подтверждённый consumption читается/редактируется отдельно как самостоятельная запись пользователя; deletion анализа не удаляет эту запись.
- Удаление фото: немедленный logical tombstone uploaded_images.deleted_at, durable cleanup с теми же immutable original/staging targets и отдельным основанием userRequest. Job доступен сразу, deadline —не позже24часов от первого запроса; retry/restart сохраняются. Безопасность истечения ранее выданного upload URL остаётся обязательной. pending означает запрос принят, а не доказанное физическое удаление. После успешных DeleteObject image status=deleted.
- Расширение cleanup не меняет30-дневную автоматическую retention-политику. UserRequest не требует30-дневного возраста, но требует terminal analysis, не обходит owner/availability guards. Старый processing cleanup lease не отменяется новой командой.

## Инварианты и ограничения

Неизменяемость financial/reconciliation metadata и ledger сохраняется; удаляемый content payload —отдельная часть receipt. Удалённый payload нельзя восстановить или заменить повторным job/API вызовом. Параллельные delete/confirm/update защищены единым per-user food advisory transaction lock до idempotency/analysis locks. Cleanup берёт job → image; photo-команда соблюдает тот же порядок и не сбрасывает live lease. Повтор delete возвращает текущее безопасное состояние (pending может стать deleted). После логического удаления новые подтверждения анализа запрещены; существующая consumption сохраняется.

Удаление из внешнего AI-провайдера не реализовано и не обещается. Backup/юридические исключения не меняются. Нетерминальные анализы, never-analyzed upload deletion и account-wide deletion остаются вне этого bounded инкремента. Нужны отдельные runtime/physical storage проверки: unit/PostgreSQL tests не доказывают выполнение24-часового SLA на недоступном стенде.
