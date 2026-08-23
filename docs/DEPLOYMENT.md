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
2. Create a Cloudflare Access self-hosted application for `app.gns-success.com` and restrict it to the two operators.
3. Set the Worker secrets interactively:

   ```bash
   npx wrangler secret put SUPABASE_URL --env production
   npx wrangler secret put SUPABASE_SECRET_KEY --env production
   ```

4. Validate with `npm run build`, then deploy with `npx wrangler deploy --env production`.
5. Attach the `app.gns-success.com` custom domain in Cloudflare.

`SUPABASE_SECRET_KEY` must be a modern key from Supabase **Settings → API Keys → Secret keys** with the `sb_secret_` prefix. The legacy JWT-based `service_role` key, `anon` key, publishable key, and JWT signing secret are not accepted. This secret is Worker-only: never add it to browser code, a tracked file, or a command argument. Production requests are denied unless they arrive with Cloudflare Access's authenticated assertion header. Local development uses blank values in ignored `.dev.vars` and remains stateless.
