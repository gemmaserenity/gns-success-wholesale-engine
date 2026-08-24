# Phase 2 AI-Assisted Seller Intake

## Outcome

The private Opportunity Desk can prepare a bounded, privacy-minimized seller-intake packet and record a structured AI response only after an operator reviews it. The application does not select a provider, call an AI API, transmit seller information externally, initiate outreach, or change operational state.

## Privacy boundary

The packet includes only coded facts needed to organize a review: county, claimed relationship, timeline, situation, condition, occupancy, whether financial estimates were supplied, current status, authorized channel names, and the deterministic qualification evidence.

It excludes the seller's name, email, phone, property address, APN, exact financial amounts, and seller-authored notes. A SHA-256 fingerprint binds the stored packet to the exact minimized payload. Preparing the packet is idempotent for the same inquiry state and model versions.

## Provider-neutral workflow

1. An authenticated operator opens a seller inquiry and selects **Prepare minimized packet**.
2. The private Worker builds and stores `seller-ai-input-v1`; no external request occurs.
3. The dashboard displays `seller-ai-prompt-v1` for use only with a provider the operator has separately authorized.
4. The operator imports JSON conforming to `seller-ai-output-v1` and records the exact provider and model.
5. The operator must accept, reject, or request revision with a written rationale.

The only permitted output is a bounded summary, one to six verification questions, typed risk flags, and a typed recommended next review step. Extra fields are rejected. The result cannot contain an outreach instruction, modify contact permissions, change inquiry status, create an appointment, or represent an offer or legal conclusion.

## Immutable evidence and audit

- `seller_ai_review_packets` stores the exact minimized input and fingerprint.
- `seller_ai_assistance_results` stores provider/model provenance and validated structured output.
- `seller_ai_assistance_reviews` stores one mandatory human decision per imported result.
- `audit_events` stores control metadata without copying the packet or AI narrative.
- application grants permit inserts and reads through the service-role boundary but revoke update and delete.

## Deferred activation

Any direct provider integration requires explicit authorization plus provider terms, privacy, retention, training-use, regional processing, cost, and credential review. It must preserve the same minimized schema and must not silently expand the data boundary. No paid AI provider or seller-data transmission is activated by this milestone.
