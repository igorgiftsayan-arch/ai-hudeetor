# ADR-003: Next.js и React frontend

- Статус: принято
- Дата: 2026-07-18

## Решение

Использовать Next.js + React + TypeScript с App Router для mobile-first network-first PWA. Пользовательская и административная области находятся в одном приложении, но имеют отдельные routes, permissions и API operations.

App Router даёт layouts, loading/error boundaries и маршрутизацию. SSR/RSC применяются выборочно для оболочек и публичных страниц; закрытые интерактивные сценарии могут работать как клиент к REST API.

## Границы

- NestJS API — единственная граница бизнес-операций.
- Route Handlers и Server Actions не реализуют домен, не обращаются к PostgreSQL, Redis или S3 и не становятся вторым backend.
- Server/session/UI/draft state разделены; критические операции не optimistic.
- Offline cache — только app shell и безопасная статика. AI, токены, платежи, рефералы и admin требуют сети.
- Admin frontend guard не заменяет backend authorization.

## Последствия

BOOT-000 выбрал native App Router manifest и минимальный network-first service worker без offline product data; BOOT-001 проверяет installability и cache safety. Отсутствие UX-спецификации оставляет риск навигации, accessibility и длительных AI-состояний. Отдельное admin-приложение и streaming отложены.
