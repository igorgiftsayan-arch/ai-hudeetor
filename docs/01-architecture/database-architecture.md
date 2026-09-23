# Архитектура данных

PostgreSQL — источник бизнес-истины по [ADR-005](architecture-decisions/ADR-005-database.md). Физические поля вводятся feature-миграциями, не этим документом.

## Основные таблицы по группам

- Identity: users, credentials/identity bindings, sessions, roles, permissions.
- Profile/tracking: user_profiles, nutrition_profiles, ai_preferences, weight_entries, body_measurements, daily_checkins, activity_entries. `weight_entries` сохраняет audit-safe historical rows, но partial unique index допускает только одну `is_current=true` запись на `(user_id, local_date)`; `local_date` вычисляется по timezone профиля при сохранении.
- AI: ai_conversations, ai_messages, ai_memories, ai_memory_extractions, ai_daily_states, ai_operations, prompt_versions, ai_feedback, ai_usage_records. `ai_daily_states` допускает одну строку на owner-local date и защищает state/timestamp invariants PostgreSQL constraints.
- Food/planning/files: uploaded_images, food_analyses, product_analyses, meal_suggestions, menu_plans/items, shopping_lists/items.
- Economy: token_wallets, token_transactions, ai_action_prices, payments, payment_events.
- Referrals/content: referrals, referral_progress, referral_rewards, content_items, notification_preferences.
- Platform: admin_audit_log, outbox_messages, job_executions, analytics_events.
- Marathon pilot: marathons, marathon_teams, marathon_memberships, marathon_wellness_reports, marathon_captain_tasks, marathon_task_completions. Одна membership пользователя на marathon, один captain на team, один wellness report на membership/date, одно задание на team/date и один completion на membership/task защищены PostgreSQL constraints. Additive migration `0013` атомарно фиксирует baseline в membership при первой записи веса внутри периода либо при вступлении с уже существующей записью; обычный daily upsert его не меняет. Дневной процент использует только точные current weight rows вчера/сегодня; podium группирует равные значения без сохранения отдельной накопленной таблицы.

## Критические связи и индексы

Каждый пользовательский объект имеет owner. Уникальны wallet/user, invitee/referral, business/idempotency keys, provider event и reward. Критические индексы покрывают owner+time, conversation+sequence, wallet+time, operation key, payment reference/status, referral participants/status, outbox/job status+available time, audit actor/target+time и file owner+retention status.

Марафонные записи всегда разрешаются через membership текущего пользователя. Командный read model строится в PostgreSQL, но выдаёт только дневные производные данные; raw weight, chat, memory и накопленные итоги через него не читаются. Pilot требует совпадения IANA timezone профиля и марафона, чтобы user-local daily weight не пересекал две marathon-local даты.

Naming: таблицы/колонки snake_case, таблицы множественные, FK `<entity>_id`, `idx_*`, `uq_*`. Constraints обеспечивают неотрицательные integer balance/reserve, однократность и допустимые transitions.

## История и удаление

Ledger, audit и outbox append-only. Soft delete не применяется глобально. Account deletion — идемпотентный workflow: revoke sessions, delete/anonymize PII/AI/files/analytics links, сохранить только допустимый финансовый/audit минимум. Retention следует [privacy policy](../05-security/privacy-and-data-policy.md).

## Миграции/backup

Только `database/migrations`; runtime auto-migrate запрещён. Expand/backfill/contract для несовместимых изменений. Перед риском — backup; rollback приложения отделён от data restore.
