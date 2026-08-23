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
