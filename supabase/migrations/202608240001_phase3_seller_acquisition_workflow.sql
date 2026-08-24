begin;

create table public.seller_acquisition_cases (
  id uuid primary key,
  inquiry_id uuid not null unique references public.seller_inquiries(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  initial_evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  opened_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_property_verifications (
  id uuid primary key,
  case_id uuid not null unique references public.seller_acquisition_cases(id) on delete restrict,
  evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  source_name text not null check (char_length(source_name) between 3 and 160),
  source_type text not null check (source_type in ('PUBLIC_RECORD', 'HUMAN_VERIFIED')),
  source_url text not null check (source_url ~ '^https?://'),
  retrieved_at timestamptz not null,
  property_identity_verified boolean not null check (property_identity_verified),
  owner_identity_status text not null check (owner_identity_status in ('MATCHED', 'MISMATCH', 'UNRESOLVED')),
  seller_authority_status text not null check (seller_authority_status in ('VERIFIED', 'UNVERIFIED')),
  research_cost_cents integer not null check (research_cost_cents = 0),
  verification_notes text not null check (char_length(verification_notes) between 20 and 2000),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.seller_acquisition_decisions (
  id uuid primary key,
  case_id uuid not null references public.seller_acquisition_cases(id) on delete restrict,
  source_evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  buyer_match_run_id uuid references public.buyer_match_runs(id) on delete restrict,
  decision text not null check (decision in ('ADVANCE_TO_ACQUISITION_REVIEW', 'HOLD_FOR_RESEARCH', 'DECLINE')),
  rationale text not null check (char_length(rationale) between 20 and 2000),
  material_facts_reviewed boolean not null,
  consent_boundary_reviewed boolean not null,
  no_offer_authorized boolean not null check (no_offer_authorized),
  gate_reason_codes text[] not null,
  decided_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index seller_acquisition_property_idx on public.seller_acquisition_cases (property_id, opened_at desc);
create index seller_acquisition_decision_history_idx on public.seller_acquisition_decisions (case_id, decided_at desc, created_at desc);

alter table public.seller_acquisition_cases enable row level security;
alter table public.seller_property_verifications enable row level security;
alter table public.seller_acquisition_decisions enable row level security;

create policy "authenticated operators can read seller acquisition cases"
  on public.seller_acquisition_cases for select to authenticated using (true);
create policy "authenticated operators can read property verifications"
  on public.seller_property_verifications for select to authenticated using (true);
create policy "authenticated operators can read acquisition decisions"
  on public.seller_acquisition_decisions for select to authenticated using (true);

create or replace function public.persist_seller_acquisition_case(
  p_case jsonb,
  p_verification jsonb,
  p_evaluation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid := (p_case ->> 'caseId')::uuid;
  v_inquiry_id uuid := (p_case ->> 'inquiryId')::uuid;
  v_evaluation_id uuid;
  v_property_id uuid;
  v_existing public.seller_acquisition_cases%rowtype;
  v_tier text;
begin
  select * into v_existing from public.seller_acquisition_cases where inquiry_id = v_inquiry_id;
  if found then
    return jsonb_build_object('caseId', v_existing.id, 'inquiryId', v_existing.inquiry_id, 'created', false);
  end if;

  select qualification.tier into v_tier
  from public.seller_inquiries as inquiry
  join public.seller_qualification_assessments as qualification on qualification.inquiry_id = inquiry.id
  where inquiry.id = v_inquiry_id;

  if not found then raise exception 'A persisted seller inquiry is required'; end if;
  if v_tier = 'INELIGIBLE' then raise exception 'Ineligible seller inquiries cannot open an acquisition case'; end if;
  if p_case is null or jsonb_typeof(p_case) <> 'object'
    or p_verification is null or jsonb_typeof(p_verification) <> 'object'
    or p_evaluation is null or jsonb_typeof(p_evaluation) <> 'object'
    or p_evaluation #>> '{rawInput,source}' <> 'SELLER_INQUIRY_RESEARCH'
    or p_evaluation #>> '{rawInput,sourceRecordId}' <> v_inquiry_id::text
    or p_verification ->> 'inquiryId' <> v_inquiry_id::text
    or coalesce((p_verification ->> 'propertyIdentityVerified')::boolean, false) is not true
    or (p_verification ->> 'researchCostCents')::integer <> 0
    or p_verification ->> 'sourceType' not in ('PUBLIC_RECORD', 'HUMAN_VERIFIED')
    or nullif(p_verification ->> 'sourceUrl', '') is null
  then raise exception 'A complete zero-cost, evidence-backed acquisition case is required'; end if;

  v_evaluation_id := (public.persist_opportunity_evaluation(p_evaluation) ->> 'evaluationId')::uuid;
  select property_id into v_property_id from public.opportunity_evaluations where id = v_evaluation_id;
  if v_property_id is null then raise exception 'The acquisition evaluation must resolve to a normalized property'; end if;

  insert into public.seller_acquisition_cases (id, inquiry_id, property_id, initial_evaluation_id, opened_at)
  values (v_case_id, v_inquiry_id, v_property_id, v_evaluation_id, (p_case ->> 'openedAt')::timestamptz);

  insert into public.seller_property_verifications (
    id, case_id, evaluation_id, source_name, source_type, source_url, retrieved_at,
    property_identity_verified, owner_identity_status, seller_authority_status,
    research_cost_cents, verification_notes, evidence_snapshot
  ) values (
    (p_verification ->> 'verificationId')::uuid, v_case_id, v_evaluation_id,
    p_verification ->> 'sourceName', p_verification ->> 'sourceType', p_verification ->> 'sourceUrl',
    (p_verification ->> 'retrievedAt')::timestamptz, true,
    p_verification ->> 'ownerIdentityStatus', p_verification ->> 'sellerAuthorityStatus', 0,
    p_verification ->> 'verificationNotes',
    jsonb_build_object(
      'county', p_verification -> 'county', 'apn', p_verification -> 'apn',
      'address', p_verification -> 'address', 'ownerName', p_verification -> 'ownerName',
      'ownerConfidence', p_verification -> 'ownerConfidence', 'dataConfidence', p_verification -> 'dataConfidence',
      'sourceName', p_verification -> 'sourceName', 'sourceType', p_verification -> 'sourceType',
      'sourceUrl', p_verification -> 'sourceUrl', 'retrievedAt', p_verification -> 'retrievedAt'
    )
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_ACQUISITION_CASE', v_case_id::text, 'OPENED', jsonb_build_object(
    'inquiry_id', v_inquiry_id, 'property_id', v_property_id, 'evaluation_id', v_evaluation_id,
    'source_type', p_verification -> 'sourceType', 'research_cost_cents', 0,
    'external_transmission', false, 'outreach_initiated', false, 'offer_generated', false
  ));

  return jsonb_build_object('caseId', v_case_id, 'inquiryId', v_inquiry_id, 'created', true);
end;
$$;

create or replace function public.record_seller_acquisition_decision(p_decision jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.seller_acquisition_cases%rowtype;
  v_verification public.seller_property_verifications%rowtype;
  v_latest_evaluation public.opportunity_evaluations%rowtype;
  v_latest_buyer_run public.buyer_match_runs%rowtype;
  v_decision text := p_decision ->> 'decision';
begin
  select * into v_case from public.seller_acquisition_cases where id = (p_decision ->> 'caseId')::uuid;
  if not found then raise exception 'Acquisition case was not found'; end if;
  select * into v_verification from public.seller_property_verifications where case_id = v_case.id;
  select * into v_latest_evaluation from public.opportunity_evaluations
  where property_id = v_case.property_id order by evaluated_at desc, created_at desc limit 1;
  select * into v_latest_buyer_run from public.buyer_match_runs
  where property_id = v_case.property_id order by analyzed_at desc, created_at desc limit 1;

  if p_decision is null or jsonb_typeof(p_decision) <> 'object'
    or v_decision not in ('ADVANCE_TO_ACQUISITION_REVIEW', 'HOLD_FOR_RESEARCH', 'DECLINE')
    or v_case.inquiry_id is distinct from (p_decision ->> 'inquiryId')::uuid
    or coalesce((p_decision ->> 'noOfferAuthorized')::boolean, false) is not true
    or v_latest_evaluation.id is distinct from (p_decision ->> 'sourceEvaluationId')::uuid
  then raise exception 'A valid decision on the latest evaluation is required'; end if;

  if v_decision = 'ADVANCE_TO_ACQUISITION_REVIEW' and (
    coalesce((p_decision ->> 'materialFactsReviewed')::boolean, false) is not true
    or coalesce((p_decision ->> 'consentBoundaryReviewed')::boolean, false) is not true
    or v_verification.property_identity_verified is not true
    or v_verification.owner_identity_status <> 'MATCHED'
    or v_verification.seller_authority_status <> 'VERIFIED'
    or v_latest_evaluation.state = 'REJECTED'
    or v_latest_buyer_run.id is null
    or v_latest_buyer_run.id is distinct from nullif(p_decision ->> 'buyerMatchRunId', '')::uuid
  ) then raise exception 'Advance requires verified identity and authority, current underwriting, buyer-demand analysis, and human control attestations'; end if;

  insert into public.seller_acquisition_decisions (
    id, case_id, source_evaluation_id, buyer_match_run_id, decision, rationale,
    material_facts_reviewed, consent_boundary_reviewed, no_offer_authorized,
    gate_reason_codes, decided_at
  ) values (
    (p_decision ->> 'decisionId')::uuid, v_case.id, v_latest_evaluation.id,
    nullif(p_decision ->> 'buyerMatchRunId', '')::uuid, v_decision, p_decision ->> 'rationale',
    (p_decision ->> 'materialFactsReviewed')::boolean,
    (p_decision ->> 'consentBoundaryReviewed')::boolean, true,
    array(select jsonb_array_elements_text(p_decision -> 'gateReasonCodes')),
    (p_decision ->> 'decidedAt')::timestamptz
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_ACQUISITION_DECISION', (p_decision ->> 'decisionId'), 'RECORDED', jsonb_build_object(
    'case_id', v_case.id, 'inquiry_id', v_case.inquiry_id, 'property_id', v_case.property_id,
    'source_evaluation_id', v_latest_evaluation.id, 'buyer_match_run_id', v_latest_buyer_run.id,
    'decision', v_decision, 'outreach_initiated', false, 'offer_generated', false
  ));

  return jsonb_build_object('caseId', v_case.id, 'inquiryId', v_case.inquiry_id);
end;
$$;

create view public.current_seller_acquisition_cases
with (security_invoker = true)
as
select
  acquisition_case.id as case_id,
  acquisition_case.inquiry_id,
  acquisition_case.property_id,
  acquisition_case.opened_at,
  jsonb_build_object(
    'verificationId', verification.id, 'evaluationId', verification.evaluation_id,
    'sourceName', verification.source_name, 'sourceType', verification.source_type,
    'sourceUrl', verification.source_url, 'retrievedAt', verification.retrieved_at,
    'propertyIdentityVerified', verification.property_identity_verified,
    'ownerIdentityStatus', verification.owner_identity_status,
    'sellerAuthorityStatus', verification.seller_authority_status,
    'researchCostCents', verification.research_cost_cents,
    'verificationNotes', verification.verification_notes
  ) as verification,
  jsonb_build_object(
    'evaluationId', evaluation.id, 'state', evaluation.state, 'score', evaluation.score,
    'confidence', evaluation.confidence, 'nextAction', evaluation.next_action,
    'baseUnderwriting', evaluation.base_underwriting, 'evaluatedAt', evaluation.evaluated_at
  ) as evaluation,
  case when buyer_run.id is null then null else jsonb_build_object(
    'runId', buyer_run.id, 'sourceEvaluationId', buyer_run.source_evaluation_id,
    'revisedEvaluationId', buyer_run.revised_evaluation_id,
    'buyerDemandScore', buyer_run.buyer_demand_score,
    'probableBuyerCount', buyer_run.probable_buyer_count,
    'possibleBuyerCount', buyer_run.possible_buyer_count, 'analyzedAt', buyer_run.analyzed_at
  ) end as buyer_demand,
  case when decision.id is null then null else jsonb_build_object(
    'decisionId', decision.id, 'decision', decision.decision,
    'sourceEvaluationId', decision.source_evaluation_id,
    'buyerMatchRunId', decision.buyer_match_run_id,
    'rationale', decision.rationale, 'decidedAt', decision.decided_at
  ) end as decision
from public.seller_acquisition_cases as acquisition_case
join public.seller_property_verifications as verification on verification.case_id = acquisition_case.id
join lateral (
  select source.* from public.opportunity_evaluations as source
  where source.property_id = acquisition_case.property_id
  order by source.evaluated_at desc, source.created_at desc limit 1
) as evaluation on true
left join lateral (
  select source.* from public.buyer_match_runs as source
  where source.property_id = acquisition_case.property_id
  order by source.analyzed_at desc, source.created_at desc limit 1
) as buyer_run on true
left join lateral (
  select source.* from public.seller_acquisition_decisions as source
  where source.case_id = acquisition_case.id
  order by source.decided_at desc, source.created_at desc limit 1
) as decision on true;

revoke execute on function public.persist_seller_acquisition_case(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_acquisition_decision(jsonb) from public, anon, authenticated;
grant execute on function public.persist_seller_acquisition_case(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.record_seller_acquisition_decision(jsonb) to service_role;

grant select, insert on table public.seller_acquisition_cases, public.seller_property_verifications, public.seller_acquisition_decisions to service_role;
revoke update, delete on table public.seller_acquisition_cases, public.seller_property_verifications, public.seller_acquisition_decisions from service_role;
grant select on public.current_seller_acquisition_cases to service_role, authenticated;

commit;
