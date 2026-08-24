# Architecture Decision Log

Record consequential architectural decisions here.

## Initial Decisions

### Cloudflare as orchestration layer

Cloudflare Workers and Workflows are preferred over introducing a separate agent orchestration framework during MVP development.

### Supabase as source of truth

PostgreSQL/Supabase stores persistent business state.

### Deterministic-first architecture

LLMs are used only where reasoning or interpretation adds meaningful value.

### Paid enrichment downstream

Paid property/contact enrichment should occur only after preliminary economic qualification.

### Minimum target assignment

The default business objective is to prioritize opportunities capable of producing at least a $10,000 assignment fee.

## 2026-08-22 — Phase 1 vertical slice

### Worker-native TypeScript without a UI framework

The first milestone uses one Cloudflare Worker plus Workers Static Assets and a dependency-light browser interface. This keeps the free-tier footprint small while sharing the same API for manual and CSV inputs. A larger framework can be introduced only when interaction complexity justifies it.

### Stateless local mode with optional Supabase persistence

Underwriting remains fully usable with no credentials. When `SUPABASE_URL` and the modern `SUPABASE_SECRET_KEY` (`sb_secret_…`) are present, the Worker writes provenance and evaluations to Supabase. The legacy JWT-based `service_role` key is intentionally unsupported. Supabase remains the production source of truth; local stateless mode is a development and demonstration fallback, not production storage.

### Cloudflare Access as the Phase 1 authentication boundary

Production requests require the `Cf-Access-Jwt-Assertion` header, which Cloudflare Access supplies after authentication. The Worker and dashboard must be placed behind an Access application for `wholesale.gns-success.com`; development mode bypasses this edge-only boundary for local work.

### Operator-assisted county ingestion first

Official Maricopa and Pinal Recorder/Assessor sites are preserved as source references, but brittle HTML automation is not a dependency. Manual input and CSV are the viable first adapters while lawful, stable automated endpoints are evaluated.

## 2026-08-23 — Phase 2 durable opportunity desk

### Transactional persistence through a restricted PostgreSQL function

The Worker now sends one validated evaluation envelope to a `security definer` PostgreSQL function restricted to `service_role`. PostgreSQL atomically upserts provenance and normalized entities, inserts the immutable evaluation, and records pipeline and audit evidence. This prevents a network failure midway through several REST calls from leaving a partially persisted opportunity.

### Latest-per-property queue with immutable history

Evaluations remain append-only. A security-invoker view ranks them by normalized county/APN and exposes the newest record with a history count. This preserves evidence changes over time while keeping the operator queue focused on one current card per property.

### Migration-safe Worker rollout

Until the Phase 2 migration reaches an environment, the Worker falls back to the two Phase 1 writes and shows a clear queue migration notice. This allows code and schema to be released without interrupting active screening.

## 2026-08-23 — Phase 2 gated property enrichment

### Public and operator research before paid providers

The first enrichment adapter is provider-neutral and operator-assisted. Public records and permitted free APIs remain the default. A paid run is allowed only for a qualified opportunity scoring at least 80, with at least $10,000 base-case spread, at least 0.65 average input confidence, and a cost no greater than both the configured cap and one percent of the expected assignment fee. The default configured cap is 500 cents.

### Immutable evidence with a current projection

Every enrichment fact is retained with provenance, confidence, classification, retrieval time, and cost allocation. Superseded facts remain historical while one fact per field is marked current. This makes the latest property record useful without erasing how it was obtained.

### Economic enrichment creates a new evaluation

ARV, repairs, debt, liens, property type, square footage, and year built can affect underwriting and therefore create a new immutable evaluation linked to the enrichment run. Informational facts such as bedrooms or mailing address update the evidence record without creating noisy evaluation history.

## 2026-08-23 — Phase 2 buyer database

### Buyer identity and buy box are separate normalized records

Buyer identity, contact standing, provenance, and observed performance belong to `buyers`; market and property criteria belong to `buyer_criteria`. This keeps one operational profile per buyer while making future matching criteria explicit and queryable.

### Contact standing is explicit and deletion is unavailable

The profile distinguishes active, paused, archived, and do-not-contact states. A do-not-contact operating state must match its contact standing at both validation and database layers. The application does not delete buyer profiles, preserving history and suppression evidence.

### No inferred demand before matching evidence exists

Creating a buyer database does not retroactively validate the provisional buyer-demand score. The existing opportunity score remains unchanged until a later deterministic matcher can show which active buyers fit, why they fit, and how many credible buyers exist.

## 2026-08-23 — Explainable buyer-demand scoring

### Probable demand requires fit, contact eligibility, and credibility

An active profile counts as a probable buyer only when it has relationship or opt-in contact standing, no buy-box mismatch, no missing evidence for a constrained criterion, and a credibility score of at least 50. Missing evidence creates a possible match; it is never silently counted as probable demand. Paused, archived, do-not-contact, and unverified-contact profiles cannot contribute probable demand.

### Breadth and quality determine demand

`buyer-demand-v1` combines the number of probable buyers with their average fit and credibility. The score is therefore not a raw buyer-table count. Buyer-level fit uses county, ZIP, property type, target disposition price, ARV, repairs, square footage, year built, occupancy, HOA tolerance, and execution time when constrained. Financing and observed performance remain visible evidence; performance and contact standing determine credibility.

### Matching creates immutable history

