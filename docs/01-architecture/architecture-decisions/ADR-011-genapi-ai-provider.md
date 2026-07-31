# ADR-011 — GenAPI как первый внешний AI-провайдер

- **Статус:** принято для AI-001
- **Дата:** 2026-07-31

## Решение

Provider-neutral `AiProviderAdapter` поддерживает `fake` и `genapi`; выбор выполняется только через `AI_PROVIDER`. GenAPI вызывается в OpenAI-compatible формате, а ключ, base URL и модель поступают исключительно из `GENAPI_API_KEY`, `GENAPI_BASE_URL` и `GENAPI_MODEL`.

Fake adapter сохраняется для automated/stable smoke. GenAPI разрешён только synthetic test-пользователю с сохранённым `aiProviderProcessing`; до отдельного consent-flow реальные пользователи не переводятся на внешний provider.

## Границы

- Adapter не владеет токенами, ценой, consent или operation lifecycle.
- Повтор допустим один раз только при подтверждённой ошибке установления соединения.
- Timeout после возможного принятия запроса даёт `outcomeUnknown`; подтверждённые HTTP/provider errors и невалидный ответ дают `technicalError` и refund.
- Technical log не содержит API key, prompt, пользовательский текст, полный ответ или raw provider error.
- Provider-reported cost сохраняется только при наличии в ответе; приложение не выдумывает стоимость.

## Отложено

Пользовательский provider-consent flow и reconciliation `outcomeUnknown` выполняются отдельными задачами.
