# UI-001 Daily Weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать первый продуктовый mobile-first экран `/today` для просмотра и безопасной фиксации веса через существующий REST API.

**Architecture:** Клиентская страница получает onboarding/CSRF и историю веса через небольшой feature API boundary. Сохранение не оптимистичное: UI обновляется только подтверждённым `201`, а один idempotency key сохраняется для неизменённого payload до успешного ответа. Общая нижняя навигация связывает `/today` и существующий `/quick-reply`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, native fetch, Vitest, React Testing Library, CSS без новой UI-библиотеки.

---

### Task 1: Зафиксировать поведение `/today`

**Files:**
- Create: `apps/web/src/app/today/page.test.tsx`

- [ ] Добавить падающие component tests для последней записи, истории и перехода в AI.
- [ ] Добавить падающие tests для create, validation, loading, session expired и safe retry.
- [ ] Запустить targeted test и подтвердить RED из-за отсутствующей страницы.

### Task 2: Реализовать tracking UI boundary и `/today`

**Files:**
- Create: `apps/web/src/features/tracking/tracking-api.ts`
- Create: `apps/web/src/features/tracking/weight-format.ts`
- Create: `apps/web/src/app/today/page.tsx`
- Create: `apps/web/src/app/mobile-navigation.tsx`
- Modify: `apps/web/src/app/styles.css`

- [ ] Реализовать typed REST reads с session/error classification.
- [ ] Реализовать форматирование русского веса/дат и локальную валидацию одного десятичного знака.
- [ ] Реализовать загрузку, пустое состояние, summary, form, history и все error/retry states.
- [ ] Сохранить idempotency key при сетевом повторе и сбрасывать его только после успеха или изменения payload.
- [ ] Запустить targeted tests до GREEN и выполнить refactor с повторным GREEN.

### Task 3: Связать продуктовые маршруты

**Files:**
- Modify: `apps/web/src/app/quick-reply/page.tsx`
- Modify: `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/app/onboarding/page.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] Добавить mobile navigation на quick reply без изменения прямого доступа.
- [ ] При подтверждённом server status `completed` переводить `/onboarding` на `/today`.
- [ ] Обновить продуктовые metadata и route tests.

### Task 4: Документация и verification

**Files:**
- Modify: `docs/08-roadmap/current-status.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/07-deployment/runtime-verification.md`

- [ ] Зафиксировать UI-001, ручной сценарий и N/A для backend/migrations/events.
- [ ] Запустить web tests, root typecheck, lint и build.
- [ ] Поднять изолированную test-server topology, проверить `/today` и записать адрес/результат.
- [ ] Проверить diff, отсутствие секретов и создать один verification commit в `ui/ui-001-daily-weight`.
