# Phase 3 Milestone 6 — Document Governance Integrity and Emergency Hold

## Outcome

The private Seller Inquiries desk exposes a read-only, PII-minimized health assessment for the complete document-governance boundary. PostgreSQL also enforces a centrally administered global hold before any release package, final release decision, signature event, or delivery event can be inserted.

## Integrity model

`seller-document-governance-integrity-v1` deterministically reports `HEALTHY`, `HOLD`, or `VIOLATION`. It checks:

- whether the newest central hold event is `HOLD`;
- preparer/final-decision separation;
- signature or delivery evidence without a currently approved release;
- overdue retention review across legal versions, release packages, signatures, and deliveries;
- current counts of approved Arizona legal versions, active central permissions, release packages, signatures, and deliveries.

Missing legal approvals or permissions remain truthful readiness blockers, not integrity violations. They keep release unavailable through Milestone 5.

## Emergency control

Hold and release events are append-only, idempotent, fingerprinted, reasoned, and evidence-referenced. The browser and Worker service role cannot create them. A database trigger independently blocks downstream preparation, approval, signature, and delivery during a hold. Revocation remains available so an unsafe release can still be withdrawn.

## Safety boundary

No hold, legal approval, permission, release, signature, delivery, provider, or outreach record is seeded. The Worker adds only a read-only status route and dashboard panel. Seller-facing generation, signature requests, delivery, providers, and outreach remain unavailable.
