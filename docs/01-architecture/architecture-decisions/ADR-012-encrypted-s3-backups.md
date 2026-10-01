# ADR-012: encrypted PostgreSQL backups in a scoped S3 repository

- Статус: принято для реализации, внешняя активация отложена
- Дата: 2026-10-01

## Контекст

Production требует RPO 24 часа, семь ежедневных копий и проверяемое
восстановление вне основного сервера. S3 target и отдельные credentials ещё не
предоставлены. Использовать bucket или ключи другого продукта запрещено.

## Решение

PostgreSQL 17 создаёт logical custom-format dump через `pg_dump`. Официальный
container `restic/restic:0.19.1` используется как operational S3 client и слой
client-side encryption. Для linux/amd64 закреплён immutable digest
`sha256:08916bcda4a4435f9d9828ebb4e91bb7ada3d2c8a53699788930e0ae1bd4fa67`,
проверенный через Docker manifest официального repository.

Repository обязан находиться под отдельным prefix
`rebody38-production/.../postgresql`; root bucket и shared prefix запрещены.
Retention ограничивается host и tag этого deployment. `forget --keep-daily 7
--prune` требует verified-target marker, явный approval и совпадающий SHA-256
fingerprint repository. До этого доступен только `--dry-run` preview.

Restore выполняется в одноразовой PostgreSQL 17 topology с отдельными network и
volume. Production database никогда не является restore target.

Основание по инструменту: [официальный image](https://hub.docker.com/r/restic/restic/tags),
[S3 configuration](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[retention](https://restic.readthedocs.io/en/latest/060_forget.html) и
[restore](https://restic.readthedocs.io/en/latest/050_restore.html).

## Ограничения

- Cron/scheduler, repository init, upload и prune не активируются до получения
  отдельного S3 target, credentials и isolated integration verification.
- Secret file хранится вне Git, принадлежит root и имеет mode `400` или `600`.
- Restic password терять нельзя: без него encrypted repository невосстановим.
- Это эксплуатационный инструмент, а не изменение application stack.

## Альтернативы

- Самописные S3 SigV4 и encryption отклонены как избыточные и рискованные.
- Незашифрованный `pg_dump` upload отклонён из-за требований к приватности.
- Backup только на production host отклонён: он не защищает от потери сервера.
