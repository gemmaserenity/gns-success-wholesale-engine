begin;

create table public.seller_offer_authorizations (
  id uuid primary key,
  case_id uuid not null references public.seller_acquisition_cases(id) on delete restrict,
  diligence_review_id uuid not null references public.seller_acquisition_diligence_reviews(id) on delete restrict,
  source_evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  buyer_match_run_id uuid not null references public.buyer_match_runs(id) on delete restrict,
  acquisition_decision_id uuid not null references public.seller_acquisition_decisions(id) on delete restrict,
  decision text not null check (decision in ('AUTHORIZE_INTERNAL_TERMS', 'DECLINE_AUTHORIZATION')),
  authorizer_fingerprint text not null check (authorizer_fingerprint ~ '^[a-f0-9]{64}$'),
  authorizer_role text not null check (authorizer_role in ('ACQUISITIONS_MANAGER', 'PRINCIPAL')),
  rationale text not null check (char_length(rationale) between 30 and 2000),
  purchase_price_cents bigint,
  assignment_fee_target_cents bigint,
  earnest_money_cents bigint,
  inspection_period_days integer,
  closing_period_days integer,
  expires_at timestamptz,
  material_facts_reconfirmed boolean not null check (material_facts_reconfirmed),
  disclosure_reviewed boolean not null check (disclosure_reviewed),
  internal_authorization_only boolean not null check (internal_authorization_only),
  no_offer_generated boolean not null check (no_offer_generated),
  no_outreach_initiated boolean not null check (no_outreach_initiated),
  authorized_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (
    (decision = 'AUTHORIZE_INTERNAL_TERMS'
      and purchase_price_cents is not null and assignment_fee_target_cents is not null
      and earnest_money_cents is not null and inspection_period_days is not null and closing_period_days is not null
      and purchase_price_cents > 0 and assignment_fee_target_cents between 1000000 and 10000000
      and earnest_money_cents between 0 and 1000000
      and inspection_period_days between 1 and 30 and closing_period_days between inspection_period_days and 60
      and expires_at is not null)
    or
    (decision = 'DECLINE_AUTHORIZATION'
      and purchase_price_cents is null and assignment_fee_target_cents is null and earnest_money_cents is null
      and inspection_period_days is null and closing_period_days is null and expires_at is null)
  )
);

