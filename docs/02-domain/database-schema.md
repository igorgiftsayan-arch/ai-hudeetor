# Концептуальная схема базы данных

PostgreSQL — источник истины для структурированных данных. Физическая схема и имена таблиц будут определены миграциями после архитектурного каркаса.

## Группы данных

- Identity/profile: User, UserProfile, NutritionProfile, AiPreference, NotificationPreference.
- Tracking: WeightEntry, BodyMeasurement, DailyCheckin, ActivityEntry.
- AI: AiConversation, AiMessage, AiMemory, AiFeedback.
- Food: UploadedImage metadata, FoodAnalysis, ProductAnalysis, MealSuggestion, MenuPlan/Item, ShoppingList/Item.
- Economy: TokenWallet, append-only TokenTransaction, AiActionPrice.
- Growth/content: Referral, ReferralProgress, ContentItem.
- Operations: admin audit log and event delivery records, точные модели уточняются архитектурой и не являются новой продуктовой функцией.

## Обязательные ограничения

- Уникальный кошелёк на пользователя; баланс `>= 0`.
- Стартовое начисление и реферальная награда идемпотентны и однократны.
- У приглашённого не более одного пригласившего; самоссылка запрещена.
- Токенные проводки и изменение баланса атомарны.
- Внешние запросы получают идемпотентные ключи там, где повтор опасен.
- Все изменения схемы — только миграциями вперёд с проверенным откатом/восстановлением.

Сроки хранения и удаление описаны в [privacy-and-data.md](../05-security/privacy-and-data.md).
