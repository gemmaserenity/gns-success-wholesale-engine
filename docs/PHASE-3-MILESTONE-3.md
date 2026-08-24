# Phase 3 Milestone 3 — Internal Offer Authorization

## Outcome

The authenticated acquisition desk can record a human authorization or decline for bounded internal terms after the latest diligence review is ready. An authorization expires, can be revoked, and becomes stale automatically when its evidence changes. It is not a seller-facing offer and cannot generate or send one.

## Entry gate

The Worker and PostgreSQL both require:

- the acquisition case and inquiry to match;
- the newest opportunity evaluation and buyer-demand run;
- the newest `ADVANCE_TO_ACQUISITION_REVIEW` decision linked to those records;
- the newest `READY_FOR_HUMAN_OFFER_AUTHORIZATION` diligence review linked to all three;
- renewed material-fact and wholesale-disclosure review;
- explicit acknowledgement that authority is internal only and creates no offer or outreach;
- a current server timestamp and a verified Cloudflare Access actor fingerprint.

The actor fingerprint is a SHA-256 digest of the Access-authenticated email created inside the Worker. The browser cannot submit or override it. The authorizer selects `ACQUISITIONS_MANAGER` or `PRINCIPAL` as a recorded role attestation. This milestone does not claim that the attestation is centrally administered RBAC.

## Bounded internal terms

An authorization records exact integer-cent limits for:

- maximum purchase price;
- assignment-fee target of at least $10,000;
- earnest money of no more than $10,000 and no more than purchase price;
- inspection period of 1–30 days;
- closing period of 1–60 days and not shorter than inspection;
- validity of 24, 48, or 72 hours.

Purchase price cannot exceed the base scenario's maximum contract for the target fee. Purchase price plus the assignment target cannot exceed the base investor purchase ceiling. These checks occur in both deterministic application logic and PostgreSQL.

## Immutable lifecycle

Each authorization or decline is append-only. A current diligence review cannot receive a second active authorization. A revocation is a separate append-only event against only the latest authorized record. The latest projection reports:

- `AUTHORIZED`;
- `DECLINED`;
- `REVOKED`;
- `EXPIRED`;
- `STALE` when any linked evaluation, buyer run, acquisition decision, or diligence review is superseded.

## Safety boundary

Milestone 3 does not:

- generate offer language, a contract, disclosure, letter, PDF, or other document;
- create a signature envelope;
- send or present terms to a seller or buyer;
- alter consent or contact standing;
- call an external property, title, lien, AVM, AI, communications, signature, or document provider;
- initiate email, phone, text, mail, or other outreach.

Any seller-facing offer production or delivery remains a separate milestone requiring explicit authorization, approved templates/disclosures, centrally administered permissions, document provenance, versioning, retention, signature controls, and communication consent enforcement.
