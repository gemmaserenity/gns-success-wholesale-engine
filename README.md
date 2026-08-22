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

## Phase 1 working milestone

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
