# AI-002 Companion Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe structured long-term companion memory, deterministic asynchronous extraction, owner-scoped memory API, and compact system context on top of AI-001.

**Architecture:** Extend `profiles` with two nullable fields, keep weight truth in `tracking`, and add memory responsibilities inside the `ai-companion` module. A successful AI operation writes a minimal extraction outbox event; BullMQ runs a deterministic extractor whose idempotent PostgreSQL upsert is independent of the AI response and token transaction.

**Tech Stack:** TypeScript 5.9, NestJS 11, PostgreSQL 17, Drizzle SQL migrations, Redis 8/BullMQ, Jest, Supertest, Docker Compose.

---

### Task 1: Commit normative design and align contracts

**Files:**
- Create: `docs/01-architecture/vertical-slices/AI-002-design.md`
- Modify: `docs/01-architecture/vertical-slices/VERT-001-contracts.md`
- Modify: `docs/02-domain/domain-model.md`
- Modify: `docs/02-domain/database-schema.md`
- Modify: `docs/03-api/endpoints.md`
- Modify: `docs/05-security/privacy-and-data-policy.md`
- Modify: `docs/01-architecture/architecture-decisions/ADR-011-genapi-ai-provider.md`

- [ ] Record the approved profile, memory, extraction, context, privacy and API contracts.
- [ ] Resolve the obsolete V0.1 statement that display name and target weight are not collected.
- [ ] Document that extraction is provider-neutral and deterministic in AI-002.
- [ ] Run `pnpm exec prettier --check <changed markdown files>`.
- [ ] Commit documentation as `AI-002: define companion memory design`.

### Task 2: Migration 0010 and persistence constraints

**Files:**
- Create: `database/migrations/0010_ai_002_companion_memory.sql`
- Modify: `database/migrations/meta/_journal.json`
- Modify: `packages/backend/src/infrastructure/database/schema.ts`
- Create: `apps/api/test/ai-memory-postgres.integration.spec.ts`

- [ ] Write failing PostgreSQL tests for nullable profile fields, category/source/confidence checks, active partial uniqueness, extraction receipt uniqueness, source-message ownership and soft deletion.
- [ ] Run the focused integration test and confirm RED because migration/table is absent.
- [ ] Add migration `0010` with safe nullable profile columns, `ai_memories`, durable `ai_memory_extractions`, constraints and indexes.
- [ ] Register `0010` in the Drizzle journal and mirror it in infrastructure schema.
- [ ] Apply migrations twice to an isolated PostgreSQL and verify 11 metadata rows.
- [ ] Run the focused integration test and confirm GREEN.
- [ ] Commit as `AI-002: add companion memory persistence`.

### Task 3: Extend profile contract

**Files:**
- Modify: `packages/backend/src/profiles/domain/profile-types.ts`
- Modify: `packages/backend/src/profiles/application/profiles-repository.ts`
- Modify: `packages/backend/src/profiles/application/save-profile-setup.use-case.ts`
- Modify: `packages/backend/src/profiles/infrastructure/postgres-profiles.repository.ts`
- Modify: `packages/backend/src/profiles/transport/profiles.dto.ts`
- Modify: `packages/backend/src/profiles/transport/profiles.controller.ts`
- Modify: `apps/api/test/identity-api.spec.ts`
- Modify: `apps/api/test/identity-postgres.integration.spec.ts`

- [ ] Add failing API tests for optional/null `displayName`, optional/null exact-decimal `targetWeightKg`, validation limits and preservation of omitted values.
- [ ] Confirm RED against the old DTO/resource.
- [ ] Extend the application input with explicit field-presence semantics so omitted fields remain unchanged and `null` clears.
- [ ] Implement owner profile persistence without moving business logic into transport/infrastructure.
- [ ] Return both nullable values from profile/onboarding resources.
- [ ] Confirm focused API and PostgreSQL tests GREEN.
- [ ] Commit as `AI-002: extend companion profile context`.

### Task 4: Memory application model and owner API

