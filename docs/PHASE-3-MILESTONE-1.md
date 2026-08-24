# Phase 3 Milestone 1 — Seller Inquiry to Human Acquisition Decision

## Outcome

The authenticated Seller Inquiries desk connects one inbound inquiry to a normalized property, evidence-backed verification, deterministic underwriting, explainable buyer-demand analysis, and an append-only human acquisition decision. The public seller Worker is unchanged.

## Operating flow

1. An operator opens the acquisition evidence workflow for a non-ineligible inquiry.
2. The operator cites an exact public-record or human-verification source, retrieval time, verified parcel, recorded owner, authority status, confidence, and bounded underwriting inputs.
3. PostgreSQL transactionally persists the existing `OpportunityEvaluation` envelope, the acquisition case, the immutable verification, and a minimized audit event.
4. The operator runs the existing `buyer-demand-v1` model against active buyer profiles. The run, buyer snapshots, criterion evidence, and revised evaluation remain immutable.
5. A human records `ADVANCE_TO_ACQUISITION_REVIEW`, `HOLD_FOR_RESEARCH`, or `DECLINE` with rationale and control attestations.

## Advance gate

Advance requires the latest evaluation, a non-rejected underwriting state, verified property identity, matched owner, verified seller authority, current buyer-demand evidence, material-fact review, consent-boundary review, and acknowledgement that the decision neither generates nor authorizes an offer. The Worker and PostgreSQL both enforce the gate.

Hold and decline remain available when evidence is incomplete so an operator can record a truthful decision without fabricating support.

## Privacy, consent, cost, and provenance

- opening research is limited to zero-cost public-record or completed human-verified evidence;
- the exact source, URL, retrieval time, evidence class, confidence, and verification notes are retained;
- seller-reported intake remains immutable and distinct from verified evidence;
- no external provider adapter is called and no personal information is transmitted;
- acquisition decisions do not change channel permissions or inquiry status;
- no seller or buyer outreach is initiated;
- no offer or contract language is generated;
- service-role update and delete are revoked from case, verification, and decision tables.

## Deferred work

Paid property, AVM, title, lien, and advanced skip-trace providers remain inactive. Offer preparation, communications, disposition automation, and geographic expansion require separate explicit authorization and compliance review.
