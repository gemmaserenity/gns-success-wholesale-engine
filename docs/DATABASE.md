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
