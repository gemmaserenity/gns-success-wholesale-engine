# Architecture

## Objective

GNS Success Wholesale Engine is designed to convert raw public real-estate distress records into a small number of highly qualified wholesale acquisition opportunities.

## Core Flow

Discovery
→ Normalization
→ Property Resolution
→ Preliminary Economics
→ Deal-Killer Rules
→ Underwriting
→ Opportunity Scoring
→ Selective Enrichment
→ Seller Qualification
→ Human Closing

## Infrastructure

### Cloudflare

Cloudflare provides:

- DNS
- Workers
- Workflows
- scheduling
- application delivery
- security

### Supabase

Supabase/PostgreSQL is the canonical system of record.

Business state must not exist only inside AI context or temporary Worker memory.

Phase 2 milestone 1 persists each evaluation through one transactional database function and exposes a latest-per-property view plus immutable evaluation history. The Worker remains the only browser-facing database boundary.

Phase 2 property enrichment follows the same boundary. Operators may add public-record, permitted-API, or paid-provider evidence through the Worker. Free evidence is allowed for active opportunities; paid evidence additionally requires a qualified disposition, an 80+ score, at least $10,000 base-case spread, sufficient existing confidence, and a bounded cost. PostgreSQL stores the evidence and any underwriting revision in one transaction.

The Phase 2 buyer database adds a second operating queue behind the same private Worker boundary. Buyer identity, contact standing, observed performance, and buy-box criteria are stored transactionally in normalized tables. The database is intentionally evidence-only at this milestone: buyer criteria do not become an opportunity score until the matching model can produce explainable matches and a probable buyer count.

Buyer-demand matching is an explicit operator action on a persisted, non-rejected opportunity. The Worker loads the immutable source evaluation, current property evidence, and at most 100 active buyer profiles; the deterministic `buyer-demand-v1` model classifies each profile as probable, possible, excluded, or ineligible. Criterion outcomes distinguish mismatch from missing evidence. PostgreSQL transactionally stores the run, buyer snapshots, explanations, and a new opportunity evaluation whose buyer-demand component is model-derived. Existing evaluations are never mutated.

Selective skip tracing is a provider-neutral research boundary, not a vendor adapter. One persisted evaluation can open one case only after deterministic checks of qualification, score, base spread, owner confidence, public-record/contact-standing review, suppression, privacy rationale, and bounded cost. Completed findings retain immutable provenance and cost evidence; seller contact standing is append-only and separate. The app transmits nothing to a provider, contact existence never becomes permission, and no outreach API exists.

The seller-acquisition boundary is a separate Cloudflare Worker with its own isolated static-asset bundle, public hostname, rate limit, runtime bindings, and one public intake endpoint. It shares no dashboard assets or routes with the authenticated wholesale Worker. Each inbound submission is idempotent and transactionally stores the seller-authored facts, `seller-intake-v1` assessment, explicit per-channel consent, initial status, optional Cal.com offer, and minimized audit evidence. Private operators review inquiries through the wholesale Worker and append status events; they never edit or delete the original submission.

Cal.com is queried only to resolve the configured public booking link, without transmitting seller data. Resend sends a seller acknowledgement only when email permission was selected and sends a PII-minimized internal notification. Delivery outcomes are append-only. No call, text, or AI-provider adapter is activated.

AI-assisted intake remains inside the authenticated Worker. It creates a versioned packet containing coded intake facts and qualification evidence while excluding identity, contact values, address, APN, exact financial amounts, and free-text notes. The app makes no AI-provider request. Structured imported output requires provider/model provenance and a human decision, and it cannot mutate inquiry status, permissions, scheduling, qualification, or outreach.

Phase 3 milestone 1 connects an inbound inquiry to the existing opportunity engine only inside the authenticated Worker. An operator cites a zero-cost public record or completed human verification, confirms parcel identity, records owner/authority standing and confidence, and supplies bounded underwriting evidence. One restricted PostgreSQL function persists the normalized opportunity evaluation, acquisition case, and immutable verification together. The existing buyer-demand model can then create its own immutable run and revised evaluation. An append-only human decision may advance, hold, or decline; advance requires the latest non-rejected evaluation, matched owner, verified seller authority, a current buyer-demand run, and explicit review attestations. No action contacts a seller or buyer, transmits data to a provider, or generates or authorizes an offer.

Phase 3 milestone 2 adds an immutable diligence ledger after an advance decision. The private Worker requires the advance decision, evaluation, and buyer-demand run to remain mutually current, then records exactly one status and provenance envelope for each of 13 acquisition checks. The deterministic `acquisition-diligence-v1` assessment distinguishes open research from blockers and can report readiness for a later human offer-authorization step. PostgreSQL independently recomputes the assessment before inserting the review and items. Readiness is not authorization: no offer endpoint, document generator, provider transmission, or outreach action is introduced.

Phase 3 milestone 3 records the next human control without crossing into offer production. A verified Cloudflare Access identity is reduced to a SHA-256 fingerprint inside the private Worker; the browser cannot supply or override it. A role-attested acquisitions manager or principal may authorize bounded internal terms or decline against the exact latest ready diligence snapshot. Purchase price, assignment target, earnest money, inspection/closing periods, and a 24/48/72-hour validity period are constrained by the current base underwriting. PostgreSQL independently rechecks evidence linkage and economics. Authorizations, declines, and revocations are append-only, and the current projection becomes stale or expired automatically. No document, signature, delivery, provider, or outreach component exists.

Phase 3 milestone 4 adds an internal document-preparation boundary without seller-facing release. A current, unexpired authorization may create an immutable `internal-offer-terms-v1` snapshot. The browser supplies only control attestations, role, and preparation notes; PostgreSQL assembles seller identity, property address, terms, expiry, fixed classification, fixed notice, and required next reviews from canonical records. Each revision receives a database-computed SHA-256 content fingerprint. The private UI can inspect the record but exposes no file export, signature, delivery, provider, or outreach action.

Phase 3 milestone 5 adds provider-neutral seller-document governance. Centrally administered append-only capability events replace self-attested roles for release operations. Separate immutable ledgers hold legal-document versions and approval/rejection/revocation evidence, release-control manifests and final human decisions/revocations, and future signature/delivery evidence. Every manifest begins with the exact current Milestone 4 draft and binds its hash/template version to exact approved Arizona contract and wholesale-disclosure versions, revalidation hashes, consent/suppression controls, retention, and idempotency. Because no approved legal artifacts were supplied, no artifact is seeded and the private Worker exposes read-only blockers only; seller-facing generation, signature, delivery, providers, and outreach remain unavailable. The public Worker is unchanged.

Phase 3 milestone 6 adds a PII-minimized system integrity projection and centrally administered emergency hold. PostgreSQL triggers block release-package preparation, final release decisions, signature events, and delivery events while the newest hold event is active. The integrity model reports hold state, separation-of-duties violations, invalid downstream evidence, retention review, and minimized counts. The private Worker exposes read-only health only; the public Worker and all provider boundaries remain unchanged.

### GitHub

GitHub is the canonical source repository and deployment history.

### Cal.com

Cal.com is used downstream for qualified seller appointments.

### Resend

Resend is used for permitted transactional and relationship-based communication, not unsolicited bulk cold email.

## Engineering Principle

Use deterministic software for deterministic decisions.

Use AI only when interpretation, synthesis, extraction, classification, or reasoning adds meaningful value.
