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

## Phase 2 buyer-database deployment

After the property-enrichment migration is present, apply:

```text
supabase/migrations/202608230003_phase2_buyer_database.sql
```

Then deploy or push the Worker release and verify:

1. `GET /api/health` reports persistence enabled.
2. `GET /api/buyers` returns `buyerDatabaseAvailable: true`.
3. Open **Buyer database** and create a representative buyer with one contact method, a source, at least one county, property type, occupancy, and financing method.
4. Confirm the buyer appears with the expected buy box and can be filtered by county and status.
5. Edit the buyer and confirm the same UUID is updated rather than duplicated.
6. Mark a test buyer do-not-contact and confirm both status fields remain synchronized.
7. Confirm Supabase contains linked `buyers` and `buyer_criteria` rows plus a `BUYER_PROFILE` audit event.

The API returns a migration notice until the schema is present. Opportunity evaluation, enrichment, and the existing dashboard remain available during the rollout window.

## Phase 2 buyer-demand deployment

After the buyer-database migration is present, apply:

```text
supabase/migrations/202608230004_phase2_buyer_demand_matching.sql
```

Then deploy or push the Worker release and verify:

1. `GET /api/opportunities/buyer-matches?evaluationId=<persisted-evaluation-uuid>` returns `buyerMatchingAvailable: true` and either the latest analysis or `null`.
2. Open a non-rejected opportunity and choose **Buyer demand**.
3. Calculate demand and confirm the panel shows the modeled score, probable/possible/eligible counts, and criterion evidence for displayed matches.
4. Confirm a constrained missing property fact is shown as unknown and does not contribute a probable buyer.
5. Confirm a buyer outside county, ZIP, property type, price, ARV, repair, size, year, occupancy, HOA, or timeline constraints is excluded with a machine-readable reason.
6. Refresh the opportunity queue and confirm a new evaluation appears with parser version `buyer-demand-v1` and the modeled buyer-demand component.
7. Confirm Supabase contains one `buyer_match_runs` row, linked `buyer_matches`, the revised `opportunity_evaluations` row, and a `BUYER_MATCH_RUN` audit event.
8. Repeat the same source-evaluation request and confirm it returns the existing run rather than adding another.

The matching endpoint returns a migration notice until the schema is present. Existing evaluation, enrichment, and buyer-profile workflows remain available during rollout.

## Phase 2 selective-skip-tracing deployment

After buyer-demand matching is present, apply:

```text
supabase/migrations/202608230005_phase2_selective_skip_tracing.sql
```

`MAX_SKIP_TRACE_CENTS` is a non-secret Worker variable and defaults to `1000`. The gate also limits a case to one percent of the base expected assignment fee. This value authorizes only the documented research case; it does not authorize a purchase or external transmission.

Then deploy or push the Worker release and verify:

1. `GET /api/health` still reports persistence enabled.
2. `GET /api/opportunities/skip-trace?evaluationId=<evaluation UUID>` returns `selectiveSkipTracingAvailable: true`, `externalTransmissionAllowed: false`, and `outreachAvailable: false`.
3. Confirm a preliminary, sub-80, sub-$10,000-spread, low-owner-confidence, over-budget, or suppressed opportunity is denied and stores nothing.
4. Open one qualifying case and confirm the qualification snapshot, purpose, necessity, identity basis, privacy notes, source plan, and cost are visible.
5. Record either a no-match result or one evidence finding and confirm the case closes without initiating outreach.
6. Confirm the first finding leaves contact standing `UNKNOWN` with no allowed channels.
7. Record do-not-contact standing and confirm a later evaluation for the same owner cannot open a new case.
8. Confirm Supabase contains linked `skip_trace_cases`, `skip_trace_findings`, `seller_contact_standing_events`, and PII-minimized `audit_events` records.
9. Confirm there is no network request to an external data provider and no call, text, email, or mail action.

The API returns a migration notice until the schema is present. Existing opportunity, enrichment, buyer, and matching workflows remain available during rollout.

## Phase 2 seller-intake deployment

After selective skip tracing is present, apply:

```text
supabase/migrations/202608230006_phase2_seller_intake.sql
```

Deploy two independent Workers:

- `wrangler.jsonc` deploys `gns-success-wholesale-engine` only to `wholesale.gns-success.com`; every request remains behind Cloudflare Access.
- `wrangler.seller.jsonc` deploys `gns-success-seller-portal` only to `sell.gns-success.com`; its asset directory contains only the public seller page and its required assets.

The public intake endpoint exists only in the seller Worker. The authenticated Worker retains the operator inquiry queue and an outbound link to the seller portal.

