# Database

Supabase/PostgreSQL is the canonical database.

Expected domain areas include:

- properties
- property identifiers
- owners
- ownership interests
- recorded documents
- distress events
- mortgages
- liens
- valuations
- comparables
- repair estimates
- underwriting runs
- opportunity scores
- contacts
- enrichment
- conversations
- appointments
- buyers
- buyer criteria
- buyer matches
- compliance
- workflow runs
- model runs
- audit events

The exact normalized schema will be implemented through migrations in:

supabase/migrations/

## Phase 1 schema

Migration `202608220001_phase1_opportunity_screening.sql` establishes source provenance, normalized property/owner/distress foundations, immutable evaluations, auditable pipeline events, human overrides, indexes, constraints, and row-level security. Authenticated operators receive read access; the private Worker performs ingestion with its modern server-side Supabase secret key. Human overrides require the logged-in operator's own user ID and a written rationale.

## Phase 2 milestone 1

Migration `202608230001_phase2_opportunity_history.sql` activates the normalized foundation. The private `persist_opportunity_evaluation(jsonb)` function writes the source record, property, owner, ownership interest, distress event, immutable evaluation, system pipeline event, and audit event in one PostgreSQL transaction. The function is executable only by `service_role`, uses a fixed search path, and is idempotent for a repeated evaluation UUID.

`current_opportunities` is a security-invoker view that returns only the newest evaluation for each normalized `AZ:<COUNTY>:<APN>` key, plus the number of historical evaluations. Historical Phase 1 evaluations remain visible even when their new property foreign key is null; all new Phase 2 writes receive the normalized links.

## Phase 2 property enrichment

Migration `202608230002_phase2_property_enrichment.sql` adds structured property attributes, immutable enrichment runs, and evidence-backed property facts. Each fact records its provider, source type and URL, retrieval time, classification, confidence, and allocated cost. `property_facts.is_current` provides a current projection without deleting superseded evidence.

The restricted `persist_property_enrichment(jsonb, jsonb, jsonb)` function validates the gate again in PostgreSQL, then atomically stores the run and facts, updates structured property fields, optionally persists a new immutable opportunity evaluation, and records an audit event. Repeating the same run UUID is idempotent. The security-invoker `property_enrichment_status` view supplies the dashboard with current facts and cumulative run cost.

## Phase 2 buyer database

Migration `202608230003_phase2_buyer_database.sql` creates normalized `buyers` and `buyer_criteria` tables. A buyer profile records identity, contact information and standing, provenance, operating status, verified purchase and GNS closing counts, retrades, and an optional evidence-based reliability score. Criteria record counties, ZIPs, property types, purchase price, ARV, repair tolerance, size, year built, HOA preference, occupancy, close speed, and financing.

The restricted `persist_buyer_profile(jsonb)` function creates or updates both records in one transaction and records an audit event. Profiles are never deleted through the application; operators use paused, archived, or do-not-contact states. The security-invoker `buyer_profiles` view provides one runtime-validated profile per buyer to the private Worker. This milestone does not create buyer matches or change opportunity scores.

## Phase 2 buyer-demand matching

Migration `202608230004_phase2_buyer_demand_matching.sql` creates immutable `buyer_match_runs` and criterion-level `buyer_matches`. Each run links its source evaluation, normalized property, model version, property snapshot, aggregate demand score, probable/possible/eligible counts, and the revised evaluation it produced. Each buyer result retains the buyer profile snapshot used at analysis time, fit and credibility scores, classification, reason codes, and every criterion outcome.

`persist_buyer_match_run(jsonb, jsonb)` validates aggregate counts, verifies referenced buyers and the property/evaluation relationship, persists the new opportunity evaluation, stores the run and matches, and writes an audit event in one transaction. Repeating a source evaluation is idempotent. `latest_buyer_match_status` returns the newest auditable analysis for each property. The migration also permits `hoaStatus` as a structured property fact.

## Phase 2 selective skip tracing

Migration `202608230005_phase2_selective_skip_tracing.sql` creates single-opportunity `skip_trace_cases`, immutable `skip_trace_findings`, and append-only `seller_contact_standing_events`. `create_skip_trace_case(jsonb, jsonb)` rechecks the persisted opportunity, current owner interest, 80+ score, $10,000+ base spread, 0.65+ owner confidence, cost ceiling, attestations, research-only boundary, and owner-level do-not-contact suppression. One source evaluation can create only one case.

`persist_skip_trace_result(jsonb)` validates evidence count and cost allocation, closes the case, defaults previously unreviewed owners to unknown standing, and writes a PII-minimized audit event. `record_seller_contact_standing(jsonb)` appends a separate standing event and requires explicit channels for consent or an existing relationship. `latest_skip_trace_status` returns the latest case, findings, and current standing to the private Worker.

## Phase 2 seller intake

Migration `202608230006_phase2_seller_intake.sql` adds immutable seller submissions, deterministic qualification assessments, channel-level consent events, append-only operator status events, Cal.com appointment offers, and Resend delivery outcomes. The original seller-authored facts and consent snapshot are never updated.

`persist_seller_inquiry(jsonb, jsonb)` enforces privacy acceptance, basic bot controls, channel/contact consistency, and a single idempotent submission UUID before storing the intake and its evidence in one transaction. `record_seller_communication_delivery(jsonb)` and `record_seller_inquiry_status(jsonb)` append provider and operator history. `current_seller_inquiries` supplies the private Worker with the current status while preserving every underlying event.

