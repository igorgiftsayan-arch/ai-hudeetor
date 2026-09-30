# Read-only аудит test server перед pre-production

Дата проверки: 2026-09-30. Аудит выполнен только чтением состояния; containers, volumes, files, firewall, Nginx и runtime configuration не изменялись.

## Наблюдаемое состояние

- Host: `3d5e08152480`, Linux 6.8, uptime около 82 дней.
- Capacity: 1 CPU, 1.9 GiB RAM, около 934 MiB available; swap 2 GiB, использовано около 245 MiB.
- Disk: 29 GiB, занято около 25 GiB, свободно около 3.8 GiB — 87% utilization.
- Runtime: Docker Engine 29.1.3, Docker Compose 2.40.3.
- Docker inventory: 41 containers, из них 7 running; около 50 images / 7.3 GiB и 18 volumes / 613 MiB по `docker system df`.
- Активная Compose topology: только `atlas-gerbi-expanded`; семь сервисов healthy, включая PostgreSQL 17 и Redis 8. Это наблюдение не доказывает готовность AI-худеетор.
- Host Nginx уже слушает порт 80; также заняты 8090, 8092, 3114, 8771, 10050 и 22. Listener на 443 во время аудита не обнаружен.
- На диске присутствуют старые каталоги и named volumes разных test topology. Они не удалялись и не считаются работающими стендами.

## Выводы и ограничения

1. Новый gateway нельзя без проверки привязать к host port 80. Production hostname должен подключаться отдельным server block существующего host Nginx и проксировать на loopback-only Compose gateway.
2. Свободное место 3.8 GiB и 87% utilization — блокер безопасной сборки/rollback без согласованного capacity/cleanup плана. Общая очистка Docker запрещена без отдельного разрешения и inventory точных targets.
3. 1 CPU и 1.9 GiB RAM требуют измерения сборки и runtime-нагрузки; одновременная локальная сборка images на сервере может вытеснить работающие сервисы.
4. HTTPS readiness не подтверждена: домен, DNS, certificate, 443 listener и внешний browser path отсутствовали в scope read-only аудита.
5. PostgreSQL/Redis readiness существующей чужой topology не подтверждает backup, restore или migration readiness нового deployment.

## Обязательные действия до deployment

- Владелец предоставляет домен, DNS target и разрешение на certificate/host-Nginx change.
- Зафиксировать точные image digests и оценить дополнительный disk footprint; отдельно согласовать безопасную очистку либо расширение диска.
- Создать изолированный Compose project и отдельные volumes/env; не переиспользовать данные других topology.
- Выполнить backup и restore drill, repeatable migrations, exact-image health/smoke и browser acceptance.
- Открывать регистрацию только named testers за access control, пока не утверждены email verification и anti-abuse policy.
