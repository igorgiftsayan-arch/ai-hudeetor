# AI-002 — долговременная память AI-компаньона

## Статус и границы

- Статус: approved for implementation.
- База: `AI-001` commit `4f823f8300fd3aace4b9f715fb3fe335e40fd53e`.
- Ветка реализации: `back/ai-002-companion-memory`.
- `main` не изменяется; merge выполняется только после отдельной приёмки.
- В задачу не входят frontend памяти, GenAPI extractor, vector database, ручное редактирование фактов и хранение полной переписки как памяти.

## Цель

AI-компаньон получает компактный, управляемый и воспроизводимый долговременный контекст. Контекст состоит из актуальных системных данных приложения и ограниченного набора устойчивых пользовательских фактов. Память не заменяет историю разговора и не становится источником бизнес-истины для профиля или веса.

## Доменные границы

- `profiles` владеет `displayName`, `targetWeightKg`, timezone и AI preference.
- `tracking` остаётся источником первой и последней актуальной дневной записи веса.
- `ai-companion` владеет `AiMemory`, формированием memory context и extraction workflow.
- Worker исполняет асинхронную extraction-задачу; PostgreSQL остаётся источником истины.
- AI Gateway получает уже подготовленный системный контекст и не принимает решений о профиле, весе или хранении памяти.

## Данные

### Расширение `user_profiles`

- `display_name text null`;
- `target_weight_kg numeric(5,2) null`;
- `target_weight_kg`, если задан, находится в диапазоне `20.00–500.00`.

Отсутствующие значения не заменяются фиктивными и не включаются в AI context.

### `ai_memories`

| Поле | Назначение |
|---|---|
| `id uuid` | публичный opaque identifier |
| `user_id uuid` | владелец памяти |
| `category text` | закрытая категория |
| `key text` | стабильный канонический ключ факта |
| `value text` | компактное нормализованное значение |
| `source text` | `conversation`, `profile` или `system` |
| `confidence numeric(3,2)` | значение от `0.00` до `1.00` |
| `source_message_id uuid null` | идемпотентность extraction для сообщения |
| `created_at timestamptz` | время создания |
| `updated_at timestamptz` | время последнего подтверждения/изменения |
| `deleted_at timestamptz null` | мягкое удаление |

Категории:

```text
preference
restriction
trigger
supportStrategy
goal
communicationPreference
```

Ограничения:

- partial unique index `(user_id, category, key) WHERE deleted_at IS NULL`;
- owner foreign key с каскадным удалением аккаунта;
- `source_message_id` связывается с принадлежащим пользователю сообщением;
- confidence ограничен PostgreSQL check constraint;
- удалённая память не читается и не передаётся AI;
- пользовательские тексты, медицинские диагнозы и чувствительные данные не сохраняются как memory value.

### `ai_memory_extractions`

Durable receipt отделяет идемпотентность обработки сообщения от жизненного цикла созданных фактов:

| Поле | Назначение |
|---|---|
| `id uuid` | идентификатор extraction |
| `user_id uuid` | владелец source message |
| `source_message_id uuid` | обработанное пользовательское сообщение |
| `status text` | `completed` |
| `facts_written integer` | число созданных/обновлённых фактов |
| `created_at timestamptz` | время фиксации |

Unique constraint `(user_id, source_message_id)` гарантирует, что committed source message больше не извлекается повторно, даже если созданный факт позднее удалён пользователем. Receipt и все memory upsert-операции одного сообщения записываются в одной transaction. Старое сообщение, уже имеющее receipt, не может перезаписать более новый противоречащий факт.

## Profile contract

Существующий `PATCH /api/v1/users/me/profile` расширяется:

```json
{
  "timezone": "Asia/Irkutsk",
  "displayName": "Игорь",
  "targetWeightKg": 85.5
}
```

Правила:

- `displayName`: optional nullable, trim, NFC, 1–80 Unicode code points, plain text;
- `targetWeightKg`: optional nullable, `20.00–500.00`, максимум два знака после запятой;
- отсутствие поля сохраняет текущее значение;
- explicit `null` очищает значение;
- ответ профиля возвращает оба nullable-поля;
- frontend в AI-002 не изменяется.

