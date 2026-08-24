begin;

create table public.seller_acquisition_diligence_reviews (
  id uuid primary key,
  case_id uuid not null references public.seller_acquisition_cases(id) on delete restrict,
  source_evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  buyer_match_run_id uuid not null references public.buyer_match_runs(id) on delete restrict,
  acquisition_decision_id uuid not null references public.seller_acquisition_decisions(id) on delete restrict,
  model_version text not null check (model_version = 'acquisition-diligence-v1'),
  readiness text not null check (readiness in ('NEEDS_RESEARCH', 'BLOCKED', 'READY_FOR_HUMAN_OFFER_AUTHORIZATION')),
  reason_codes text[] not null,
  open_item_kinds text[] not null,
  blocked_item_kinds text[] not null,
  summary text not null check (char_length(summary) between 20 and 2000),
  material_facts_current boolean not null,
  no_offer_generated boolean not null check (no_offer_generated),
  no_outreach_initiated boolean not null check (no_outreach_initiated),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_acquisition_diligence_items (
  review_id uuid not null references public.seller_acquisition_diligence_reviews(id) on delete restrict,
  kind text not null check (kind in (
    'PROPERTY_IDENTITY', 'OWNER_IDENTITY', 'SELLER_AUTHORITY', 'TITLE', 'LIENS_PAYOFFS', 'TAXES',
    'DISTRESS_TIMELINE', 'OCCUPANCY', 'CONDITION_REPAIRS', 'VALUE_SUPPORT', 'BUYER_DEMAND',
    'WHOLESALE_DISCLOSURE', 'CONSENT_COMMUNICATIONS'
  )),
  status text not null check (status in ('SATISFIED', 'OPEN', 'BLOCKED', 'NOT_APPLICABLE')),
  source_name text not null check (char_length(source_name) between 3 and 160),
  source_type text not null check (source_type in ('PUBLIC_RECORD', 'HUMAN_VERIFIED', 'PROFESSIONAL_REVIEW', 'OPERATOR_REVIEW')),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  reviewed_at timestamptz not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  notes text not null check (char_length(notes) between 10 and 2000),
  cost_cents integer not null check (cost_cents = 0),
  created_at timestamptz not null default now(),
  primary key (review_id, kind),
  check (source_type = 'OPERATOR_REVIEW' or source_url is not null)
);

create index seller_acquisition_diligence_history_idx
  on public.seller_acquisition_diligence_reviews (case_id, reviewed_at desc, created_at desc);

alter table public.seller_acquisition_diligence_reviews enable row level security;
alter table public.seller_acquisition_diligence_items enable row level security;

create policy "authenticated operators can read acquisition diligence reviews"
  on public.seller_acquisition_diligence_reviews for select to authenticated using (true);
create policy "authenticated operators can read acquisition diligence items"
  on public.seller_acquisition_diligence_items for select to authenticated using (true);

create or replace function public.record_seller_acquisition_diligence(p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review_id uuid := (p_review ->> 'reviewId')::uuid;
  v_case public.seller_acquisition_cases%rowtype;
  v_latest_evaluation public.opportunity_evaluations%rowtype;
  v_latest_buyer_run public.buyer_match_runs%rowtype;
  v_latest_decision public.seller_acquisition_decisions%rowtype;
  v_item jsonb;
  v_item_count integer;
  v_distinct_item_count integer;
  v_open_item_kinds text[];
  v_blocked_item_kinds text[];
  v_readiness text;
  v_reason_codes text[] := '{}'::text[];
begin
  if exists(select 1 from public.seller_acquisition_diligence_reviews where id = v_review_id) then
    return jsonb_build_object('reviewId', v_review_id, 'created', false);
  end if;

  select * into v_case from public.seller_acquisition_cases where id = (p_review ->> 'caseId')::uuid;
  if not found or v_case.inquiry_id is distinct from (p_review ->> 'inquiryId')::uuid then
    raise exception 'Acquisition case was not found';
  end if;
  select * into v_latest_evaluation from public.opportunity_evaluations
  where property_id = v_case.property_id order by evaluated_at desc, created_at desc limit 1;
  select * into v_latest_buyer_run from public.buyer_match_runs
  where property_id = v_case.property_id order by analyzed_at desc, created_at desc limit 1;
  select * into v_latest_decision from public.seller_acquisition_decisions
  where case_id = v_case.id order by decided_at desc, created_at desc limit 1;

  if p_review is null or jsonb_typeof(p_review) <> 'object'
    or jsonb_typeof(p_review -> 'items') <> 'array'
    or p_review ->> 'modelVersion' <> 'acquisition-diligence-v1'
    or coalesce((p_review ->> 'noOfferGenerated')::boolean, false) is not true
    or coalesce((p_review ->> 'noOutreachInitiated')::boolean, false) is not true
    or v_latest_evaluation.id is distinct from (p_review ->> 'sourceEvaluationId')::uuid
    or v_latest_buyer_run.id is distinct from (p_review ->> 'buyerMatchRunId')::uuid
    or v_latest_decision.id is distinct from (p_review ->> 'acquisitionDecisionId')::uuid
    or v_latest_decision.decision <> 'ADVANCE_TO_ACQUISITION_REVIEW'
    or v_latest_decision.source_evaluation_id is distinct from v_latest_evaluation.id
    or v_latest_decision.buyer_match_run_id is distinct from v_latest_buyer_run.id
  then raise exception 'Diligence requires the current advanced acquisition evidence'; end if;

  select
    count(*), count(distinct item ->> 'kind'),
    coalesce(array_agg(item ->> 'kind' order by item ->> 'kind') filter (
      where item ->> 'status' = 'OPEN'
        or (item ->> 'status' = 'NOT_APPLICABLE' and item ->> 'kind' in (
          'PROPERTY_IDENTITY', 'OWNER_IDENTITY', 'SELLER_AUTHORITY', 'TITLE', 'LIENS_PAYOFFS', 'TAXES',
          'CONDITION_REPAIRS', 'VALUE_SUPPORT', 'BUYER_DEMAND', 'WHOLESALE_DISCLOSURE'
        ))
    ), '{}'::text[]),
    coalesce(array_agg(item ->> 'kind' order by item ->> 'kind') filter (where item ->> 'status' = 'BLOCKED'), '{}'::text[])
  into v_item_count, v_distinct_item_count, v_open_item_kinds, v_blocked_item_kinds
  from jsonb_array_elements(p_review -> 'items') as item;

  if v_item_count <> 13 or v_distinct_item_count <> 13 then
    raise exception 'Exactly one of each required diligence item is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_review -> 'items')
  loop
    if v_item ->> 'kind' not in (
      'PROPERTY_IDENTITY', 'OWNER_IDENTITY', 'SELLER_AUTHORITY', 'TITLE', 'LIENS_PAYOFFS', 'TAXES',
      'DISTRESS_TIMELINE', 'OCCUPANCY', 'CONDITION_REPAIRS', 'VALUE_SUPPORT', 'BUYER_DEMAND',
      'WHOLESALE_DISCLOSURE', 'CONSENT_COMMUNICATIONS'
    ) or v_item ->> 'status' not in ('SATISFIED', 'OPEN', 'BLOCKED', 'NOT_APPLICABLE')
      or v_item ->> 'sourceType' not in ('PUBLIC_RECORD', 'HUMAN_VERIFIED', 'PROFESSIONAL_REVIEW', 'OPERATOR_REVIEW')
      or (v_item ->> 'costCents')::integer <> 0
      or (v_item ->> 'sourceType' <> 'OPERATOR_REVIEW' and nullif(v_item ->> 'sourceUrl', '') is null)
    then raise exception 'Every diligence item requires valid zero-cost evidence and provenance'; end if;
  end loop;

  if cardinality(v_blocked_item_kinds) > 0 then
    v_readiness := 'BLOCKED';
    v_reason_codes := array['DILIGENCE_BLOCKER_PRESENT'];
  elsif cardinality(v_open_item_kinds) > 0 or coalesce((p_review ->> 'materialFactsCurrent')::boolean, false) is not true then
    v_readiness := 'NEEDS_RESEARCH';
    if cardinality(v_open_item_kinds) > 0 then v_reason_codes := array_append(v_reason_codes, 'DILIGENCE_ITEMS_OPEN'); end if;
    if coalesce((p_review ->> 'materialFactsCurrent')::boolean, false) is not true then v_reason_codes := array_append(v_reason_codes, 'MATERIAL_FACTS_NOT_CURRENT'); end if;
  else
    v_readiness := 'READY_FOR_HUMAN_OFFER_AUTHORIZATION';
    v_reason_codes := array['READY_FOR_HUMAN_OFFER_AUTHORIZATION'];
  end if;

  if v_readiness is distinct from p_review ->> 'readiness'
    or v_open_item_kinds is distinct from array(select jsonb_array_elements_text(p_review -> 'openItemKinds') order by 1)
    or v_blocked_item_kinds is distinct from array(select jsonb_array_elements_text(p_review -> 'blockedItemKinds') order by 1)
  then raise exception 'Diligence assessment does not match the supplied evidence'; end if;

  insert into public.seller_acquisition_diligence_reviews (
    id, case_id, source_evaluation_id, buyer_match_run_id, acquisition_decision_id,
    model_version, readiness, reason_codes, open_item_kinds, blocked_item_kinds,
    summary, material_facts_current, no_offer_generated, no_outreach_initiated, reviewed_at
  ) values (
    v_review_id, v_case.id, v_latest_evaluation.id, v_latest_buyer_run.id, v_latest_decision.id,
    'acquisition-diligence-v1', v_readiness, v_reason_codes, v_open_item_kinds, v_blocked_item_kinds,
    p_review ->> 'summary', (p_review ->> 'materialFactsCurrent')::boolean, true, true,
    (p_review ->> 'reviewedAt')::timestamptz
  );

  for v_item in select * from jsonb_array_elements(p_review -> 'items')
  loop
    insert into public.seller_acquisition_diligence_items (
      review_id, kind, status, source_name, source_type, source_url,
      reviewed_at, confidence, notes, cost_cents
    ) values (
      v_review_id, v_item ->> 'kind', v_item ->> 'status', v_item ->> 'sourceName',
      v_item ->> 'sourceType', nullif(v_item ->> 'sourceUrl', ''),
      (v_item ->> 'reviewedAt')::timestamptz, (v_item ->> 'confidence')::numeric,
      v_item ->> 'notes', 0
    );
  end loop;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_ACQUISITION_DILIGENCE', v_review_id::text, 'RECORDED', jsonb_build_object(
    'case_id', v_case.id, 'inquiry_id', v_case.inquiry_id, 'property_id', v_case.property_id,
    'source_evaluation_id', v_latest_evaluation.id, 'buyer_match_run_id', v_latest_buyer_run.id,
    'acquisition_decision_id', v_latest_decision.id, 'readiness', v_readiness,
    'open_item_count', cardinality(v_open_item_kinds), 'blocked_item_count', cardinality(v_blocked_item_kinds),
    'total_cost_cents', 0, 'offer_authorized', false, 'offer_generated', false, 'outreach_initiated', false
  ));

  return jsonb_build_object('reviewId', v_review_id, 'caseId', v_case.id, 'created', true);