create table public.seller_offer_authorization_revocations (
  id uuid primary key,
  authorization_id uuid not null unique references public.seller_offer_authorizations(id) on delete restrict,
  actor_fingerprint text not null check (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (char_length(reason) between 20 and 1000),
  internal_authorization_only boolean not null check (internal_authorization_only),
  no_offer_generated boolean not null check (no_offer_generated),
  no_outreach_initiated boolean not null check (no_outreach_initiated),
  revoked_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index seller_offer_authorization_history_idx
  on public.seller_offer_authorizations (case_id, authorized_at desc, created_at desc);

alter table public.seller_offer_authorizations enable row level security;
alter table public.seller_offer_authorization_revocations enable row level security;

create policy "authenticated operators can read seller offer authorizations"
  on public.seller_offer_authorizations for select to authenticated using (true);
create policy "authenticated operators can read seller offer authorization revocations"
  on public.seller_offer_authorization_revocations for select to authenticated using (true);

create or replace function public.record_seller_offer_authorization(p_authorization jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_authorization_id uuid := (p_authorization ->> 'authorizationId')::uuid;
  v_case public.seller_acquisition_cases%rowtype;
  v_latest_evaluation public.opportunity_evaluations%rowtype;
  v_latest_buyer_run public.buyer_match_runs%rowtype;
  v_latest_decision public.seller_acquisition_decisions%rowtype;
  v_latest_diligence public.seller_acquisition_diligence_reviews%rowtype;
  v_decision text := p_authorization ->> 'decision';
  v_authorized_at timestamptz := (p_authorization ->> 'authorizedAt')::timestamptz;
  v_expires_at timestamptz;
  v_purchase_price_cents bigint;
  v_assignment_fee_target_cents bigint;
  v_earnest_money_cents bigint;
  v_inspection_period_days integer;
  v_closing_period_days integer;
  v_investor_ceiling_cents bigint;
  v_target_fee_ceiling_cents bigint;
begin
  if exists(select 1 from public.seller_offer_authorizations where id = v_authorization_id) then
    return jsonb_build_object('authorizationId', v_authorization_id, 'created', false);
  end if;

  select * into v_case from public.seller_acquisition_cases where id = (p_authorization ->> 'caseId')::uuid;
  if not found or v_case.inquiry_id is distinct from (p_authorization ->> 'inquiryId')::uuid then
    raise exception 'Acquisition case was not found';
  end if;
  select * into v_latest_evaluation from public.opportunity_evaluations
    where property_id = v_case.property_id order by evaluated_at desc, created_at desc limit 1;
  select * into v_latest_buyer_run from public.buyer_match_runs
    where property_id = v_case.property_id order by analyzed_at desc, created_at desc limit 1;
  select * into v_latest_decision from public.seller_acquisition_decisions
    where case_id = v_case.id order by decided_at desc, created_at desc limit 1;
  select * into v_latest_diligence from public.seller_acquisition_diligence_reviews
    where case_id = v_case.id order by reviewed_at desc, created_at desc limit 1;

  if p_authorization is null or jsonb_typeof(p_authorization) <> 'object'
    or v_decision not in ('AUTHORIZE_INTERNAL_TERMS', 'DECLINE_AUTHORIZATION')
    or p_authorization ->> 'authorizerRole' not in ('ACQUISITIONS_MANAGER', 'PRINCIPAL')
    or p_authorization ->> 'authorizerFingerprint' !~ '^[a-f0-9]{64}$'
    or coalesce((p_authorization ->> 'materialFactsReconfirmed')::boolean, false) is not true
    or coalesce((p_authorization ->> 'disclosureReviewed')::boolean, false) is not true
    or coalesce((p_authorization ->> 'internalAuthorizationOnly')::boolean, false) is not true
    or coalesce((p_authorization ->> 'noOfferGenerated')::boolean, false) is not true
    or coalesce((p_authorization ->> 'noOutreachInitiated')::boolean, false) is not true
    or v_authorized_at < now() - interval '5 minutes' or v_authorized_at > now() + interval '1 minute'
    or v_latest_evaluation.id is distinct from (p_authorization ->> 'sourceEvaluationId')::uuid
    or v_latest_buyer_run.id is distinct from (p_authorization ->> 'buyerMatchRunId')::uuid
    or v_latest_decision.id is distinct from (p_authorization ->> 'acquisitionDecisionId')::uuid
    or v_latest_decision.decision <> 'ADVANCE_TO_ACQUISITION_REVIEW'
    or v_latest_decision.source_evaluation_id is distinct from v_latest_evaluation.id
    or v_latest_decision.buyer_match_run_id is distinct from v_latest_buyer_run.id
    or v_latest_diligence.id is distinct from (p_authorization ->> 'diligenceReviewId')::uuid
    or v_latest_diligence.readiness <> 'READY_FOR_HUMAN_OFFER_AUTHORIZATION'
    or v_latest_diligence.source_evaluation_id is distinct from v_latest_evaluation.id
    or v_latest_diligence.buyer_match_run_id is distinct from v_latest_buyer_run.id
    or v_latest_diligence.acquisition_decision_id is distinct from v_latest_decision.id
  then raise exception 'Offer authorization requires current ready diligence and all internal controls'; end if;

  if exists (
    select 1 from (
      select source.* from public.seller_offer_authorizations as source
      where source.case_id = v_case.id order by source.authorized_at desc, source.created_at desc limit 1
    ) as current_authorization
    left join public.seller_offer_authorization_revocations as revocation
      on revocation.authorization_id = current_authorization.id
    where current_authorization.decision = 'AUTHORIZE_INTERNAL_TERMS'
      and current_authorization.diligence_review_id = v_latest_diligence.id
      and current_authorization.expires_at > now() and revocation.id is null
  ) then raise exception 'The current diligence review already has an active authorization'; end if;

  if v_decision = 'AUTHORIZE_INTERNAL_TERMS' then
    if jsonb_typeof(p_authorization -> 'terms') <> 'object' or (p_authorization ->> 'expiresAt') is null then
      raise exception 'Exact bounded terms and an expiry are required';
    end if;
    v_purchase_price_cents := (p_authorization #>> '{terms,purchasePriceCents}')::bigint;
    v_assignment_fee_target_cents := (p_authorization #>> '{terms,assignmentFeeTargetCents}')::bigint;
    v_earnest_money_cents := (p_authorization #>> '{terms,earnestMoneyCents}')::bigint;
    v_inspection_period_days := (p_authorization #>> '{terms,inspectionPeriodDays}')::integer;
    v_closing_period_days := (p_authorization #>> '{terms,closingPeriodDays}')::integer;
    v_expires_at := (p_authorization ->> 'expiresAt')::timestamptz;
    v_investor_ceiling_cents := round((v_latest_evaluation.base_underwriting ->> 'investorPurchaseCeiling')::numeric * 100);
    v_target_fee_ceiling_cents := round((v_latest_evaluation.base_underwriting ->> 'maximumContractForTargetFee')::numeric * 100);
    if v_purchase_price_cents is null or v_assignment_fee_target_cents is null
      or v_earnest_money_cents is null or v_inspection_period_days is null or v_closing_period_days is null
      or v_purchase_price_cents <= 0
      or v_assignment_fee_target_cents not between 1000000 and 10000000
      or v_earnest_money_cents not between 0 and least(1000000::bigint, v_purchase_price_cents)
      or v_inspection_period_days not between 1 and 30
      or v_closing_period_days not between v_inspection_period_days and 60
      or v_purchase_price_cents > v_target_fee_ceiling_cents
      or v_purchase_price_cents + v_assignment_fee_target_cents > v_investor_ceiling_cents
      or v_expires_at <= v_authorized_at or v_expires_at > v_authorized_at + interval '72 hours'
    then raise exception 'Authorized terms exceed the current economic or time limits'; end if;
  elsif (p_authorization -> 'terms') is not null or (p_authorization ->> 'expiresAt') is not null then
    raise exception 'A declined authorization cannot contain terms or an expiry';
  end if;

  insert into public.seller_offer_authorizations (
    id, case_id, diligence_review_id, source_evaluation_id, buyer_match_run_id, acquisition_decision_id,
    decision, authorizer_fingerprint, authorizer_role, rationale, purchase_price_cents,
    assignment_fee_target_cents, earnest_money_cents, inspection_period_days, closing_period_days,
    expires_at, material_facts_reconfirmed, disclosure_reviewed, internal_authorization_only,
    no_offer_generated, no_outreach_initiated, authorized_at
  ) values (
    v_authorization_id, v_case.id, v_latest_diligence.id, v_latest_evaluation.id, v_latest_buyer_run.id, v_latest_decision.id,
    v_decision, p_authorization ->> 'authorizerFingerprint', p_authorization ->> 'authorizerRole', p_authorization ->> 'rationale',
    v_purchase_price_cents, v_assignment_fee_target_cents, v_earnest_money_cents,
    v_inspection_period_days, v_closing_period_days, v_expires_at, true, true, true, true, true, v_authorized_at
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_OFFER_AUTHORIZATION', v_authorization_id::text, 'RECORDED', jsonb_build_object(
    'case_id', v_case.id, 'diligence_review_id', v_latest_diligence.id, 'decision', v_decision,
    'authorizer_fingerprint', p_authorization ->> 'authorizerFingerprint', 'authorizer_role', p_authorization ->> 'authorizerRole',
    'expires_at', v_expires_at, 'offer_generated', false, 'document_generated', false,
    'offer_sent', false, 'outreach_initiated', false
  ));

  return jsonb_build_object('authorizationId', v_authorization_id, 'caseId', v_case.id, 'created', true);
end;
$$;

create or replace function public.revoke_seller_offer_authorization(p_revocation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revocation_id uuid := (p_revocation ->> 'revocationId')::uuid;
  v_authorization public.seller_offer_authorizations%rowtype;
begin
  if exists(select 1 from public.seller_offer_authorization_revocations where id = v_revocation_id) then
    return jsonb_build_object('revocationId', v_revocation_id, 'created', false);
  end if;
  select * into v_authorization from public.seller_offer_authorizations
    where id = (p_revocation ->> 'authorizationId')::uuid and case_id = (p_revocation ->> 'caseId')::uuid;
  if not found or v_authorization.decision <> 'AUTHORIZE_INTERNAL_TERMS'
    or v_authorization.id is distinct from (
      select source.id from public.seller_offer_authorizations as source where source.case_id = v_authorization.case_id
      order by source.authorized_at desc, source.created_at desc limit 1
    )
    or exists(select 1 from public.seller_offer_authorization_revocations where authorization_id = v_authorization.id)
    or p_revocation ->> 'actorFingerprint' !~ '^[a-f0-9]{64}$'
    or coalesce((p_revocation ->> 'internalAuthorizationOnly')::boolean, false) is not true
    or coalesce((p_revocation ->> 'noOfferGenerated')::boolean, false) is not true
    or coalesce((p_revocation ->> 'noOutreachInitiated')::boolean, false) is not true
    or (p_revocation ->> 'revokedAt')::timestamptz < now() - interval '5 minutes'
    or (p_revocation ->> 'revokedAt')::timestamptz > now() + interval '1 minute'
  then raise exception 'A current internal authorization and all revocation controls are required'; end if;

  insert into public.seller_offer_authorization_revocations (
    id, authorization_id, actor_fingerprint, reason, internal_authorization_only,
    no_offer_generated, no_outreach_initiated, revoked_at
  ) values (
    v_revocation_id, v_authorization.id, p_revocation ->> 'actorFingerprint', p_revocation ->> 'reason',
    true, true, true, (p_revocation ->> 'revokedAt')::timestamptz
  );
  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_OFFER_AUTHORIZATION', v_authorization.id::text, 'REVOKED', jsonb_build_object(
    'case_id', v_authorization.case_id, 'revocation_id', v_revocation_id,
    'actor_fingerprint', p_revocation ->> 'actorFingerprint', 'offer_generated', false,
    'document_generated', false, 'offer_sent', false, 'outreach_initiated', false
  ));
  return jsonb_build_object('authorizationId', v_authorization.id, 'revocationId', v_revocation_id, 'created', true);
end;
$$;

create view public.current_seller_offer_authorizations
with (security_invoker = true)
as
select
  auth_record.id as authorization_id,
  auth_record.case_id,
  auth_record.diligence_review_id,
  auth_record.source_evaluation_id,
  auth_record.buyer_match_run_id,
  auth_record.acquisition_decision_id,
  auth_record.decision,
  case
    when auth_record.decision = 'DECLINE_AUTHORIZATION' then 'DECLINED'
    when revocation.id is not null then 'REVOKED'
    when auth_record.expires_at <= now() then 'EXPIRED'
    when auth_record.source_evaluation_id is distinct from latest_evaluation.id
      or auth_record.buyer_match_run_id is distinct from latest_buyer.id
      or auth_record.acquisition_decision_id is distinct from latest_decision.id
      or auth_record.diligence_review_id is distinct from latest_diligence.id then 'STALE'
    else 'AUTHORIZED'
  end as effective_status,
  auth_record.authorizer_fingerprint,
  auth_record.authorizer_role,
  auth_record.rationale,
  case when auth_record.decision = 'AUTHORIZE_INTERNAL_TERMS' then jsonb_build_object(
    'purchasePriceCents', auth_record.purchase_price_cents,
    'assignmentFeeTargetCents', auth_record.assignment_fee_target_cents,
    'earnestMoneyCents', auth_record.earnest_money_cents,
    'inspectionPeriodDays', auth_record.inspection_period_days,
    'closingPeriodDays', auth_record.closing_period_days
  ) else null end as terms,
  auth_record.authorized_at,
  auth_record.expires_at,
  revocation.revoked_at,
  revocation.reason as revocation_reason
from (
  select ranked.* from (
    select source.*, row_number() over (partition by source.case_id order by source.authorized_at desc, source.created_at desc) as recency_rank
    from public.seller_offer_authorizations as source
  ) as ranked where ranked.recency_rank = 1
) as auth_record
join public.seller_acquisition_cases as acquisition_case on acquisition_case.id = auth_record.case_id
join lateral (
  select source.id from public.opportunity_evaluations as source where source.property_id = acquisition_case.property_id
  order by source.evaluated_at desc, source.created_at desc limit 1
) as latest_evaluation on true
join lateral (
  select source.id from public.buyer_match_runs as source where source.property_id = acquisition_case.property_id
  order by source.analyzed_at desc, source.created_at desc limit 1
) as latest_buyer on true
join lateral (
  select source.id from public.seller_acquisition_decisions as source where source.case_id = acquisition_case.id
  order by source.decided_at desc, source.created_at desc limit 1
) as latest_decision on true
join lateral (
  select source.id from public.seller_acquisition_diligence_reviews as source where source.case_id = acquisition_case.id
  order by source.reviewed_at desc, source.created_at desc limit 1
) as latest_diligence on true
left join public.seller_offer_authorization_revocations as revocation on revocation.authorization_id = auth_record.id;

revoke execute on function public.record_seller_offer_authorization(jsonb) from public, anon, authenticated;
revoke execute on function public.revoke_seller_offer_authorization(jsonb) from public, anon, authenticated;
grant execute on function public.record_seller_offer_authorization(jsonb) to service_role;
grant execute on function public.revoke_seller_offer_authorization(jsonb) to service_role;
grant select, insert on table public.seller_offer_authorizations, public.seller_offer_authorization_revocations to service_role;
revoke update, delete on table public.seller_offer_authorizations, public.seller_offer_authorization_revocations from service_role;
grant select on public.current_seller_offer_authorizations to service_role, authenticated;

commit;