## Memory API

### `GET /api/v1/ai-memory`

Возвращает только активную память текущего пользователя:

```json
{
  "items": [
    {
      "id": "uuid",
      "category": "preference",
      "key": "food.fish",
      "value": "не любит рыбу",
      "source": "conversation",
      "confidence": 0.9,
      "createdAt": "ISO-8601 UTC",
      "updatedAt": "ISO-8601 UTC"
    }
  ]
}
```

Порядок стабилен: category priority, затем `updatedAt DESC`, затем `id`.

### `DELETE /api/v1/ai-memory/{id}`

- authenticated session, CSRF и permitted Origin обязательны;
- owner-scoped lookup; чужой или неизвестный ID возвращает `404 RESOURCE_NOT_FOUND`;
- выполняет soft delete;
- повторное удаление не раскрывает существование ресурса и возвращает `404`;
- удалённый факт исключается из следующего provider request.

## Системный контекст

`MemoryContextBuilder` формирует отдельный блок системного prompt перед AI-запросом:

- timezone;
- `displayName`, только если задан;
- первая актуальная дневная запись веса как стартовый вес;
- последняя актуальная дневная запись веса как текущий вес;
- разница между первой и последней актуальными дневными записями;
- дата последней записи;
- `targetWeightKg`, только если задан;
- выбранная persona;
- до 12 активных пользовательских фактов.

История веса учитывает только строки `weight_entries.is_current = true`. Значения веса форматируются как decimal, а не вычисляются через floating-point источник истины.

Межмодульные данные передаются только через application query ports:

- `profiles` публикует owner-scoped snapshot профиля и AI preference;
- `tracking` публикует owner-scoped first/current daily-weight summary;
- `ai-companion` читает собственную активную память и компонует полученные DTO.

`ai-companion` не импортирует infrastructure/repositories других модулей и не читает их таблицы напрямую.

Лимит итогового memory context — 1600 Unicode code points. Приоритет категорий:

1. `restriction`;
2. `trigger`;
3. `communicationPreference`;
4. `supportStrategy`;
5. `goal`;
6. `preference`.

Внутри приоритета учитываются совпадение с ключевыми словами текущего запроса и свежесть `updated_at`. Технические ID, deleted facts и чувствительные данные не включаются. Понятие stale/expiry в AI-002 не вводится. Vector search не используется.

Лимит измеряется по Unicode code points (`Array.from(value)`), а не по UTF-16 code units; усечение не разрывает surrogate pair. Перед рендерингом context builder повторно применяет sensitive-data filter, поэтому даже некорректно импортированная active row с медицинским/секретным содержимым не попадёт provider-у.

## Extraction workflow

После успешной фиксации AI-ответа та же PostgreSQL transaction создаёт внутреннее outbox-событие:

```text
ai-companion.memory_extraction_requested.v1
```

Минимальный payload:

```json
{
  "userId": "uuid",
  "operationId": "uuid",
  "sourceMessageId": "uuid"
}
```

Payload не содержит prompt, user text, assistant response или provider error.

Outbox publisher ставит отдельную BullMQ job со stable `jobId = outboxId`. Extractor читает source message из PostgreSQL, проверяет ownership и обрабатывает только это новое пользовательское сообщение.

### Deterministic extractor

V0.1 extractor:

- использует явный набор безопасных устойчивых шаблонов;
- создаёт только факты закрытых категорий;
- игнорирует временные состояния, случайные фразы, диагнозы, лекарства и иные чувствительные сведения;
- нормализует факт в canonical `category + key + value`;
- не копирует полный текст сообщения;
- повтор source message и повтор job не создают дубликаты;
- совпадающий факт обновляет confidence/`updated_at`;
- противоположный факт с тем же canonical key заменяет active value;
- ошибка extractor фиксируется безопасной технической категорией и не меняет успешный AI operation, ledger или assistant message.

