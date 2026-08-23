# Phase 2 Seller Intake, Scheduling, and Transactional Communication

## Operational boundary

The public seller portal is served at `https://sell.gns-success.com`. The private opportunity desk remains at `https://wholesale.gns-success.com` behind Cloudflare Access. Only the bounded `POST /api/seller/intake` endpoint and seller assets are public on the seller hostname.

The intake flow records one seller-authored submission, a deterministic `seller-intake-v1` assessment, channel-specific consent evidence, status history, any Cal.com appointment offer, and Resend delivery outcomes. A browser-generated submission UUID makes a retry idempotent. The Worker also enforces a request-size limit, a short completion-time check, a honeypot, and a Cloudflare rate-limiting binding.

## Qualification

The deterministic model considers the current target counties, reported authority, desired timeline, motivation, property condition, and intake completeness. It produces `PRIORITY`, `REVIEW`, `NURTURE`, or `INELIGIBLE`, with reason codes and human-review flags. This is routing evidence, not an offer, valuation, appraisal, or legal conclusion. Reported ownership or representative authority must still be verified before a transaction.

## Contact permission

Email, call, and text permission are separate. Supplying an email address or phone number does not grant any channel. Every channel receives its own immutable consent event, including a negative event when permission was not selected.

The system currently sends only a seller acknowledgement email when the seller checked email permission and an internal operator notification that omits the seller's name, email, phone, address, notes, and financial figures. No calling or texting adapter exists. Status changes in the private desk do not initiate contact.

## Cal.com and Resend

For an eligible inquiry, the Worker resolves a public Cal.com booking URL using the configured URL, configured event-type ID, a sole public event type, or one unambiguous seller-related event. This lookup sends no seller data to Cal.com. The seller chooses whether to follow the booking link and enters booking information directly with Cal.com.

Resend receives the minimum data needed for a consented seller acknowledgement: recipient email, seller name, property address, inquiry reference, and the booking link when one was offered. Resend idempotency keys prevent duplicate messages during retry. Provider message IDs or minimized error codes are stored; message bodies are not copied into audit events.

## AI boundary

The dashboard shows a deterministic evidence summary. No seller submission is transmitted to an AI provider in this milestone. AI-assisted intake remains a separate Phase 2 item requiring a documented provider, data minimization, retention, prompt/version provenance, human review, and explicit activation.

