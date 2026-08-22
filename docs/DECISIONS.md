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
