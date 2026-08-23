# Phase 2 — Selective Skip Tracing

**Implemented:** August 23, 2026

## Outcome

Selective skip tracing is an evidence and approval workflow for one persisted opportunity at a time. It is not a bulk-enrichment feature, provider integration, or outreach system.

The application can qualify or deny a proposed research case, document purpose and privacy controls, store completed contact findings as immutable evidence, record seller contact standing separately, and enforce owner-level do-not-contact suppression on later requests.

It cannot call a paid vendor, transmit personal data to an external provider, send a message, place a call, or treat a contact value as permission.

## Qualification gate

A research case is allowed only when:

- the source evaluation is `QUALIFIED` with a score of at least 80;
- the base expected assignment fee is at least $10,000;
- owner identity confidence is at least 0.65;
- estimated cost is no more than the lower of `MAX_SKIP_TRACE_CENTS` and one percent of base expected assignment;
- public/property evidence and known contact standing have been reviewed;
- purpose, necessity, identity basis, privacy minimization, intended source, and provider/source are documented; and
- the owner has no active do-not-contact suppression.

The Worker evaluates the gate and PostgreSQL independently verifies the persisted state, score, spread, owner relationship, confidence, cost, attestations, research-only boundary, and suppression.

## Data and audit model

- `skip_trace_cases` stores approval, qualification snapshot, purpose, source plan, privacy evidence, cost, and outcome.
- `skip_trace_findings` stores immutable findings with subject, identity status, provider, source, retrieval time, classification, confidence, allocated cost, and notes.
- `seller_contact_standing_events` stores append-only owner standing: unknown, consented, existing relationship, do not contact, or deceased. Contact-eligible states require explicit supported channels.
- `latest_skip_trace_status` supplies the private dashboard with the latest case, findings, and current standing.
- `audit_events` receives approval, completion, and standing records without copying contact values into audit payloads.

The first completed case defaults a previously unreviewed owner to `UNKNOWN`. Unknown, do-not-contact, and deceased states permit no channels. Contact information and identity verification remain separate from consent.

Contact PII has no authenticated-client read policy and is returned only through the Cloudflare Access-protected Worker. Do-not-contact standing is sticky: it may remain suppressed or be replaced only by an explicit consent event with supporting reason and source evidence.

## API boundary

- `GET /api/opportunities/skip-trace?evaluationId=…` returns qualification context and the latest case.
- `POST /api/opportunities/skip-trace` opens one gated case without contacting a provider.
- `POST /api/opportunities/skip-trace/results` records evidence obtained outside the application and closes the case.
- `POST /api/opportunities/skip-trace/standing` appends standing without initiating outreach.

There is no bulk endpoint, provider adapter, webhook, queue producer, outreach endpoint, or browser-visible Supabase credential.

## Operator workflow

1. Open **Opportunity queue → Selective skip trace**.
2. Review qualification and document the one-case research plan.
3. If approved, conduct only the authorized research outside the application.
4. Record the result, including no-match outcomes, provenance, identity status, confidence, and actual cost.
5. Review standing separately; leave it unknown unless evidence supports another state.
6. Do not initiate outreach from this workflow.

## Release order

Apply `supabase/migrations/202608230005_phase2_selective_skip_tracing.sql`, then deploy the Worker and assets. Existing workflows remain available during rollout; the skip-trace panel shows a migration notice until the schema is present.

## Deferred intentionally

- provider selection, agreement, credentials, and adapter code;
- transmitting personal/property data externally;
- bulk enrichment or automated identity resolution;
- calling, texting, emailing, or direct-mail initiation; and
- retention/deletion automation pending an approved privacy policy and legal review.
