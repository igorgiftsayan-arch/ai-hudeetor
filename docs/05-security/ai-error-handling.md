# Обработка ошибок AI

## Классификация

Каждое начатое AI-действие завершается ровно одним terminal-статусом: `success` или `technical_error`. Пользовательская оценка качества хранится отдельно и не меняет terminal-статус.

### Техническая ошибка

Система не смогла получить или сохранить пригодный результат по технической причине: недоступность/ошибка API модели, timeout после разрешённых повторов, ошибка загрузки или чтения изображения, внутренний сбой, повреждённый ответ, который невозможно безопасно обработать.

Результат:

- полный токенный резерв возвращается автоматически и идемпотентно;
- пользователю показывается безопасное сообщение с возможностью повторить;
- backend отправляет `ai_response_error` с классом ошибки без чувствительных данных;
- частичный или непригодный результат не выдаётся как успешный.

### Бизнес-неуспех

Технически корректный результат сохранён и показан, но пользователь считает его слабым, бесполезным или неверным; сюда относится неверное распознавание, если система сформировала допустимый результат без технического сбоя.

Результат:

- зарезервированные токены подтверждаются как расход и автоматически не возвращаются;
- пользователь может поставить дизлайк и отправить feedback;
- качество анализируется по `response_disliked`, `feedback_submitted` и result status профильного события;
- администратор может выдать ручную компенсацию с причиной и аудитом, но это не меняет классификацию исходного действия.

## Граница решения

Backend-код, а не frontend или текст провайдера, присваивает terminal-статус. Повтор с тем же идемпотентным ключом не создаёт новое списание или возврат. Ошибки безопасности и модерации, при которых безопасный ответ не может быть показан, классифицируются технически для экономики токенов и не раскрывают детали пользователю.

Правила резерва описаны в [token-economics-model.md](../02-domain/token-economics-model.md), формат API — в [error-format.md](../03-api/error-format.md).

## Owner decision 2026-09-25: five-minute project-funded compensation

If no usable result is recovered within five minutes from durable server request
acceptance (operation creation in the reservation transaction), refund the entire
reservation exactly once at the project's expense, even if the provider accepted
and charged for the request. Applies equally to chat, food and pre-ID unknown.
Retries/restarts do not extend this deadline. No blind provider resubmission.

The DB clock decides eligibility; the automatic sweep may apply the refund on
its next bounded pass. Submission/finalization boundaries enforce the same rule.
The compensation reason is recoveryDeadlineExceeded, not evidence that the
provider failed or did not charge. Keep provider receipt identity/cost evidence.
After compensation a late result cannot debit the user or create another refund.
Successful terminal operations already committed before expiry remain charged.
