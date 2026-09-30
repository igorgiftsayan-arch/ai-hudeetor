# Public legal pages — review draft

**Статус:** тексты готовы к публикации только через отдельный legal-only
маршрут. Они не разрешают открыть публичную регистрацию или всё приложение.

## Синхронизация версий

Login передаёт `NEXT_PUBLIC_IDENTITY_TERMS_VERSION` и
`NEXT_PUBLIC_IDENTITY_PRIVACY_VERSION`. В Compose оба значения происходят из
тех же `IDENTITY_TERMS_VERSION` и `IDENTITY_PRIVACY_VERSION`, которые backend
сверяет при регистрации. Страницы показывают соответствующую frontend-версию,
но не создают отдельный источник истины.

## Обнаруженные противоречия и исправления

| Раньше заявлялось | Фактическое состояние | Исправление |
| --- | --- | --- |
| Пользователь «может удалить аккаунт, разговор и запросить экспорт». | Реализованы logout и owner-scoped soft delete AI memory; self-service account/chat delete и export API отсутствуют. | Не обещаем эти действия и прямо отмечаем их как не реализованные. |
| Указаны сроки retention, удаления фото, backups, payment и analytics. | Нет доказанных retention jobs, фото/payload flow, payment flow, analytics delivery или production backup policy. | Не публикуем сроки и не заявляем обработку этих категорий как действующую. |
| Нужные данные могут уходить внешнему AI-провайдеру, обучение по умолчанию запрещено. | `AI_PROVIDER=fake` используется в candidate; реальный GenAPI разрешён только synthetic test user, а real-user consent/reconciliation отложены. Downstream geography/training/retention не подтверждены. | Не утверждаем передачу, страны, обучение или сроки downstream provider. |
| Privacy contact и оператор будут определены до production. | Владелец подтвердил: ИП Борисюк Игорь Викторович, ИНН 190207646175, местонахождение г. Иркутск, `levnaohote@yandex.ru`. | Реквизиты и email вставлены буквально; город не назван полным почтовым адресом. |

## Недостающие факты до публикации

1. Подтверждённый public AI flow: получатели/география по provider-route,
   downstream retention/training, отдельное согласие и reconciliation.
2. Реально реализованные и проверенные механизмы export/delete, retention jobs,
   backup/RPO/RTO и законные исключения из удаления.
3. Отдельное подтверждение scope и условий, если будут активированы payments,
   фото или analytics.

## Проверяемые границы

- Изменение не меняет REST DTO, backend consent types, migrations или runtime env.
- Registration по-прежнему требует только `terms` и `privacy`; их версии
  серверно проверяются до создания session.
- [Legal-only host template](../../infrastructure/nginx.legal-only-host.conf.template)
  пропускает только `/terms`, `/privacy` и `/_next/`; все другие пути, включая
  `/login` и `/api/`, получают `404`.
