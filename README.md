# GNS Success Wholesale Engine

Private real-estate acquisition, underwriting, qualification, and opportunity-ranking platform for GNS Success.

## Primary Objective

Automatically discover, qualify, underwrite, reject, and rank residential wholesale opportunities, targeting a minimum assignment fee of $10,000.

## Initial Markets

- Pinal County, Arizona
- Maricopa County, Arizona

## Core Stack

- Cloudflare Workers
- Cloudflare Workflows
- Supabase / PostgreSQL
- GitHub / GitHub Actions
- Cal.com
- Resend

## Core Philosophy

Public/free data → deterministic qualification → aggressive rejection → selective enrichment → highly qualified human closing.

The system should minimize low-value human work and surface only opportunities that plausibly justify the operators' attention.

See `/docs` for architecture and implementation documentation.

## Phase 2 operational milestone

Phase 2 includes a durable opportunity desk, gated property-evidence workflow, buyer database, explainable buyer-demand matching, selective skip tracing, public seller intake, and human-reviewed AI assistance:

- normalized property, owner, ownership, distress-event, evaluation, pipeline, and audit records persist in one database transaction;
- repeated evaluation requests are idempotent;
- the dashboard shows the latest evaluation for every county/APN in a ranked, filterable queue;
- every opportunity exposes its evaluation history;
- operators can record typed property facts with source, retrieval time, confidence, classification, and cost evidence;
- the dashboard links to a searchable Deal Research Guide that maps official sources and professional evidence to every operator field and AI-agent handoff;
- paid enrichment is denied until an opportunity passes explicit qualification, score, spread, confidence, and cost gates;
- underwriting facts create a new immutable evaluation instead of silently changing an existing score;
- buyer profiles preserve contact standing, source, observed performance, and explicit county/ZIP/property/economic buy-box criteria;
- buyer updates are auditable and records are paused, archived, or marked do-not-contact instead of deleted;
- buyer matching compares recorded property evidence with active, contact-eligible buy boxes and separates probable, possible, excluded, and ineligible results;
- each match retains criterion-level outcomes, a buyer snapshot, credibility evidence, probable-buyer count, and model version;
- a modeled buyer-demand score creates a new immutable opportunity evaluation rather than overwriting provisional input;
- database responses are runtime-validated before they reach the browser;
- a rolling-release fallback preserves Phase 1 writes until the Phase 2 migration is applied;
- selective skip tracing opens only one qualified, 80+ score, $10,000+ spread, owner-confident opportunity at a time;
- each contact-research case records necessity, privacy minimization, intended source, bounded cost, provenance, and immutable findings;
- contact standing is append-only and separate from contact data, with do-not-contact suppression and explicit eligible channels;
- the skip-tracing boundary has no provider adapter, bulk endpoint, external transmission, or outreach action;
- an independently deployed public seller Worker records inbound property facts, deterministic qualification, and explicit channel permissions from an isolated asset bundle with no route into the private dashboard;
- eligible sellers receive a Cal.com booking option without the Worker sending seller data to Cal.com;
- Resend sends consented transactional acknowledgements and PII-minimized operator notifications with idempotent delivery evidence;
- seller submissions, consent, status, appointment offers, and delivery history are append-only and auditable;
- authenticated operators can prepare a versioned AI-review packet that excludes seller identity, contact values, address, APN, exact financial amounts, and notes;
- the application never sends that packet to an AI provider; imported structured results require provider/model provenance and a written human decision;
- AI assistance is advisory and cannot change qualification, contact permissions, inquiry status, booking, or outreach.

Apply the migrations in `supabase/migrations/` in filename order. The private and public Workers build separately with `npm run build` and `npm run build:seller`. See [`docs/PHASE-2-SELLER-INTAKE.md`](docs/PHASE-2-SELLER-INTAKE.md), [`docs/PHASE-2-AI-ASSISTED-SELLER-INTAKE.md`](docs/PHASE-2-AI-ASSISTED-SELLER-INTAKE.md), and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Phase 3 operational milestone 1

