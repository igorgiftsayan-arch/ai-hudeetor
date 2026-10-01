# Rebody: вернуть действующий Герби-Марафон — 2026-10-01

## Цель и статус

Владелец поручил выпустить существующие марафон и фото еды на `https://rebody38.ru`.
Это интеграция существующего продукта, не новый прототип. Статус: **IN PROGRESS**.
Ни наличие старого кода, ни исторические проверки не означают готовность текущего сайта.

- База публичного релиза: `7e0ee20`, deployed application source `5e89786`.
- Источник expanded продукта: `back/gerbi-expanded-pilot` (`00bba8d`),
  `ui/gerbi-expanded-pilot` (`84bba91`).
- Интеграция: `release/rebody38-gerbi-20261001`; backend и frontend работают
  в собственных ветках от той же базы. `main` не меняется.
- По прямому решению владельца S3/off-host backup, резервные копии и RPO/RTO
  не входят в эту цель. Private object storage для фото — действующая архитектура
  приложения, не резервное копирование; внешний новый провайдер не подключается.

## Что должно работать

1. Существующие аккаунты, регистрация, подтверждение email, восстановление пароля,
   SMTP, cookies/CSRF, текущие веса и ledger сохраняются.
2. Пользователь входит в реальный марафон по приглашению, видит свою команду.
3. Вес: две цифры, одна актуальная запись на локальный день; повтор — update.
4. Восемь фиксированных отметок Веллнес Индекса **за вчера**, editable report.
5. Капитан публикует отдельное задание; участник отмечает/отменяет выполнение.
6. Три отдельных дневных пьедестала; равные результаты разделяют место.
   Нет общего score, raw weight или накопленных итогов в командном ответе.
7. Фото → приватная загрузка → согласие/цена → реальный GenAPI → исправление
   распознавания → явное подтверждение употребления → reload/история/edit/delete.
8. Повторы и recovery не дублируют запрос/списание. Решение владельца 25 сентября:
   без пригодного результата через 300 секунд — полный exactly-once возврат за
   счёт проекта, даже при неизвестном исходе провайдера; без позднего re-debit.
9. Существующий opt-in Web Push переносится без автоматической подписки.
   Физическая доставка на телефон отмечается отдельно от тестов scheduler/UI.

## Обнаруженные несовместимости

- В узком release отсутствовали food/marathon endpoints, generated DTO и страницы.
- Номер SQL `0012` уже занят identity email/reset; старый GERBI использует его
  для marathon. Применённые миграции не переписывать. Backend готовит новую
  последовательность `0013..0019`; нужны clean + release-upgrade + repeat проверки.
- Public host nginx ограничивает весь body `1m`; food API принимает максимум
  10 485 760 байт. Подготовлен отдельный `/atlas-private/` маршрут `10m` на обоих
  proxy hops, общий лимит `1m` сохранён. Signed URI/Host сохраняются, access logging
  для signed URLs выключен, console MinIO наружу не публикуется.
- Старые GERBI PostgreSQL/MinIO volumes существуют, контейнеры остановлены.
  Они не запущены и не подменяют текущую production DB.

## Инфраструктура

### Версии раскрытия при cutover

Live до переключения: terms/privacy `2026-10-01-v2`, provider consent
`genapi-grok-2026-10-01-v1`. Подготовленные версии нового релиза:
`terms-2026-10-01-v3`, `privacy-2026-10-01-v3`,
`genapi-chat-food-2026-10-01-v2`. API и worker должны получить один и тот же
provider version; web build — те же terms/privacy, что registration metadata.
Существующие согласия не переписывать: новый external request требует явного
принятия актуального раскрытия, включающего оригинальное фото/пищевой контекст.
Protected production env пока не изменён. Это техническая синхронизация раскрытий
с поведением, не заявление о юридической экспертизе.

Новый overlay `infrastructure/compose.production-food.yaml` применяется после
`compose.yaml` и `infrastructure/compose.production.yaml` в **том же** production
project. Он добавляет private MinIO, idempotent private-bucket initialization и
food/notification env. Внутренние endpoints API/worker используют `minio:9000`,
browser signed endpoint использует `https://${APP_DOMAIN}`. Новый volume
`food-images` не переиспользует историческое тестовое хранилище автоматически.

Секреты `FOOD_STORAGE_ACCESS_KEY`/`FOOD_STORAGE_SECRET_KEY` хранятся только в
защищённом runtime env вне Git. Fake defaults сохраняются; реальное включение
food GenAPI проверяется отдельно с действующим consent. Bootstrap false и
пустой allowlist — безопасное исходное состояние. Push false до отдельного
проверенного включения; UI не спрашивает permission без действия пользователя.

## Проверки в этом checkpoint

### Общая интеграция кода

- Backend checkpoint `2c9d110` интегрирован как `5d91728`;
  web checkpoint `edffd69` интегрирован как `67cc0c5`.
- Frozen install PASS; backend/API/worker build PASS локально
  (Node26.0.0/pnpm11.19.0, не authoritative Node24 build).
- Общие web tests: **167/167 PASS**, 32 files.
- Web typecheck: **FAIL**, отсутствующий `ProviderConsentMetadataDto`.
  Дополнительный source review установил не только имя DTO, но устаревшие
  route/method/fields в imported provider consent component. Фикстуры старого
  UI это расхождение не обнаружили; frontend получил исправление реального
  release-контракта и тестовых fixtures. Этот результат не считается готовностью UI.
