# Phase 3 Milestone 5 — Seller Document Release Governance

## Outcome

The private acquisition desk can inspect a deterministic, provider-neutral governance boundary that begins with the exact current Milestone 4 draft and its database-computed SHA-256. It does not generate a seller-facing document, create a signature request, deliver anything, or contact anyone.

Approved legal artifacts were not available for this implementation. The migration therefore seeds no contract, disclosure, legal language, approval evidence, permission, provider, release package, signature event, or delivery event. The live boundary truthfully reports these controls as missing.

## Separated ledgers

1. Centrally administered capability events grant or revoke preparation, approval, revocation, signature-recording, and delivery-recording capabilities. Browser role attestation cannot create a permission.
2. Legal-document versions bind an Arizona purchase-contract version and Arizona wholesale-disclosure version to exact SHA-256 hashes, storage references, retention dates, and append-only approval, rejection, or revocation evidence.
3. Release-control packages bind the exact current internal draft hash and template version to exact approved legal versions, a canonical manifest hash, identity/property/terms hashes, consent/suppression revalidation, retention, and an idempotency key. Final approval or rejection is a separate append-only human decision, and revocation is another event.
4. Signature and delivery tables retain provider-neutral, append-only hashes, provenance, retention, and idempotency. The Worker has no insert or execute permission for either ledger and has no provider binding or action.

Preparation, final approval, signature evidence, and delivery evidence are separate records. A release approver cannot be inferred from a preparer-selected role. Database permissions and current projections, not browser claims, determine capability.

## Deterministic entry status

The application and PostgreSQL report release-control preparation eligible only when the latest draft is exact and current, its authorization remains active, exact Arizona contract and wholesale-disclosure versions have current approval evidence, and the Access-derived actor fingerprint has a current centrally administered preparation permission. Any premature provider, generation, signature, or delivery capability violates the application gate.

The persistence model reserves immutable revalidation evidence for seller identity, property, exact terms, channel consent, suppression, document provenance, hashes, retention, and idempotency. No personal information is duplicated into governance status or application logs.

## Current safety boundary

- Seller-facing document generation: unavailable.
- Final seller-facing release: unavailable because no approved legal versions exist.
- Signature request or envelope creation: unavailable.
- Delivery: unavailable.
- Provider selection, activation, purchase, or calls: unavailable.
- Seller or buyer outreach: unavailable.

These capabilities require separately supplied and evidenced approved legal artifacts, centrally administered permission records, explicit provider authorization where applicable, and a later deployment that preserves all Milestone 5 controls.