**Files:**
- Create: `packages/backend/src/ai-companion/domain/ai-memory.ts`
- Create: `packages/backend/src/ai-companion/application/ai-memory-repository.ts`
- Create: `packages/backend/src/ai-companion/application/list-ai-memory.use-case.ts`
- Create: `packages/backend/src/ai-companion/application/delete-ai-memory.use-case.ts`
- Create: `packages/backend/src/ai-companion/infrastructure/postgres-ai-memory.repository.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.dto.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.controller.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.module.ts`
- Modify: `packages/backend/src/index.ts`
- Create: `apps/api/test/ai-memory-api.spec.ts`

- [ ] Write failing tests for ordered active list, soft delete, repeated delete, foreign-user read/delete and invalid ID.
- [ ] Confirm RED because use cases/routes do not exist.
- [ ] Implement repository port and application use cases with owner-scoped queries.
- [ ] Add `GET /api/v1/ai-memory` and CSRF-protected `DELETE /api/v1/ai-memory/:id`.
- [ ] Confirm API tests GREEN and error envelope remains canonical.
- [ ] Commit as `AI-002: add owner-scoped memory API`.

### Task 5: Compact MemoryContextBuilder

**Files:**
- Create: `packages/backend/src/ai-companion/application/memory-context-builder.ts`
- Create: `packages/backend/src/profiles/application/get-companion-profile-context.use-case.ts`
- Modify: `packages/backend/src/profiles/application/profiles-repository.ts`
- Modify: `packages/backend/src/profiles/infrastructure/postgres-profiles.repository.ts`
- Create: `packages/backend/src/tracking/application/get-companion-weight-context.use-case.ts`
- Create: `packages/backend/src/tracking/application/tracking-repository.ts`
- Create: `packages/backend/src/tracking/infrastructure/postgres-tracking.repository.ts`
- Modify: `packages/backend/src/profiles/transport/profiles.module.ts`
- Modify: `packages/backend/src/tracking/transport/tracking.module.ts`
- Modify: `packages/backend/src/ai-companion/application/ai-provider-adapter.ts`
- Modify: `packages/backend/src/ai-companion/transport/ai-companion.module.ts`
- Create: `apps/worker/test/memory-context-builder.spec.ts`
- Create: `apps/api/test/ai-memory-context-postgres.integration.spec.ts`

- [ ] Write failing unit tests for optional system fields, first/current daily weight, decimal delta, category priority, relevance, 12-fact cap, 1600-Unicode-code-point cap, non-BMP boundary, deleted-memory exclusion and defense-in-depth sensitive-row exclusion.
- [ ] Confirm RED because the builder does not exist.
- [ ] Implement owner-scoped application query DTOs in `profiles` and `tracking`; prohibit `ai-companion` from importing their infrastructure/repositories or directly reading foreign tables.
- [ ] Inject the profile/weight application query interfaces into `MemoryContextBuilder`; read only `ai-companion` memory through its own repository.
- [ ] Implement deterministic selection and rendering without technical IDs.
- [ ] Extend provider request with a separate `memoryContext?: string`.
- [ ] Confirm unit and PostgreSQL integration tests GREEN.
- [ ] Commit as `AI-002: build bounded companion context`.

### Task 6: Deterministic extractor and idempotent memory upsert

**Files:**
- Create: `packages/backend/src/ai-companion/application/memory-extractor.ts`
- Create: `packages/backend/src/ai-companion/application/deterministic-memory-extractor.ts`
- Create: `packages/backend/src/ai-companion/application/extract-memory.use-case.ts`
- Modify: `packages/backend/src/ai-companion/application/ai-memory-repository.ts`
- Modify: `packages/backend/src/ai-companion/infrastructure/postgres-ai-memory.repository.ts`
- Create: `apps/worker/test/deterministic-memory-extractor.spec.ts`
- Extend: `apps/api/test/ai-memory-postgres.integration.spec.ts`

- [ ] Write failing tests directly from the normative allowlist and closed denylist tables for stable facts, canonical keys/values, confidence, negation/contradiction, exact/prefix token boundaries, embedded sensitive content, PII digit/email detection, duplicate fact, transient phrase and compact values.
- [ ] Add failing PostgreSQL tests for atomic receipt + fact writes, source-message retry, retry after user deletion, and old-source replay after a newer contradiction.
- [ ] Confirm RED because extractor/upsert does not exist.
- [ ] Implement exactly the approved Russian allowlist/denylist, normalization and canonical keys; do not infer additional product patterns.
- [ ] Implement transactionally safe receipt plus fact upserts; a committed receipt makes all later retries no-op even after soft deletion.
- [ ] Confirm unit and PostgreSQL tests GREEN.
- [ ] Commit as `AI-002: add deterministic memory extraction`.