- `0012_identity_email_verification_reset.sql` не изменён относительно release.
  Новые migrations `0013..0019` присутствуют; actual upgrade/PG suite ещё в работе.

Проверенные MinIO/MC artifacts сохранились в старом release tree (это не
`/usr/local/bin` хоста; путь назначения внутри контейнера нельзя путать с source).
Их можно переиспользовать без запуска исторического стека через optional
`compose.production-food-artifacts.yaml`; private production photo volume новый.

- Binary directory: `/opt/projects/ai-hudeetor-gerbi-expanded-runtime/releases/da9e837/bin`.
- MinIO SHA256: `51e11e3dbb73f4805e4cc0a6edcc7bca9007478debd4ab87657510f7a3130af4`.
- MC SHA256: `46048312078528931c501001530d252df146f4de1ea43ed2a8ce54c4593b4515`.
- Live `sha256sum` совпал для обоих; carrier image `6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`
  существует, Linux/amd64. Источник upstream builds и прежнее разрешение владельца:
  `gerbi-expanded-pilot/docs/07-deployment/gerbi-constrained-runtime.md`.
- Это локальные сборки upstream, не официальные registry images. Обычный overlay
  сохраняет registry вариант; final deployment обязан явно выбрать проверенный
  вариант, а не полагаться на прежнюю недоступность публичного registry.
- Offline overlay Compose validation: PASS с dummy credentials, без печати env.
- Реальный MinIO smoke: PASS в одноразовом контейнере, `network none`, без ports,
  synthetic credentials и tmpfs `/data`. Health + private bucket initialization
  выполнены; anonymous GET и PUT возвращают `403,403`. Контейнер завершился `0`
  и удалён автоматически вместе с tmpfs. Пользовательские volumes не подключались.
  Это ещё не signed browser upload/GenAPI acceptance.

- Live read-only: production containers healthy; исторические GERBI остановлены.
- Сервер: 3915 MiB RAM, 2574 MiB available; 17 GiB свободного диска на момент проверки.
- Compose schema: PASS (`config --quiet` с protected production env и dummy food
  credentials; resolved env не печатался, сервисы не запускались).
- Новый gateway: PASS `nginx -t` в одноразовом `nginx:1.27-alpine`, network none,
  без опубликованных ports. Production nginx не менялся.
- End-to-end signed upload через HTTPS: **NOT RUN**, ждёт интегрированный backend.
- Миграции/полный backend/frontend regression: **IN PROGRESS** у исполнителей.
- Реальный марафон, капитан/участник, GenAPI food и mobile browser: **NOT RUN**.

## Не выдумывать входные данные

Существующий API предоставляет guarded bootstrap и вступление по непрозрачному
join code. Для реального марафона требуются подтверждённые даты, названия команд
и аккаунты капитанов. Вопрос направлен владельцу; синтетические fixtures не
выдаются за действующий марафон. Дополнительные правила питания не изобретаются.

## Выпуск и откат

Последним Compose overlay применяется `infrastructure/compose.release-images.yaml`:
API/worker/web/migrate используют один `REBODY_RELEASE_IMAGE` (проверенный immutable
image ID), с отдельными entrypoints. База, Redis и их volumes не переопределяются.
На cutover использовать `--no-build --pull never`; код в checkout и built source
фиксируются отдельно. Повторная сборка внутри production up не допускается.

До переключения: точные интегрированные commits/images, clean+upgrade tests,
проверка конфигурации и текущих данных без PII, отсутствие незавершённых операций
на границе обновления worker. Не запускать исторический стек. Сохранить предыдущие
image references и config, не удалять volumes. Миграции additive: rollback приложения
проверяется отдельно, destructive down migration запрещена. После обновления —
readiness, текущий вход/вес/чат, реальные marathon/food/browser сценарии и публичные
assets. Ни переключение, ни успешная пользовательская приёмка пока не выполнены.

## Публичное переключение 2026-10-01, следующий checkpoint

Предыдущие NOT RUN выше относятся к подготовке. Выполнено:
- Runtime image built from `d021923`, Node 24.18.0, full web/API/worker build PASS;
  immutable image `sha256:fe5d35e103ccaa1606d899afa544e363266aa2ddc6f599c8de71acf6d35eb8a5`.
- Final backend test-only commits integrated as `b1f60b4`, `c8587dc`; production
  runtime content unchanged from the built source. Migration files 0013–0019
  physically inspected inside the image.
- Backend acceptance: API PostgreSQL 62/62; worker PostgreSQL 75/75. Separate
  0012→0019 upgrade + repeat preserved a verified synthetic user and ledger +100.
- Production migrate succeeded; metadata count 20. Before/after counts unchanged:
  users 13, weight entries 9, token transactions 15; pre-cutover AI all terminal.
- Production checkout switched to `c8587dc`; same Compose project and existing
  PostgreSQL/Redis volumes. Private food volume added. No backup performed.
- Protected candidate settings `/root/rebody38-production-runtime/gerbi-release.env`
  used for this deployment (0600); old runtime.env retained unchanged for rollback.
- Scoped host upload location and recreated Docker gateway; nginx syntax PASS.
- Public HTTPS readiness, marathon and food return 200; anonymous private object
  access returns 403. Browser login succeeds; existing 80.20 weight is retained;
  navigation exposes food and marathon.

Still NOT ACCEPTED: real marathon configuration (owner dates/teams/captains),
signed food upload and real GenAPI correction/confirmation/history journey,
captain/participant production acceptance. Goal remains active.
