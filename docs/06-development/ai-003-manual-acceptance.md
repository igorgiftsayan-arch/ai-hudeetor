# AI-003 — ручная приёмка Daily Coach backend

## Предусловия

- Изолированная topology использует ветку `back/ai-003-daily-coach`.
- Migrations `0000–0011` применены дважды штатным Drizzle runner.
- Тестовый пользователь завершил onboarding, имеет IANA timezone, persona,
  дневную запись веса и один безопасный активный memory fact.
- API доступен только внутри изолированного test runtime; stable проекты не
  изменяются.

## Сценарий

1. Вызвать `GET /api/v1/ai-daily-states/today` с session cookie.
2. Параллельно повторить GET восемь раз.
3. Подтвердить один state ID, локальную дату пользователя и `notStarted`.
4. Проверить structured context: только реально существующие profile/weight/
   active memory values; нет prompt string или технических IDs.
5. Выполнить `POST /api/v1/ai-daily-states/{id}/transitions` в `inProgress` с
   Origin, CSRF и новым `Idempotency-Key`.
6. Повторить тот же запрос с тем же key и payload; подтвердить тот же business
   result без второго эффекта.
7. Повторить key с `targetStatus=completed`; ожидать `409
   IDEMPOTENCY_KEY_REUSED`.
8. Выполнить `completed` с новым key; повторить same-state с третьим key и
   подтвердить безопасный no-op.
9. Попытаться выполнить backward/skip transition и изменить чужой state;
   ожидать соответственно `409` и owner-safe `404`.
10. Проверить PostgreSQL: одна строка на `(user_id, local_date)`, согласованные
    timestamps и completed idempotency records.
11. Проверить обычные API logs: daily context, memory values, имя и вес не
    выводятся; outbox/analytics AI-003 события отсутствуют.

## Готовность

- API health остаётся healthy.
- Fake/GenAPI provider configuration и AI-001/AI-002 contracts не изменены.
- Frontend routes/build artifacts не менялись, кроме штатного generated API
  client.
- `atlas-v01` и `atlas-ui-001` не пересобирались и не пересоздавались.

