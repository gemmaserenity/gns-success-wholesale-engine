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

Phase 2 now includes a durable opportunity desk and gated property-evidence workflow:

- normalized property, owner, ownership, distress-event, evaluation, pipeline, and audit records persist in one database transaction;
- repeated evaluation requests are idempotent;
- the dashboard shows the latest evaluation for every county/APN in a ranked, filterable queue;
- every opportunity exposes its evaluation history;
- operators can record typed property facts with source, retrieval time, confidence, classification, and cost evidence;
- paid enrichment is denied until an opportunity passes explicit qualification, score, spread, confidence, and cost gates;
- underwriting facts create a new immutable evaluation instead of silently changing an existing score;
- database responses are runtime-validated before they reach the browser;
- a rolling-release fallback preserves Phase 1 writes until the Phase 2 migration is applied.

Apply the migrations in `supabase/migrations/` in filename order. The property-evidence workflow requires `202608230002_phase2_property_enrichment.sql`. See [`docs/PHASE-2-MILESTONE-1.md`](docs/PHASE-2-MILESTONE-1.md) for the earlier durable-desk handoff and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for current deployment checks.

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

For the original screening-engine recap, read [`docs/PHASE-1-SESSION-NOTE.md`](docs/PHASE-1-SESSION-NOTE.md).
