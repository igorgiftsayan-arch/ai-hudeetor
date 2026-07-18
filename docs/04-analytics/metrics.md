# Метрики

| Метрика | Определение |
|---|---|
| Onboarding completion | пользователи с `onboarding_completed` / уникальные пользователи с `onboarding_started` за когорту |
| Activation | доля завершивших онбординг, добавивших вес и получивших успешный AI-ответ в первые 7 дней |
| D1/D7/D30 retention | доля когорты регистрации с любым ключевым backend-событием в соответствующий день/окно |
| Check-in WAU | уникальные пользователи с завершённым чек-ином / WAU |
| AI success rate | `ai_response_success` / (`ai_response_success` + `ai_response_error`) |
| AI approval | лайки / (лайки + дизлайки), отдельно по персоне и сценарию |
| Token payer conversion | пользователи с `payment_completed` / пользователи, открывшие пополнение |
| Referral qualification | `referral_threshold_completed` / `referred_user_registered` |
| Referral reward integrity | награды без дублей; целевое значение 100% корректных пар |

Точные определения «ключевого события», календарных окон, тестовых/админских аккаунтов и аналитической платформы требуется утвердить до построения дашбордов. Денежные метрики вводятся после определения платёжной модели.
