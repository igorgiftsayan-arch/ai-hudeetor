# Воронки

## Активация

`onboarding_started` → последовательные `onboarding_step_completed` → `onboarding_completed` → `first_weight_added` → первый `ai_response_success`.

## Ежедневная ценность

Утренний или вечерний чек-ин → `ai_scenario_opened` → `ai_request_sent` → `ai_response_success` → лайк/дизлайк или feedback.

## Питание

`food_photo_uploaded` → `food_analysis_completed`; либо `menu_created` → `shopping_list_created` → `people_count_changed`/`shopping_list_shared`.

## Монетизация токенов

`balance_low`/`balance_empty` → `topup_opened` → `payment_completed`.

## Реферал

`referral_link_shared` → `referred_user_registered` → `referral_threshold_completed` → `referral_reward_granted`.

Окна и сегменты фиксируются в [metrics.md](metrics.md); события берутся только из [реестра](event-registry.md).
