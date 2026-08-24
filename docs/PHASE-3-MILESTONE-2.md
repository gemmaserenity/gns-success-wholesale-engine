# Phase 3 Milestone 2 — Acquisition Diligence and Offer Readiness

## Outcome

The authenticated Seller Inquiries desk now carries an advanced acquisition case into a complete, evidence-backed diligence review. It preserves open research and blockers explicitly and can report that the case is ready to be presented for a separate human offer-authorization decision. It does not create that decision or an offer.

## Entry gate

A review is accepted only when:

- the inquiry and acquisition case match;
- the referenced opportunity evaluation is still the newest evaluation for the property;
- the referenced buyer-demand run is still the newest run for the property;
- the newest acquisition decision is `ADVANCE_TO_ACQUISITION_REVIEW` and references those same records;
- the operator confirms that no offer was generated and no outreach was initiated.

The Worker checks this gate before persistence. PostgreSQL checks it again inside the transaction.

## Evidence checklist

Every review contains exactly one immutable record for each of these checks:

1. property identity;
2. owner identity;
3. seller authority;
4. title;
5. liens and payoffs;
6. taxes;
7. distress timeline;
8. occupancy;
9. condition and repairs;
10. value support;
11. buyer demand;
12. wholesale disclosure;
13. consent and communications.

Each item records `SATISFIED`, `OPEN`, `BLOCKED`, or `NOT_APPLICABLE`, plus a source type and name, exact URL where required, review time, confidence, notes, and a fixed direct cost of zero. Property identity, owner identity, seller authority, title, liens/payoffs, taxes, condition/repairs, value support, buyer demand, and wholesale disclosure must be satisfied; they cannot become ready through `NOT_APPLICABLE`.

## Deterministic readiness

`acquisition-diligence-v1` produces only:

- `BLOCKED` when any item contains a material blocker;
- `NEEDS_RESEARCH` when an item remains open, a required item is marked not applicable, or material facts are not current;
- `READY_FOR_HUMAN_OFFER_AUTHORIZATION` when no blockers or required gaps remain and the operator confirms material facts are current.

The database derives the result independently and rejects a mismatched client assessment. A later review appends a new snapshot; it never rewrites earlier evidence.

## Safety boundary

The word “readiness” is literal. Milestone 2 does not:

- authorize an offer;
- calculate or draft offer terms;
- create or send a document;
- call a property, title, lien, AVM, AI, skip-trace, email, phone, or text provider;
- transmit personal information externally;
- change seller consent or contact standing;
- initiate seller or buyer outreach.

Those capabilities remain unavailable and require separate explicit authorization, compliance review, cost approval, implementation, and deployment.

## Persistence and audit

Migration `202608240002_phase3_acquisition_diligence.sql` adds append-only review and item tables, a latest-review projection, and one restricted service-role function. Update and delete are revoked from the service role. Audit details retain identifiers, readiness, item counts, zero cost, and false offer/outreach flags without duplicating diligence narrative or seller PII.
