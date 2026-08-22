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

### GitHub

GitHub is the canonical source repository and deployment history.

### Cal.com

Cal.com is used downstream for qualified seller appointments.

### Resend

Resend is used for permitted transactional and relationship-based communication, not unsolicited bulk cold email.

## Engineering Principle

Use deterministic software for deterministic decisions.

Use AI only when interpretation, synthesis, extraction, classification, or reasoning adds meaningful value.
