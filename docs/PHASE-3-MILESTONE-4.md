# Phase 3 Milestone 4 — Controlled Internal Offer Drafts

## Outcome

The authenticated acquisition desk can prepare an immutable internal offer-terms draft from the exact current authorization. PostgreSQL—not the browser—assembles the content from the authoritative seller inquiry and authorized terms, assigns a revision number, and records a SHA-256 content fingerprint.

This is controlled document preparation, not a seller-facing offer. The generated record is visibly classified `INTERNAL_DRAFT_NOT_FOR_DELIVERY` and states that it is not an offer, contract, disclosure, signature instrument, or permission to contact the seller.

## Entry gate

The Worker and PostgreSQL both require:

- the current acquisition case and inquiry;
- the exact latest authorization with effective status `AUTHORIZED`;
- current linked evaluation, buyer-demand run, acquisition decision, and diligence review;
- an authorization that has not expired;
- a Cloudflare Access actor fingerprint derived inside the Worker;
- acquisitions-manager or principal role attestation;
- explicit acknowledgement that the authorization was reconfirmed and the draft remains internal;
- mandatory legal/disclosure review and false seller-facing approval;
- explicit no-signature, no-delivery, and no-outreach controls.

## Server-assembled content

`internal-offer-terms-v1` contains only:

- an internal-only classification and title;
- seller name and property address from the immutable inquiry;
- the exact authorized purchase ceiling, assignment target, earnest money, inspection period, and closing period;
- the authorization expiry;
- the fixed no-offer/no-contract notice;
- the three required next reviews: approved legal template, approved wholesale disclosure, and final human release.

The browser submits no seller name, address, terms, expiry, notice, or document body. PostgreSQL builds the JSON snapshot, hashes its canonical `jsonb` representation, and stores it with the append-only revision.

## Immutable lifecycle

Drafts are append-only. Repreparing under the same authorization creates the next revision; it never updates the prior record. The latest projection reports `CURRENT`, `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_REVOKED`, or `AUTHORIZATION_STALE` according to the current authorization state.

## Safety boundary

Milestone 4 does not:

- create an Arizona purchase contract or approved wholesale disclosure;
- claim that `internal-offer-terms-v1` is legally approved seller-facing language;
- create a PDF, downloadable file, signature envelope, or signature request;
- deliver, email, text, print, or present a draft to a seller or buyer;
- alter consent or contact standing;
- call a document, signature, communications, property, title, lien, AVM, or AI provider;
- initiate outreach.

Seller-facing document approval, signature, and delivery remain a separate milestone requiring approved legal templates and disclosures, centrally administered permissions, release controls, communication-consent enforcement, and explicit authorization.
