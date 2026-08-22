# Architecture Decision Log

Record consequential architectural decisions here.

## Initial Decisions

### Cloudflare as orchestration layer

Cloudflare Workers and Workflows are preferred over introducing a separate agent orchestration framework during MVP development.

### Supabase as source of truth

PostgreSQL/Supabase stores persistent business state.

### Deterministic-first architecture

LLMs are used only where reasoning or interpretation adds meaningful value.

### Paid enrichment downstream

Paid property/contact enrichment should occur only after preliminary economic qualification.

### Minimum target assignment

The default business objective is to prioritize opportunities capable of producing at least a $10,000 assignment fee.

## 2026-08-22 — Phase 1 vertical slice

### Worker-native TypeScript without a UI framework

The first milestone uses one Cloudflare Worker plus Workers Static Assets and a dependency-light browser interface. This keeps the free-tier footprint small while sharing the same API for manual and CSV inputs. A larger framework can be introduced only when interaction complexity justifies it.

### Stateless local mode with optional Supabase persistence

Underwriting remains fully usable with no credentials. When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present, the Worker writes provenance and evaluations to Supabase. Supabase remains the production source of truth; local stateless mode is a development and demonstration fallback, not production storage.

### Cloudflare Access as the Phase 1 authentication boundary

Production requests require the `Cf-Access-Jwt-Assertion` header, which Cloudflare Access supplies after authentication. The Worker and dashboard must be placed behind an Access application for `app.gns-success.com`; development mode bypasses this edge-only boundary for local work.

### Operator-assisted county ingestion first

Official Maricopa and Pinal Recorder/Assessor sites are preserved as source references, but brittle HTML automation is not a dependency. Manual input and CSV are the viable first adapters while lawful, stable automated endpoints are evaluated.
