# GERBI expanded pilot — technical design

## Scope and boundaries

The expanded pilot adds three bounded capabilities: private food-photo analysis with explicit consumption confirmation, phone Web Push reminders, and automatic recovery of AI operations whose provider outcome can be safely determined. It does not add medical nutrition, calories/macros as a primary result, invented Gerbi rules, causal weight claims, public files, or blind provider resubmission.

## Food state model

`uploaded_images` owns the private object lifecycle. `food_analyses` owns recognition and suitability. `food_consumptions` is a separate confirmation record. An analyzed image is never evidence that food was eaten.

Analysis states: `queued → processing → analyzed | technicalError | outcomeUnknown`. A user may correct recognized dish/products before confirmation. Suitability observations carry a source (`profile`, later `gerbiProgram`) or return `insufficientData`; the application must not invent missing rules.

Consumption is created only by an authenticated, CSRF-protected, owner-scoped, idempotent command with explicit `consumedAt` and timezone. The confirmed snapshot is immutable for downstream context. Deletion is soft and removes it from diary/context. Historical photos/analyses and consumption records have separate delete semantics.

Only active confirmed consumption may enter food memory/context or a weight-comparison read model. That read model reports observations and `insufficientData`, never causation.

## Owner decision: cancel a definitely unsubmitted paid photo analysis

Confirmed on 2026-09-24: the owner may cancel a paid photo analysis only when
non-submission to the provider is proven. The full reserved token amount is
refunded exactly once. Cancellation/refund must be serialized with submission
so a concurrently submitted operation cannot also receive this cancellation.
Missing provider ID alone is not proof of non-submission. Possibly submitted,
accepted and ambiguous/outcomeUnknown cases are excluded. This does not resolve
the separate pre-ID unknown goodwill/refund policy, which remains TBD.
Backend/frontend implementation is underway; no code or runtime acceptance is
claimed by this decision. ADR012 remains owned by the backend implementation.

## Private file boundary

Objects use random keys in private S3-compatible storage. Upload uses a short-lived signed operation or a backend transfer; permanent public URLs are forbidden. Content type, declared size, SHA-256 and image magic bytes are validated; an object is quarantined until validation completes. The source image follows the existing 30-day retention policy after terminal analysis and owner deletion remains available.

GenAPI accepts images in OpenAI-compatible message content using `image_url` with Base64 or a URL, and its native API is asynchronous. A private object therefore needs a short-lived signed URL or backend-mediated payload, never a public bucket. Sources: [GenAPI files](https://gen-api.ru/docs/working-with-files), [OpenAI format](https://gen-api.ru/docs/openai-format), [Grok 4.5 API](https://gen-api.ru/model/grok-4-5/api).

## Push reminders

The browser owns notification permission. The backend stores explicit product opt-in, the user-selected local time/timezone, subscription state and deduplicated deliveries. It does not silently enable a schedule. A revoked/expired endpoint is disabled without retry storms.

Web Push acceptance requires a trustworthy HTTPS origin. iOS support is limited to web apps added to the Home Screen and permission must follow a direct user interaction; an HTTP-IP stand is not acceptance evidence. Platform behavior must be checked against [WebKit Web Push for Web Apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and [MDN Notification permission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission).

## Automatic AI recovery

Every provider request gets an immutable owner-linked receipt before submission: provider/model/prompt version, canonical payload, SHA-256 and submission state. Known provider request IDs may be polled through the documented result endpoint and finalized once. Provider webhook delivery is only a wake-up signal; PostgreSQL remains truth. GenAPI documents result polling and webhook retries, but not idempotent initial submit or lookup by a client-generated request ID: [result polling](https://gen-api.ru/docs/v1/generations/getting-the-result), [generation lifecycle](https://gen-api.ru/docs/generation), [webhooks](https://gen-api.ru/docs/webhooks).

Safe rules:

- `prepared` before a worker claim may be retried only when non-submission is proven; the worker durably moves it to `submitting` before the outbound call, and a crash from `submitting` becomes `ambiguous`, never an automatic resubmit;
- `accepted` with provider request ID is polled and finalized idempotently;
- ambiguous pre-ID submission is not blindly resent or refunded;
- reconciliation never rebuilds the original request from mutable current profile/memory;
- receipt payload is never logged, emitted to analytics/outbox, or exposed through team APIs and is deleted with the owning account/conversation lifecycle.

Food vision uses the same receipt states and one-shot ledger finalization. A paid analysis cannot bypass recovery merely because it uses an image. Push delivery deduplication is per subscription and scheduled instant so each explicitly opted-in device receives at most one copy.

## Delivery order

1. Additive persistence and clean/repeatable migration tests.
2. Owner-scoped REST contracts and generated client.
3. Private storage adapter and deterministic fake vision worker.
4. Consumption confirmation/history and observed weight comparison.
5. Push preference/subscription API, scheduler and idempotent delivery worker.
6. Immutable AI receipt integration and known-ID automatic reconciliation.
7. Isolated HTTPS/mobile acceptance; no stable deployment without separate permission.
