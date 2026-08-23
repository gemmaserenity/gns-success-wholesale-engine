# Architecture

## Objective

GNS Success Wholesale Engine is designed to convert raw public real-estate distress records into a small number of highly qualified wholesale acquisition opportunities.

## Core Flow

Discovery
→ Normalization
→ Property Resolution
→ Preliminary Economics
→ Deal-Killer Rules
→ Underwriting
→ Opportunity Scoring
→ Selective Enrichment
→ Seller Qualification
→ Human Closing

## Infrastructure

### Cloudflare

Cloudflare provides:

- DNS
- Workers
- Workflows
- scheduling
- application delivery
- security

### Supabase

Supabase/PostgreSQL is the canonical system of record.

Business state must not exist only inside AI context or temporary Worker memory.

Phase 2 milestone 1 persists each evaluation through one transactional database function and exposes a latest-per-property view plus immutable evaluation history. The Worker remains the only browser-facing database boundary.

Phase 2 property enrichment follows the same boundary. Operators may add public-record, permitted-API, or paid-provider evidence through the Worker. Free evidence is allowed for active opportunities; paid evidence additionally requires a qualified disposition, an 80+ score, at least $10,000 base-case spread, sufficient existing confidence, and a bounded cost. PostgreSQL stores the evidence and any underwriting revision in one transaction.

The Phase 2 buyer database adds a second operating queue behind the same private Worker boundary. Buyer identity, contact standing, observed performance, and buy-box criteria are stored transactionally in normalized tables. The database is intentionally evidence-only at this milestone: buyer criteria do not become an opportunity score until the matching model can produce explainable matches and a probable buyer count.

Buyer-demand matching is an explicit operator action on a persisted, non-rejected opportunity. The Worker loads the immutable source evaluation, current property evidence, and at most 100 active buyer profiles; the deterministic `buyer-demand-v1` model classifies each profile as probable, possible, excluded, or ineligible. Criterion outcomes distinguish mismatch from missing evidence. PostgreSQL transactionally stores the run, buyer snapshots, explanations, and a new opportunity evaluation whose buyer-demand component is model-derived. Existing evaluations are never mutated.

### GitHub

GitHub is the canonical source repository and deployment history.

### Cal.com

Cal.com is used downstream for qualified seller appointments.

### Resend

Resend is used for permitted transactional and relationship-based communication, not unsolicited bulk cold email.

## Engineering Principle

Use deterministic software for deterministic decisions.

Use AI only when interpretation, synthesis, extraction, classification, or reasoning adds meaningful value.