Configure these encrypted secrets on `gns-success-seller-portal` without committing their values:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
CALCOM_API_KEY
RESEND_API_KEY
OPERATOR_NOTIFICATION_EMAIL
```

`RESEND_FROM_EMAIL` defaults to `GNS Success <offers@gns-success.com>` and requires `gns-success.com` to be verified in Resend. If the Cal.com account has more than one public event type, set the non-secret `CALCOM_EVENT_TYPE_ID` to the seller-call event ID or set `CALCOM_SELLER_BOOKING_URL` to its public URL. A sole public event type or one unambiguous seller-related event resolves automatically.

Build both boundaries independently:

```text
npm run build
npm run build:seller
```

Deploy the authenticated Worker with `wrangler.jsonc` and the public Worker with `wrangler.seller.jsonc`. Then verify:

1. `https://sell.gns-success.com` loads without Cloudflare Access while `https://wholesale.gns-success.com` remains protected.
2. The seller deployment contains no operator dashboard assets or private API routes; unknown API paths return 404.
3. A honeypot submission, a sub-two-second submission, and the eleventh submission from one client within a minute are rejected.
4. A representative valid inquiry stores one `seller_inquiries` row, one `seller_qualification_assessments` row, three channel consent events, one `NEW` status event, and a PII-minimized audit event.
5. A qualified inquiry returns a Cal.com booking link; confirm the Cal.com event-type lookup contains no seller data.
6. When email permission is checked, Resend records one seller acknowledgement and one internal operator notice. Retry the same submission UUID and confirm no duplicate message is sent.
7. When email permission is not checked, no seller email is sent. Confirm calls and texts are never initiated.
8. In **Seller inquiries**, confirm the assessment reasons, consented channels, booking offer, and provider delivery outcomes are visible.
9. Record an operator status with rationale and confirm a new status event appears without modifying the original inquiry or initiating outreach.
10. In a seller inquiry, prepare an AI review packet and confirm the browser states that no data was sent; inspect the packet to verify name, email, phone, address, APN, exact amounts, and notes are absent.
11. Import a synthetic valid `seller-ai-output-v1` result with provider/model provenance and a human decision. Confirm immutable packet, result, review, and PII-minimized audit records exist while inquiry status, consent, booking, and delivery records remain unchanged.

Do not submit real seller information during deployment testing unless the person has knowingly provided it for this workflow. Use an operator-controlled test address and clearly synthetic property details.

## Phase 3 seller-acquisition milestone 1 deployment

After all Phase 2 migrations are registered, apply:

```text
supabase/migrations/202608240001_phase3_seller_acquisition_workflow.sql
```

Deploy only the authenticated Worker; the public seller Worker has no Phase 3 route or asset change. Then verify:

1. An unauthenticated request to `wholesale.gns-success.com` still reaches Cloudflare Access rather than the private API.
2. `GET /api/seller/inquiries/acquisition-case?inquiryId=<synthetic inquiry UUID>` reports `acquisitionWorkflowAvailable: true` inside an authenticated session.
3. A cited zero-cost public-record case persists one linked opportunity evaluation, case, verification, and PII-minimized audit event in one transaction.
4. Paid-provider or non-zero-cost opening research is rejected before persistence.
5. Buyer-demand analysis persists through the existing `buyer-demand-v1` workflow and creates a revised immutable evaluation.
6. Advance is denied without matched ownership, verified seller authority, current buyer-demand evidence, and human review attestations.
7. Advance, hold, or decline adds a decision row without changing the inquiry, consent events, property verification, evaluation, or buyer-match history.
8. Responses continue to report `externalTransmissionAllowed: false`, `outreachInitiated: false`, and `offerGenerated: false` as applicable.

## Phase 3 acquisition-diligence milestone 2 deployment

After the milestone 1 migration is registered, apply:

```text
supabase/migrations/202608240002_phase3_acquisition_diligence.sql
```

Deploy only the authenticated Worker. The public seller Worker, its assets, bindings, and routes are unchanged. Then verify:

1. The two diligence tables and `current_seller_acquisition_diligence` view exist, and the service role cannot update or delete diligence history.
2. An authenticated synthetic `GET /api/seller/inquiries/acquisition-diligence?caseId=<UUID>` reports `acquisitionDiligenceAvailable: true`, with offer authorization, offer generation, and outreach all unavailable.
3. A review is rejected unless the latest decision advances the case and still references the latest evaluation and buyer-demand run.
4. A review requires exactly one of every checklist kind, zero direct cost, provenance, confidence, notes, and the no-offer/no-outreach attestations.
5. PostgreSQL derives the same open items, blockers, and readiness as `acquisition-diligence-v1` before transactionally storing a review and 13 items.
6. A later review appends history; it never updates or deletes a prior review or item.
7. `READY_FOR_HUMAN_OFFER_AUTHORIZATION` does not authorize an offer. Confirm no offer-generation, sending, contact, or provider route exists.
8. The unauthenticated private hostname still reaches Cloudflare Access, and the unchanged public seller health endpoint remains healthy.