### Task 7: Success outbox and worker job

**Files:**
- Modify: `apps/worker/src/ai-operation.processor.ts`
- Modify: `apps/worker/src/outbox-publisher.service.ts`
- Create: `apps/worker/src/memory-extraction.processor.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Modify: `apps/worker/test/ai-operation-processor.spec.ts`
- Modify: `apps/worker/test/outbox-publisher.spec.ts`
- Create: `apps/worker/test/memory-extraction-processor.spec.ts`

- [ ] Write failing tests that AI success writes one minimal extraction event while technicalError/outcomeUnknown write none.
- [ ] Confirm RED against current success transaction.
- [ ] Write the outbox event in the same success transaction without message content.
- [ ] Add publisher routing with stable `jobId = outboxId`.
- [ ] Add processor that invokes the extraction use case and permits retry without changing the AI operation.
- [ ] Test duplicate outbox delivery, duplicate job, extractor failure and worker retry.
- [ ] Confirm worker suite GREEN.
- [ ] Commit as `AI-002: process durable memory extraction`.

### Task 8: Inject context into AI Gateway

**Files:**
- Modify: `apps/worker/src/ai-operation.processor.ts`
- Modify: `packages/backend/src/ai-companion/infrastructure/fake-ai-provider.adapter.ts`
- Modify: `packages/backend/src/ai-companion/infrastructure/genapi-ai-provider.adapter.ts`
- Modify: `apps/worker/test/ai-operation-processor.spec.ts`
- Modify: `apps/worker/test/fake-ai-provider-adapter.spec.ts`
- Modify: `apps/worker/test/genapi-ai-provider-adapter.spec.ts`

- [ ] Write failing tests that the worker passes bounded context separately and that the adapters incorporate it into system prompt without logging it.
- [ ] Confirm RED because requests lack memory context.
- [ ] Build context immediately before provider execution and pass it through the gateway request.
- [ ] Preserve `aiProviderProcessing` guard for GenAPI and fake behavior.
- [ ] Confirm tests for consentless external request, adapter payload and sanitized logging GREEN.
- [ ] Commit as `AI-002: provide structured context to AI gateway`.

### Task 9: OpenAPI/contracts and regression verification

**Files:**
- Modify generated files under: `packages/api-contracts/generated/`

- [ ] Build `@atlas/backend`.
- [ ] Run `pnpm contracts:generate`.
- [ ] Run `pnpm contracts:check` and confirm no generated drift.
- [ ] Run focused API, worker and PostgreSQL integration suites.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm format:check`.
- [ ] Fix only AI-002 regressions using RED-GREEN cycles.
- [ ] Commit generated contracts as `AI-002: publish memory API contracts`.

### Task 10: Isolated runtime acceptance

**Files:**
- Modify: `docs/07-deployment/runtime-verification.md`
- Modify: `docs/08-roadmap/current-status.md`
- Modify: `CHANGELOG.md`

- [ ] Push only `back/ai-002-companion-memory`.
- [ ] Create an isolated Compose project, isolated PostgreSQL/Redis volumes and private runtime env; do not alter stable topology.
- [ ] Build images from the AI-002 commit and record final exit status/digests.
- [ ] Inspect the migrate image for `0010`, run migrations twice, verify Drizzle metadata and expected schema.
- [ ] Execute the approved stable-fact, new-conversation context, deletion, weights/target, ownership, retry and extractor-failure scenarios.
- [ ] Inspect sanitized logs and outbox payloads for forbidden content.
- [ ] Run compatible-runtime regression/integration suites.
- [ ] Remove isolated containers, network, volumes and temporary env without touching stable resources.
- [ ] Record exact evidence in runtime verification, current status and changelog.
- [ ] Run final documentation link/format checks and repository status review.
- [ ] Commit as `AI-002: verify companion memory runtime`.
- [ ] Push the branch and report branch, commit, migration, API, extractor rules and verification evidence. Do not merge.
