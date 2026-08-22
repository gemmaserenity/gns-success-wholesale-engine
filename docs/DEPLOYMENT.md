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
