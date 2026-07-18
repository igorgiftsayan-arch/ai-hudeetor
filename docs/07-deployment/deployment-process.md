# Процесс развёртывания

1. Убедиться, что задача допускает выкладку и выполнен [Definition of Done](../06-development/definition-of-done.md).
2. Собрать воспроизводимые артефакты из конкретного commit.
3. Проверить конфигурацию и наличие секретов без вывода значений.
4. Создать резервную точку согласно [backup-and-restore.md](backup-and-restore.md), если меняются данные/схема.
5. Выполнить миграции контролируемым процессом.
6. Развернуть совместимые компоненты, проверить health/readiness.
7. Выполнить [smoke test](smoke-test.md).
8. При ошибке остановить rollout и применить документированный rollback/restore.
9. Записать версию, время, исполнителя, результат и инциденты.

BOOT-001 предоставляет локально воспроизводимые команды `db:migrate`, `smoke` и Compose healthchecks. Миграции выполняются отдельным one-shot service и не запускаются при старте API/worker. Архитектурный flow зафиксирован в [deployment-architecture.md](../01-architecture/deployment-architecture.md); CI provider остаётся отложенным.