GenAPI и другие внешние provider-ы для extraction не вызываются.

### Нормативный allowlist V0.1

До сопоставления текст нормализуется NFC, trim, lowercase; повторные пробелы сворачиваются. Extractor рассматривает одно простое утверждение на предложение. Два закрытых exact communication-preference выражения (`не хочу жёсткого давления`, `говори короче`/`предпочитаю короткие ответы`) распознаются отдельно. Для всех placeholder-шаблонов sensitive/medical denylist применяется первым и отклоняет всё предложение независимо от allowlist.

После нормализации предложение токенизируется по Unicode letter/number boundaries; пунктуация считается разделителем. Denylist использует закрытые V0.1 token rules: `exact` совпадает с отдельным токеном, `prefix` — если отдельный токен начинается с указанной основы.

| Класс | Правило | Tokens V0.1 |
|---|---|---|
| диагнозы и заболевания | prefix | `диагноз`, `диабет`, `гипертон`, `онколог`, `анорекс`, `булим`, `депресс`, `тревожн`, `расстройств` |
| онкология | exact | `рак` |
| симптомы и состояния | prefix | `симптом`, `боль`, `болит`, `обморок`, `тошнот`, `рвот`, `головокруж`, `давлен` |
| лекарства и лечение | prefix | `лекарств`, `таблет`, `препарат`, `дозиров`, `инсулин`, `антидепресс`, `терап` |
| аллергии и непереносимость | prefix | `аллерг`, `непереносим` |
| беременность | prefix | `беремен`, `лактац`, `грудн` |
| secrets/документы | prefix | `парол`, `токен`, `секрет`, `паспорт` |
| платёжные данные | exact | `карта`, `cvv` |
| email | structural | любой токен/фрагмент с `@` |
| телефон/длинный идентификатор | structural | последовательность 7+ цифр после удаления `+`, пробелов, `-`, `(`, `)` |

Обязательные boundary cases:

- `я не люблю рыбу` → allow;
- `хочу больше гулять` → allow;
- `хочу снизить давление` → reject по prefix `давлен`;
- `мне помогают таблетки` → reject по prefix `таблет`;
- `не ем рыбу из-за аллергии` → reject всего предложения по prefix `аллерг`;
- `хочу восстановиться после беременности` → reject по prefix `беремен`;
- `люблю раков` → allow, потому что `рак` является exact-token rule;
- `мой email user@example.com` → reject по `@`;
- `мой код 1234567` → reject по последовательности цифр;
- sensitive token внутри любой allowlist-формы → reject до extraction.

Расширение denylist является изменением privacy contract и требует обновления этой таблицы и тестов, а не скрытого изменения extractor.

| Допустимая форма | Category | Canonical key | Canonical value | Confidence |
|---|---|---|---|---:|
| `я не люблю <еда>` / `не люблю <еда>` | `preference` | `food.<normalized-item>` | `не любит <еда>` | `0.90` |
| `я люблю <еда>` / `люблю <еда>` | `preference` | `food.<normalized-item>` | `любит <еда>` | `0.90` |
| `я не ем <еда>` / `не употребляю <еда>` | `restriction` | `food.<normalized-item>` | `не употребляет <еда>` | `0.95` |
| `вечером тянет на <еда>` | `trigger` | `craving.evening.<normalized-item>` | `вечером тянет на <еда>` | `0.90` |
| `по выходным сложно <действие>` | `trigger` | `routine.weekend.<normalized-action>` | `по выходным сложно <действие>` | `0.85` |
| `мне помогают <стратегия>` / `помогают <стратегия>` | `supportStrategy` | `support.<normalized-strategy>` | `помогает <стратегия>` | `0.90` |
| `моя цель — <цель>` / `хочу <цель>` | `goal` | `goal.<normalized-goal>` | `<цель>` | `0.80` |
| `не хочу жёсткого давления` | `communicationPreference` | `communication.pressure` | `предпочитает общение без жёсткого давления` | `0.95` |
| `говори короче` / `предпочитаю короткие ответы` | `communicationPreference` | `communication.length` | `предпочитает короткие ответы` | `0.95` |

