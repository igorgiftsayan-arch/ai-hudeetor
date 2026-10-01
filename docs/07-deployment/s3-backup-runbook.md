# Production PostgreSQL backup to private S3

## Статус и цели

Runbook подготовлен, но внешний target не активирован. Цели после отдельного
разрешения: RPO 24 часа, retention 7 daily snapshots, client-side encryption и
регулярный isolated restore drill. Redis не резервируется как business truth.

## Защищённая конфигурация

Создать вне checkout `/root/rebody38-backup/backup.env`, owner `root`, mode
`600`, по списку имён из
`infrastructure/backup/.env.example`. Не копировать bucket или credentials
другого продукта. Не печатать resolved environment.

Repository должен заканчиваться отдельным prefix
`rebody38-production/postgresql`. Скрипты fail closed для пустого, shared или
несовпадающего prefix. Restic image закреплён digest в template и ADR-012.

## Первичная активация — только после отдельного разрешения

1. Проверить права env-файла и presence переменных без значений.
2. Запустить `backup-postgres.sh --validate-only`.
3. После ручного подтверждения endpoint/bucket выполнить init с одноразовым
   `BACKUP_REPOSITORY_INIT_APPROVED=true`.
4. Выполнить `verify-target.sh` с одноразовым
   `BACKUP_TARGET_VERIFICATION_APPROVED=true`. Marker содержит только SHA-256
   repository URL, не credentials.
5. Создать первый backup вручную. Убедиться, что status равен success и
   `check-freshness.sh` возвращает `backup_freshness=ok`.
6. Выполнить `restore-drill.sh` с одноразовым
   `BACKUP_RESTORE_APPROVED=true`. Скрипт восстанавливает latest scoped snapshot
   в disposable PostgreSQL 17, проверяет таблицы и Drizzle metadata, затем
   удаляет временные container/network/volume.
7. Выполнить `preview-retention.sh`. Сверить удаляемые snapshots и repository
   fingerprint.
8. Только после отдельного подтверждения передать точный fingerprint через
   `BACKUP_PRUNE_TARGET_FINGERPRINT` и одноразовый
   `BACKUP_PRUNE_APPROVED=true` в `apply-retention.sh`.

Команды запускаются с `BACKUP_ENV_FILE=/root/rebody38-backup/backup.env`.
Approval-переменные не сохраняются в env-файле.

## Расписание и мониторинг

Scheduler пока не создаётся. После integration verification отдельная задача
должна назначить ежедневный запуск, запуск retention и проверку freshness.
`check-freshness.sh` возвращает non-zero, если нет успешной копии за 86 400
секунд. `status.json` содержит только время, safe category и результат; S3
credentials, repository password, dump content и пользовательские данные в
логи не выводятся.

## Ошибки и восстановление

- Ошибка dump/upload фиксирует `status=failed`, сохраняет timestamp последнего
  успеха и удаляет staging dump.
- Отсутствующий/изменённый verified-target marker блокирует backup и retention.
- Ошибка restore drill не меняет production DB; cleanup удаляет только ресурсы
  с уникальным prefix `rebody-backup-restore-*`.
- Потеря `RESTIC_PASSWORD` делает repository невосстановимым и требует
  отдельного защищённого хранения секрета.

## Ручная приёмка

- validation отклоняет пустой/shared/mismatched prefix;
- repository доступен только по отдельным scoped credentials;
- dump загружен encrypted restic repository;
- freshness проходит после backup и падает старше 24 часов;
- restore drill подтверждает application tables и migration metadata;
- retention preview показывает только scoped host/tag;
- prune не запускается без marker + approval + exact fingerprint;
- production containers/volumes не используются как restore target.
