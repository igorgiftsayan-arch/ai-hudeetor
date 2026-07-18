# Реестр аналитических событий

Новые события запрещены без изменения этого реестра. Общие параметры всех событий: `event_id`, `occurred_at`, `schema_version`, `user_id` либо `anonymous_id`, `session_id` (если применимо).

| Событие | Где возникает | Когда отправляется | Обязательные параметры помимо общих | Источник |
|---|---|---|---|---|
| `onboarding_started` | первый экран онбординга | экран показан впервые в сессии | `entry_point` | frontend |
| `onboarding_step_completed` | шаг онбординга | шаг успешно принят | `step_id`, `step_index` | frontend |
| `onboarding_completed` | завершение онбординга | backend сохранил завершение | `persona_id` | backend |
| `ai_persona_selected` | настройки AI | выбор сохранён | `persona_id`, `context` | backend |
| `first_weight_added` | журнал веса | первая запись подтверждена | `entry_id`, `source` | backend |
| `weight_added` | журнал веса | любая запись подтверждена | `entry_id`, `source`, `is_first` | backend |
| `morning_checkin_completed` | утренний чек-ин | запись сохранена | `checkin_id`, `local_date` | backend |
| `evening_checkin_completed` | вечерний чек-ин | запись сохранена | `checkin_id`, `local_date` | backend |
| `ai_scenario_opened` | экран AI-сценария | сценарий показан | `scenario_id`, `entry_point` | frontend |
| `ai_request_sent` | AI-оркестратор | запрос принят и резерв создан | `action_id`, `scenario_id`, `price_tokens` | backend |
| `ai_response_success` | AI-оркестратор | результат сохранён, резерв подтверждён | `action_id`, `scenario_id`, `latency_ms` | backend |
| `ai_response_error` | AI-оркестратор | техническая ошибка зафиксирована и резерв возвращён | `action_id`, `scenario_id`, `error_class`, `tokens_refunded` | backend |
| `tokens_spent` | токенный кошелёк | резерв подтверждён | `transaction_id`, `action_id`, `amount`, `balance_after` | backend |
| `response_liked` | оценка AI | лайк сохранён | `message_id`, `scenario_id` | backend |
| `response_disliked` | оценка AI | дизлайк сохранён | `message_id`, `scenario_id` | backend |
| `feedback_submitted` | форма feedback | feedback сохранён | `target_type`, `target_id`, `feedback_category` | backend |
| `food_photo_uploaded` | загрузка блюда | приватная загрузка завершена | `image_id`, `mime_type`, `size_bucket` | backend |
| `food_analysis_completed` | анализ блюда | результат сохранён | `analysis_id`, `action_id`, `result_status` | backend |
| `product_scan_completed` | разбор продукта | результат сохранён | `analysis_id`, `action_id`, `input_type`, `result_status` | backend |
| `menu_created` | план меню | меню сохранено | `menu_id`, `period_days`, `items_count` | backend |
| `meal_rejected` | предложение/меню | отказ сохранён | `meal_id`, `context`, `reason_code` | backend |
| `shopping_list_created` | список покупок | список сохранён | `list_id`, `items_count`, `people_count` | backend |
| `people_count_changed` | список покупок | пересчёт сохранён | `list_id`, `from_count`, `to_count` | backend |
| `shopping_list_shared` | действие «поделиться» | системный share вызван | `list_id`, `share_channel` | frontend |
| `starter_tokens_added` | кошелёк | однократное начисление подтверждено | `transaction_id`, `amount`, `balance_after` | backend |
| `balance_low` | кошелёк | подтверждённое изменение пересекло настроенный порог вниз | `balance_after`, `threshold` | backend |
| `balance_empty` | кошелёк | подтверждённый баланс впервые стал 0 после ненулевого | `balance_after`, `trigger` | backend |
| `topup_opened` | экран пополнения | экран показан | `entry_point`, `balance` | frontend |
| `payment_completed` | платёжный webhook | платёж проверен и начисление подтверждено | `payment_id`, `product_id`, `tokens_added` | backend |
| `free_tokens_requested` | запрос токенов | запрос сохранён | `request_id`, `reason_code` | backend |
| `referral_link_shared` | реферальный экран | системный share вызван | `share_channel` | frontend |
| `referred_user_registered` | регистрация | валидная связь приглашения сохранена | `referral_id`, `inviter_id` | backend |
| `referral_threshold_completed` | реферальный расчёт | все условия впервые выполнены | `referral_id`, `days_active`, `weight_entries`, `ai_uses` | backend |
| `referral_reward_granted` | кошелёк/реферал | обе награды подтверждены | `referral_id`, `amount_each`, `inviter_transaction_id`, `invitee_transaction_id` | backend |

`persona_id`, `scenario_id`, `reason_code`, `error_class`, `entry_point`, `input_type` и `share_channel` используют закрытые словари, которые должны быть описаны вместе с реализацией. Значения пользовательского веса, тексты AI и feedback не являются параметрами событий.