Do not create a production diligence review merely to test deployment. A schema-presence GET with a synthetic UUID is sufficient when no approved test case exists.

## Phase 3 internal offer-authorization milestone 3 deployment

After the milestone 2 migration is registered, apply:

```text
supabase/migrations/202608240003_phase3_offer_authorization.sql
```

Deploy only the authenticated Worker. The public seller Worker remains unchanged. Then verify:

1. The authorization and revocation tables plus `current_seller_offer_authorizations` exist; service-role update/delete remain revoked.
2. An authenticated synthetic GET reports `offerAuthorizationAvailable: true` and generation, document generation, sending, and outreach as unavailable.
3. Production POST requests require a Cloudflare Access authenticated-email header, which the Worker hashes before persistence; the browser supplies no actor identifier.
4. Authorization is denied unless the latest diligence is ready and all linked evaluation, buyer, decision, and diligence identifiers are current.
5. Authorized purchase price plus assignment target remains within the base investor ceiling; purchase price also remains within the target-fee contract ceiling.
6. Validity is limited to 24, 48, or 72 hours; the database rejects more than 72 hours and the current projection reports expiry/staleness automatically.
7. A second active authorization on the same review is denied until the current record expires or is append-only revoked.
8. Confirm no offer/document/signature/delivery/provider/outreach route or binding was introduced.
9. Confirm Cloudflare Access still protects the private hostname and the unchanged public seller health endpoint remains healthy.

Do not create an authorization in production merely to test deployment. Use schema inspection, a synthetic read, and the gated UI unless an approved synthetic case already exists.

## Phase 3 controlled internal offer-draft milestone 4 deployment

After the milestone 3 migration is registered, apply:

```text
supabase/migrations/202608240004_phase3_internal_offer_drafts.sql
```

Deploy only the authenticated Worker. The public seller Worker remains unchanged. Then verify:

1. `seller_offer_drafts`, `current_seller_offer_drafts`, and `record_seller_offer_draft(jsonb)` exist; service-role update/delete remain revoked.
2. An authenticated synthetic GET reports `internalDraftPreparationAvailable: true`, with seller-facing approval, signature, delivery, and outreach unavailable.
3. Production POST requests require a Cloudflare Access identity that the Worker hashes; the browser supplies no actor identifier or document content.
4. Preparation is denied unless the exact latest authorization remains `AUTHORIZED` and unexpired.
5. PostgreSQL assembles seller name, property address, terms, expiry, classification, notice, and required next reviews from canonical records and computes the SHA-256.
6. A repeated preparation appends the next revision without updating or deleting prior history.
7. Revoking, expiring, or superseding the authorization changes the current draft projection without mutating the draft.
8. Confirm no PDF/download, contract, disclosure, signature, delivery, provider, or outreach route or binding was introduced.
9. Confirm Cloudflare Access still protects the private hostname and the unchanged public seller health endpoint remains healthy.

Do not create a production draft merely to test deployment. Use schema inspection, a synthetic read, and the gated UI unless an approved synthetic case already exists.

## Phase 3 seller-document release-governance milestone 5 deployment

After the milestone 4 migration is registered, apply:

```text
supabase/migrations/202608240005_phase3_document_release_governance.sql
```

Deploy only the authenticated Worker. Do not deploy the public seller Worker. Then verify without creating records:

1. All eight append-only governance tables and the three current views exist; the service role cannot update/delete history or insert central permissions, legal approvals, signature events, or delivery events.
2. Confirm the migration seeded zero legal versions, legal approval events, central permissions, release packages, signature events, and delivery events.
3. An authenticated synthetic GET to `/api/seller/inquiries/document-release?caseId=<UUID>` reports governance available and generation, signature, delivery, provider, and outreach capabilities false.
4. A case with a current draft reports the exact draft SHA-256 but blocks on absent approved Arizona contract/disclosure versions and absent centrally administered permission.
5. Cloudflare Access still protects the private hostname; no personal information appears in Worker logs.
6. Confirm the public seller Worker deployment and health endpoint are unchanged.

Do not register placeholder legal language or approval evidence. Do not create a release package, signature request, delivery, or outreach event for deployment verification.

## Phase 3 document-governance integrity milestone 6 deployment

Apply `supabase/migrations/202608240006_phase3_document_governance_integrity.sql`, then deploy only the authenticated Worker. Verify the hold table is empty, the integrity RPC reports `HEALTHY` with zero violations, all provider/action flags remain false, the dashboard renders the read-only assessment, and Cloudflare Access/public Worker boundaries are unchanged. Do not create a hold or any release-related event merely to verify deployment.
