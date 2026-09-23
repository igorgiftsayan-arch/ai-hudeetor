# Gerbi Marathon backend implementation plan

## Goal

Backend pilot for teams, daily wellness, captain task, private daily read model
and explicit provider consent, reusing tracking and AI-001/002/003.

## Exclusions

No frontend edits, stable deployment, public social features, cumulative team
totals, invented podium rules, notifications, cron or food vision.

## Tasks

1. Add RED domain/contract tests for report date, report upsert, membership
   scoping, captain permissions, task completion, unknown-vs-zero and hidden
   cumulative/raw data.
2. Add additive migration `0012` with marathon/team/membership/report/task,
   completion and immutable baseline-ready fields plus database constraints.
3. Implement `marathon` domain/application/infrastructure/transport module,
   explicit transactions and PostgreSQL idempotency.
4. Add provider-consent acceptance use case and endpoint; require configured
   current version and preserve existing worker consent guard.
5. Generate OpenAPI/client, run focused API/unit/PostgreSQL tests, lint/build
   and contract drift.
6. Apply migrations twice and execute isolated synthetic runtime acceptance.
7. Record results in current status, changelog, API/database/runtime docs;
   commit and push only `back/gerbi-marathon-pilot`.

## Deferred dependencies

- weight podium and baseline capture wait for the owner formula;
- wellness/captain-task podiums wait for aggregation/tie rules;
- real membership/captain bootstrap waits for dates and user data;
- food photo needs private object storage, upload/validation/lifecycle and a
  vision provider contract, so it remains a separate optional stage.