## Phase 2 AI-assisted seller intake

Migration `202608230007_phase2_ai_assisted_seller_intake.sql` creates immutable `seller_ai_review_packets`, `seller_ai_assistance_results`, and `seller_ai_assistance_reviews`. A packet stores only versioned, coded facts plus a SHA-256 fingerprint; database validation limits its top-level fields. The original inquiry remains authoritative and unchanged.

`prepare_seller_ai_review_packet(jsonb)` is idempotent for an inquiry, schema versions, and payload fingerprint. `record_seller_ai_assistance(jsonb, jsonb)` stores provider/model provenance and a mandatory human decision in one transaction. Service-role update and delete are revoked. `current_seller_ai_assistance` exposes the latest packet and reviewed result to the private Worker. Audit payloads contain control metadata but not seller PII, the minimized input, or AI narrative.

## Phase 3 seller acquisition workflow

Migration `202608240001_phase3_seller_acquisition_workflow.sql` creates one `seller_acquisition_cases` record per inquiry, one immutable `seller_property_verifications` record for the opening evidence, and append-only `seller_acquisition_decisions`. `persist_seller_acquisition_case(jsonb, jsonb, jsonb)` rechecks the supported inquiry, zero-cost evidence boundary, source provenance, and inquiry/evaluation linkage before transactionally persisting the normalized opportunity evaluation and case. `record_seller_acquisition_decision(jsonb)` rechecks the latest evaluation and, for advance decisions, matched ownership, verified authority, a current buyer-demand run, and human attestations. `current_seller_acquisition_cases` supplies the private Worker with the current evidence projection without changing history. Service-role update and delete are revoked from all three tables.

## Phase 3 acquisition diligence

Migration `202608240002_phase3_acquisition_diligence.sql` creates append-only `seller_acquisition_diligence_reviews` and `seller_acquisition_diligence_items`. A review is linked to the exact acquisition case, latest opportunity evaluation, latest buyer-demand run, and latest advance decision. It contains exactly one of every required diligence kind, zero direct cost, source provenance, review time, confidence, notes, open/blocker projections, and a versioned readiness result.

`record_seller_acquisition_diligence(jsonb)` rejects stale or non-advanced cases, invalid or duplicate checklist items, non-zero costs, and unsupported readiness results. PostgreSQL recomputes `acquisition-diligence-v1` and inserts the review, its 13 items, and a minimized audit event in one transaction. `current_seller_acquisition_diligence` returns the newest immutable review per case. Service-role update and delete are revoked; there is no offer-authorization or outreach database function.

## Phase 3 internal offer authorization

Migration `202608240003_phase3_offer_authorization.sql` creates append-only `seller_offer_authorizations` and `seller_offer_authorization_revocations`. An authorization or decline links the exact case, ready diligence review, evaluation, buyer-demand run, and acquisition decision. The record retains a one-way Access actor fingerprint, role attestation, rationale, all control attestations, and—only for authorization—bounded integer-cent terms and expiry.

`record_seller_offer_authorization(jsonb)` rejects stale or non-ready evidence, duplicate active authority on the current review, non-current timestamps, unbounded economics, more than 72 hours of validity, or missing no-generation/no-outreach controls. `revoke_seller_offer_authorization(jsonb)` can revoke only the latest authorized record and appends rather than mutates. `current_seller_offer_authorizations` projects `AUTHORIZED`, `DECLINED`, `REVOKED`, `EXPIRED`, or `STALE`. Service-role update and delete are revoked. No function creates an offer, document, signature, delivery, or communication.

## Phase 3 controlled internal offer drafts

Migration `202608240004_phase3_internal_offer_drafts.sql` creates append-only `seller_offer_drafts`. Each revision links the exact current offer authorization, stores a server-derived Access actor fingerprint and role attestation, and retains preparation notes, `internal-offer-terms-v1` content, a PostgreSQL-computed SHA-256 content fingerprint, and false seller-facing/signature/delivery/outreach state.

`record_seller_offer_draft(jsonb)` accepts no document body from the browser. It requires the latest authorization to remain `AUTHORIZED`, then assembles seller name, property address, exact authorized terms, expiry, fixed internal-only notice, and required next reviews from canonical records. `current_seller_offer_drafts` projects `CURRENT`, `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_REVOKED`, or `AUTHORIZATION_STALE`. Service-role update and delete are revoked. There is no file, signature, delivery, provider, or communication function.

## Phase 3 seller-document release governance

Migration `202608240005_phase3_document_release_governance.sql` adds `seller_document_permission_events`, `seller_legal_document_versions`, `seller_legal_document_approval_events`, `seller_document_release_packages`, `seller_document_release_decisions`, `seller_document_release_revocations`, `seller_document_signature_events`, and `seller_document_delivery_events`. Current views project administered permissions, legal approval state, and release state.

The service role can read governance and call only the minimized status function; it cannot insert central permissions, legal approvals, signature events, or delivery events and cannot update/delete any history. Release packages reserve exact draft/template/legal-version hashes, seller/property/terms hashes, consent/suppression revalidation, retention, provenance, and idempotency. No legal or provider rows are seeded.

## Phase 3 document-governance integrity

Migration `202608240006_phase3_document_governance_integrity.sql` adds append-only `seller_document_governance_hold_events`, the current-hold projection, database triggers across downstream release phases, and `get_seller_document_governance_integrity()`. The service role can read hold state and integrity but cannot insert, update, or delete hold history. The assessment contains only status, reason codes, counts, timestamps, and false capability flags.
