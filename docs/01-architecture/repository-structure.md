# Структура репозитория

Сейчас репозиторий содержит документацию и примеры конфигурации.

```text
/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── .env.example
└── docs/
    ├── 00-product/
    ├── 01-architecture/
    ├── 02-domain/
    ├── 03-api/
    ├── 04-analytics/
    ├── 05-security/
    ├── 06-development/
    ├── 07-deployment/
    └── 08-roadmap/
```

Структура исходного кода будет определена ARCH-001. Принят [монорепозиторий](architecture-decisions/ADR-001-monorepository.md); новые каталоги должны иметь явную ответственность и не смешивать runtime-код, инфраструктуру и документацию.