end;
$$;

create view public.current_seller_acquisition_diligence
with (security_invoker = true)
as
select
  review.id as review_id,
  review.case_id,
  review.source_evaluation_id,
  review.buyer_match_run_id,
  review.acquisition_decision_id,
  review.model_version,
  review.readiness,
  review.reason_codes,
  review.open_item_kinds,
  review.blocked_item_kinds,
  review.summary,
  review.material_facts_current,
  review.reviewed_at,
  coalesce(items.items, '[]'::jsonb) as items
from (
  select ranked.* from (
    select source.*, row_number() over (partition by source.case_id order by source.reviewed_at desc, source.created_at desc) as recency_rank
    from public.seller_acquisition_diligence_reviews as source
  ) as ranked where ranked.recency_rank = 1
) as review
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'kind', item.kind, 'status', item.status, 'sourceName', item.source_name,
    'sourceType', item.source_type, 'sourceUrl', item.source_url, 'reviewedAt', item.reviewed_at,
    'confidence', item.confidence, 'notes', item.notes, 'costCents', item.cost_cents
  ) order by item.kind) as items
  from public.seller_acquisition_diligence_items as item where item.review_id = review.id
) as items on true;

revoke execute on function public.record_seller_acquisition_diligence(jsonb) from public, anon, authenticated;
grant execute on function public.record_seller_acquisition_diligence(jsonb) to service_role;
grant select, insert on table public.seller_acquisition_diligence_reviews, public.seller_acquisition_diligence_items to service_role;
revoke update, delete on table public.seller_acquisition_diligence_reviews, public.seller_acquisition_diligence_items from service_role;
grant select on public.current_seller_acquisition_diligence to service_role, authenticated;

commit;