Placeholder ограничен 2–60 Unicode code points, plain text, без числовых идентификаторов, URL, email, телефона и управляющих символов. Для food/strategy/action/goal используются lowercase NFC и дефисы вместо пробелов в key; value содержит только совпавший компактный фрагмент, не полное сообщение.

Противоречие определяется одинаковым canonical key:

- `не люблю рыбу` → `food.рыбу = не любит рыбу`;
- более новое `люблю рыбу` → тот же key получает `любит рыбу`;
- повтор того же значения только обновляет confidence/`updated_at`;
- receipt старого source message запрещает его повторное применение после нового факта.

Отклоняются:

- временные состояния: `сегодня грустно`, `сейчас хочу сладкое`, `вчера сорвался`;
- неопределённые фразы без allowlist: `рыба бывает норм`;
- любое совпадение закрытого denylist выше;
- адреса, email, телефоны, документы, платёжные и authentication secrets;
- утверждения о третьих лицах.

## Транзакции и идемпотентность

- AI success transaction и запись extraction outbox согласованы атомарно.
- Memory upsert выполняется отдельной короткой PostgreSQL transaction.
- Unique constraints являются последней защитой от повторной доставки.
- Идемпотентность extraction опирается на `source_message_id` и canonical active fact key.
- Committed receipt `(user_id, source_message_id)` делает любой replay no-op, в том числе после soft delete факта.
- Ошибка extraction допускает retry/dead-letter, но не откатывает уже выданный AI-ответ и не создаёт токенных эффектов.
- Redis/BullMQ не являются источником состояния памяти.

## Privacy и безопасность

- Внешний AI по-прежнему требует `aiProviderProcessing`; AI-002 не создаёт consent UI.
- Память хранится в PostgreSQL проекта.
- API доступен только владельцу.
- Soft delete немедленно исключает факт из read model и AI context.
- API keys, provider metadata, cookies, технические ID, raw provider errors и полный текст сообщений не сохраняются в памяти.
- Prompt, memory context и response не попадают в обычные infrastructure logs, analytics и outbox payload.
- Перед production остаётся обязательной юридическая проверка privacy policy.

## Тестирование

Обязательные проверки:

1. Реальные системные данные входят в context; отсутствующие поля пропускаются.
2. Текущий вес берётся из последней актуальной дневной записи.
3. Устойчивый факт создаётся.
4. Повтор факта не создаёт дубль.
5. Противоречащее предпочтение обновляет active fact.
6. Случайная или чувствительная фраза игнорируется.
7. Удалённая память не передаётся AI.
8. Чужая память недоступна для чтения и удаления.
9. Сбой extractor не ломает AI success.
10. Retry source message/job не создаёт повторную память.
11. Context ограничен 12 фактами и 1600 символами.
12. Consentless пользователь не отправляется внешнему provider.
13. Migration `0010` применяется на чистой БД и повторный запуск безопасен.
14. Retry после soft delete не воскрешает факт.
15. Replay старого сообщения не перезаписывает более новый противоречащий факт.
16. Активная sensitive row отбрасывается context builder-ом.
17. Emoji/non-BMP текст не разрывается и лимит остаётся не более 1600 Unicode code points.

## Runtime acceptance

В изолированной topology:

1. применить migrations `0000–0010` дважды;
2. проверить Drizzle metadata, новые columns, table, indexes и constraints;
3. подготовить синтетического completed user;
4. отправить устойчивый факт и дождаться extraction job;
5. проверить один active memory fact;
6. начать новый разговор и подтвердить включение факта в provider request через безопасную test instrumentation;
7. удалить факт через owner API и подтвердить исключение из следующего request;
8. подтвердить корректные first/current/target weight и delta;
9. проверить retry, extractor failure и ownership;
10. проверить отсутствие message content, memory context и secrets в logs/outbox payload.

Реальный provider не требуется для проверки extractor; GenAPI adapter не используется для extraction.
