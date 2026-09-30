# Public legal pages — review draft

**Статус:** непубличный draft. Страницы `/terms` и `/privacy` готовы только
для review в ветке `docs/privacy-terms-draft`; их нельзя выкладывать в shared
runtime до заполнения фактов ниже.

## Синхронизация версий

Login передаёт `NEXT_PUBLIC_IDENTITY_TERMS_VERSION` и
`NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION`. В Compose оба значения происходят из
тех же `IDENTITY_TERMS_VERSION` и `IDENTITY_PRIVACY_VERSION`, которые backend
сверяет при регистрации. Страницы показывают соответствующую frontend-версию,
но не создают отдельный источник истины.

## Обнаруженные противоречия и исправления

| Раньше заявлялось | Фактическое состояние | Исправление в draft |
| --- | --- | --- |
| Пользователь «может удалить аккаунт, разговор и запросить экспорт». | Реализованы logout и owner-scoped soft delete AI memory; self-service account/chat delete и export API отсутствуют. | Не обещаем эти действия и прямо отмечаем их как не реализованные. |
| Указаны сроки retention, удаления фото, backups, payment и analytics. | Нет доказанных retention jobs, фото/payload flow, payment flow, analytics delivery или production backup policy. | Не публикуем сроки и не заявляем обработку этих категорий как действующую. |
| Нужные данные могут уходить внешнему AI-провайдеру, обучение по умолчанию запрещено. | `AI_PROVIDER=fake` используется в candidate; реальный GenAPI разрешён только synthetic test user, а real-user consent/reconciliation отложены. Downstream geography/training/retention не подтверждены. | Не утверждаем передачу, страны, обучение или сроки downstream provider. |
| Privacy contact и оператор будут определены до production. | Факты для опубликованного текста не предоставлены. | Оставлены явные непубличные placeholders, без вымышленных имени, адреса или email. |

## Недостающие факты до публикации

1. Полное наименование оператора, юридическое основание, адрес, канал для
   privacy-запросов и порядок ответа.
2. Утверждённые финальные versions/даты условий и privacy policy; эти значения
   должны быть одинаково заданы в web build и API runtime.
3. Подтверждённый public AI flow: получатели/география по provider-route,
   downstream retention/training, отдельное согласие и reconciliation.
4. Реально реализованные и проверенные механизмы export/delete, retention jobs,
   backup/RPO/RTO и законные исключения из удаления.
5. Отдельное подтверждение scope и условий, если будут активированы payments,
   фото или analytics.

## Проверяемые границы

- Draft не меняет REST DTO, backend consent types, migrations или runtime env.
- Registration по-прежнему требует только `terms` и `privacy`; их версии
  серверно проверяются до создания session.
- Публикация и выкладка не входят в этот draft.