The private Seller Inquiries desk now connects one inbound inquiry to cited zero-cost property/ownership research, a deterministic immutable underwriting evaluation, the existing explainable buyer-demand model, and an append-only human advance/hold/decline decision. The database independently rechecks the evidence and advance gates. This workflow does not transmit data to a provider, contact a seller or buyer, or generate or authorize an offer. Apply `202608240001_phase3_seller_acquisition_workflow.sql`; see [`docs/PHASE-3-MILESTONE-1.md`](docs/PHASE-3-MILESTONE-1.md) and [`docs/PHASE-3-SESSION-NOTE.md`](docs/PHASE-3-SESSION-NOTE.md).

## Phase 3 operational milestone 2

An advanced acquisition case now exposes a private 13-part diligence workspace. Every review is immutable, fully sourced, zero-cost, tied to the current evaluation/buyer-demand/advance evidence, and independently assessed again in PostgreSQL as open, blocked, or ready to present for a separate human offer-authorization decision. Readiness does not authorize or generate an offer and does not permit outreach. Apply `202608240002_phase3_acquisition_diligence.sql`; see [`docs/PHASE-3-MILESTONE-2.md`](docs/PHASE-3-MILESTONE-2.md) and [`docs/PHASE-3-MILESTONE-2-COMPLETION.md`](docs/PHASE-3-MILESTONE-2-COMPLETION.md).

## Phase 3 operational milestone 3

The private acquisition workflow now records an expiring, revocable human authorization or decline for bounded internal terms against the exact latest ready diligence evidence. Actor identity is derived from Cloudflare Access and stored as a one-way fingerprint; PostgreSQL independently rechecks evidence linkage, economics, timing, and duplicate-active-authority controls. This milestone still cannot generate a document, create a signature request, send an offer, call a provider, or initiate outreach. Apply `202608240003_phase3_offer_authorization.sql`; see [`docs/PHASE-3-MILESTONE-3.md`](docs/PHASE-3-MILESTONE-3.md) and the [`completion note`](docs/PHASE-3-MILESTONE-3-COMPLETION.md).

## Phase 3 operational milestone 4

The private acquisition workflow can now prepare an immutable, versioned internal offer-terms draft from the exact current authorization. PostgreSQL assembles the snapshot from canonical seller and authorization records, computes its SHA-256, and preserves each revision. The record is not an approved seller-facing offer, contract, or disclosure; no file export, signature request, delivery, provider, or outreach action exists. Apply `202608240004_phase3_internal_offer_drafts.sql`; see [`docs/PHASE-3-MILESTONE-4.md`](docs/PHASE-3-MILESTONE-4.md) and the [`completion note`](docs/PHASE-3-MILESTONE-4-COMPLETION.md).

## Phase 1 foundation

The repository now contains an operational Arizona trustee-sale screening slice:

- manual lead evaluation in a private operator dashboard;
- CSV batch import (500 rows / 2 MB maximum);
- county/APN normalization and batch deduplication;
- downside, base, and upside underwriting;
- configurable investor factor, risk buffer, seller-net floor, and assignment target;
- machine-readable rejection/review reasons;
- transparent 0–100 scoring and next-action routing;
- optional Supabase persistence through a versioned migration;
- Cloudflare Worker + static-assets deployment configuration.

### Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Open the local URL printed by Wrangler. Supabase values may remain blank for stateless local evaluation. CSV operators can start with the template at `apps/dashboard/public/trustee-sale-template.csv`.

### Verify

```bash
npm run cf-typegen
npm run typecheck
npm test
npm run build
```

Production deployment and secret setup are documented in `docs/DEPLOYMENT.md`.

Phase 3 Milestone 5 adds central permission, legal-version, release-decision, signature-history, and delivery-history governance while keeping seller-facing generation and all provider actions unavailable.

Phase 3 Milestone 6 adds deterministic document-governance integrity monitoring and a database-enforced central emergency hold.

Phase 3 Milestone 7 closes the phase with a canonical hashed governance manifest and an independently administered activation interlock that remains closed.

For the original screening-engine recap, read [`docs/PHASE-1-SESSION-NOTE.md`](docs/PHASE-1-SESSION-NOTE.md).