A match run snapshots both property inputs and buyer profiles, then creates a new opportunity evaluation with the modeled buyer-demand score. It never edits the source evaluation. One source evaluation can produce only one run, making retries idempotent while a later evaluation can be intentionally recalculated against updated evidence or buyer profiles.

## 2026-08-23 — Selective skip tracing

### Research approval and provider execution are separate boundaries

The application approves and audits one specific research case but has no provider adapter or bulk endpoint. Provider selection, credentials, external transmission, and paid activation remain deferred until explicitly authorized and reviewed.

### Contact evidence and contact standing are separate records

Skip-trace findings are immutable evidence. Seller contact standing is an append-only owner-level event with explicit eligible channels. New contact evidence defaults to unknown standing, so the existence or apparent identity of a phone, email, or address can never authorize outreach.

### Suppression is enforced before further enrichment

The database independently checks the latest owner standing and refuses a new skip-trace case when it is do not contact. Audit payloads record case and control metadata without duplicating contact values.

## 2026-08-23 — Public seller intake and scheduling

### Public acquisition and private operations use separate Workers

`sell.gns-success.com` is bound to `gns-success-seller-portal`, whose asset bundle contains only the seller page and bounded intake write. `wholesale.gns-success.com` is bound separately to `gns-success-wholesale-engine` behind Cloudflare Access. The public Worker has no dashboard routes or assets; the private dashboard keeps only an outbound seller-portal link.

### Inbound contact information is not blanket permission

The portal stores separate email, call, and text decisions, including negative consent evidence. Only an explicitly requested acknowledgement email is automated. No calling or texting adapter exists, and changing an inquiry status does not contact the seller.

### Scheduling is offered without server-side booking

The Worker resolves an eligible event's public Cal.com URL without seller data. The seller voluntarily leaves the portal to schedule. This avoids silently creating an appointment or sending personal information to Cal.com.

### Provider deliveries are minimized and idempotent

Resend acknowledgements use a stable idempotency key. Internal alerts include only an inquiry reference, county, and qualification routing result, directing the operator to the Access-protected dashboard for PII.

## 2026-08-23 — Human-reviewed AI assistance

### Data minimization precedes provider use

The application generates a coded, versioned intake packet that excludes direct identity, contact values, property address, APN, exact financial amounts, and free-text notes. It never sends that packet to an external service. Choosing or activating a provider remains a separately authorized decision.

### AI output is evidence support, not operational authority

Only a bounded structured response can be imported. Provider/model provenance and an operator acceptance, rejection, or revision rationale are mandatory. AI assistance cannot modify the seller submission, deterministic qualification, consent, status, booking, or communication evidence and cannot initiate outreach.

## 2026-08-24 — Phase 3 seller-to-acquisition milestone

### Opening research is zero-cost and atomic

The first Phase 3 case accepts only cited public-record or completed human-verified evidence at zero direct cost. The restricted database function persists the verification, normalized property, underwriting evaluation, case linkage, and audit evidence in one transaction so an inquiry cannot be partially connected to an opportunity.

### Advance is a human evidence decision, not an offer

The application permits advance, hold, or decline decisions. Advance requires the latest non-rejected evaluation, verified parcel identity, matched owner, verified seller authority, and a current buyer-demand run. Every decision preserves a rationale and the no-offer boundary. No case action changes consent, initiates outreach, or drafts transaction terms.

## 2026-08-23 — Phase 3 acquisition-diligence milestone

### Diligence is an immutable checklist, not mutable case state

Each review snapshots all 13 acquisition checks with status, source, retrieval/review time, confidence, notes, and zero cost. Later research creates another review instead of rewriting the earlier one. The application and database both require current evaluation, buyer-demand, and advance-decision linkage.

### Readiness stops before authorization

The deterministic result is limited to `NEEDS_RESEARCH`, `BLOCKED`, or `READY_FOR_HUMAN_OFFER_AUTHORIZATION`. The last state is intentionally phrased as readiness for a future human act: it is not itself authorization. Milestone 2 adds no offer terms, offer generation, sending, signature, provider call, or outreach interface.

## 2026-08-23 — Phase 3 internal offer-authorization milestone

### Authority is evidence-bound, expiring, and revocable

Internal terms may be authorized only against the exact newest ready diligence review and its current evaluation, buyer-demand run, and advance decision. The authorization expires after 24, 48, or 72 hours, becomes stale when any linked evidence changes, and can be revoked only through another append-only event. A current review cannot hold two active authorizations.

### Identity is server-derived and minimized

The private Worker hashes the Cloudflare Access authenticated email and sends only that fingerprint to PostgreSQL. The browser cannot assert the actor identity. The human selects an allowed role as a recorded attestation; centrally administered role assignment remains deferred and the UI states this limitation.

### Internal authorization does not create an offer

The approved values are ceilings and operational limits, not seller-facing language. There is no template engine, document storage, signature integration, delivery action, provider call, or outreach route. Adding any of those is a separately authorized milestone.

## 2026-08-23 — Phase 3 controlled internal offer-draft milestone

### The database owns draft content

The browser never supplies the seller name, property address, terms, expiry, fixed notice, or document body. PostgreSQL reads the current inquiry and authorization, constructs `internal-offer-terms-v1`, assigns the next append-only revision, and computes the content SHA-256. This prevents client-side substitutions and preserves a verifiable snapshot.

### Internal preparation does not authorize release

The draft is classified not for delivery and explicitly requires an approved legal template, approved wholesale disclosure, and final human release. It is not an Arizona purchase contract or approved seller-facing offer. The application exposes no file download, signature request, delivery, provider, or outreach action.
