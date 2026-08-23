# Phase 2 Milestone 1 — Durable Opportunity Desk

**Implemented:** August 23, 2026

## Outcome

The first Qualification and Acquisition milestone turns Phase 1 evaluation snapshots into a durable operating queue. Each new evaluation now has normalized, auditable database relationships, and operators can return later to see the latest state and prior evaluations for the same property.

## Operator workflow

1. Evaluate a property manually or through CSV as before.
2. Open **Opportunity queue**.
3. Filter by pipeline state or county.
4. Review the latest county/APN record, ranked by score.
5. Select **View history** to compare previous scores, actions, and base assignment estimates.

The queue deliberately shows one current card per property. It does not erase older conclusions; history remains append-only.

## Persistence contract

One transactional RPC now writes:

- source provenance;
- normalized property;
- normalized owner and ownership interest;
- notice-of-trustee-sale distress event;
- immutable opportunity evaluation;
- system pipeline event and reason codes;
- audit event linking the created records.

Repeated calls with the same evaluation UUID are safe. Re-evaluating the same property with a new UUID creates a new history entry and updates its current queue card.

## API additions

- `GET /api/opportunities` returns the latest evaluation per property and supports `state`, `county`, and bounded `limit` filters.
- `GET /api/opportunities/history?county=…&apn=…` returns newest-first evaluation history.

Both endpoints remain behind Cloudflare Access in production. Supabase credentials never enter browser code, and database JSON is validated before it is returned.

## Release order

Apply `supabase/migrations/202608230001_phase2_opportunity_history.sql`, then deploy the Worker. During a rolling release, Phase 1 persistence remains available if the new RPC is not yet present; the dashboard displays a precise migration notice instead of presenting an empty queue as authoritative.

## Next milestone

Use the normalized property queue to add improved property enrichment behind explicit confidence and cost gates. Buyer records and evidence-based buyer-demand scoring should follow once those enriched property facts are reliable enough to support matching.
