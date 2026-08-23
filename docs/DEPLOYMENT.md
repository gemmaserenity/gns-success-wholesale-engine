# Deployment

Expected infrastructure:

- GitHub repository
- Cloudflare
- Supabase
- Cal.com
- Resend

Production secrets must never be committed to Git.

Use:

- Cloudflare secrets
- GitHub Actions secrets
- Supabase secrets/configuration
- local .env files excluded by .gitignore

A `.env.example` file documents expected variable names without storing credentials.

## Phase 1 deployment

1. Apply `supabase/migrations/202608220001_phase1_opportunity_screening.sql` to the prepared Supabase project.
2. Create a Cloudflare Access self-hosted application for `wholesale.gns-success.com` and restrict it to the two operators.
3. Set the Worker secrets interactively:

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SECRET_KEY
   ```

4. Validate with `npm run build`, then deploy with `npx wrangler deploy`.
5. Attach the `wholesale.gns-success.com` custom domain in Cloudflare.

`SUPABASE_SECRET_KEY` must be a modern key from Supabase **Settings → API Keys → Secret keys** with the `sb_secret_` prefix. The legacy JWT-based `service_role` key, `anon` key, publishable key, and JWT signing secret are not accepted. This secret is Worker-only: never add it to browser code, a tracked file, or a command argument. Production requests are denied unless they arrive with Cloudflare Access's authenticated assertion header. Local development uses blank values in ignored `.dev.vars` and remains stateless.

The current application does not use Supabase Auth for operator sign-in, so no Supabase Site URL or redirect URL is required for this hostname. Cloudflare Access authenticates operators at `wholesale.gns-success.com`; Supabase is accessed only by the Worker through its server-side URL and secret key. If Supabase Auth is introduced later, add `https://wholesale.gns-success.com` to the Supabase Auth URL configuration at that time.

## Phase 2 milestone 1 deployment

Apply migrations in filename order. After Phase 1 is present, run:

```text
supabase/migrations/202608230001_phase2_opportunity_history.sql
```

Then deploy or push the Worker release and verify:

1. `GET /api/health` reports persistence enabled.
2. A representative evaluation returns `persisted: true`.
3. The **Opportunity queue** tab loads without a migration notice.
4. Supabase contains linked rows in `properties`, `owners`, `ownership_interests`, `distress_events`, `opportunity_evaluations`, `pipeline_events`, and `audit_events`.
5. Re-evaluating the same county/APN increases its history count while keeping a single current queue card.

The Worker includes a temporary rolling-release fallback: if the transactional RPC is not present yet, it continues the original Phase 1 `source_records` and `opportunity_evaluations` writes. The queue remains disabled with an explicit migration notice until this migration is applied. Remove the fallback only after every deployed environment has the Phase 2 schema.

## Phase 2 property-enrichment deployment

After milestone 1 is present, apply:

```text
supabase/migrations/202608230002_phase2_property_enrichment.sql
```

`MAX_PAID_ENRICHMENT_CENTS` is a non-secret Worker variable and defaults to `500`. Reduce it to tighten the paid-provider ceiling; increase it only after confirming the acquisition economics and provider terms.

Then deploy or push the Worker release and verify:

1. `GET /api/health` reports persistence enabled.
2. `GET /api/opportunities/enrichment?evaluationId=<evaluation UUID>` returns the selected opportunity, prior runs, and current facts.
3. In **Opportunity queue**, open **Property evidence** and record one public-record fact with a source URL.
4. Confirm the response reports the stored fact and the dashboard lists its source, confidence, and classification.
5. If the fact changes underwriting, confirm a new evaluation appears in history; informational facts should not create a new evaluation.
6. Confirm an ineligible or over-budget paid run returns HTTP 422 with its gate reason codes and stores nothing.

The enrichment endpoints return a migration notice until the new schema is present; health and the existing opportunity desk remain available during that rollout window.
