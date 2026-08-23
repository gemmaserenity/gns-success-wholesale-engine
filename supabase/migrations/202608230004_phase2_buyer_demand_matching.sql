begin;

alter table public.property_facts
  drop constraint if exists property_facts_field_name_check;
alter table public.property_facts
  add constraint property_facts_field_name_check check (field_name in (
    'propertyType', 'squareFeet', 'bedrooms', 'bathrooms', 'yearBuilt',
    'lotSquareFeet', 'assessedValue', 'lastSaleDate', 'lastSalePrice',
    'occupancy', 'hoaStatus', 'mailingAddress', 'arvLow', 'arvHigh',
    'repairsLow', 'repairsHigh', 'debtLow', 'debtHigh', 'liens'
  ));

create table public.buyer_match_runs (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  source_evaluation_id uuid not null unique references public.opportunity_evaluations(id) on delete restrict,
  revised_evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  model_version text not null check (model_version = 'buyer-demand-v1'),
  buyer_demand_score integer not null check (buyer_demand_score between 0 and 100),
  probable_buyer_count integer not null check (probable_buyer_count between 0 and 100),
  possible_buyer_count integer not null check (possible_buyer_count between 0 and 100),
  eligible_buyer_count integer not null check (eligible_buyer_count between 0 and 100),
  evaluated_buyer_count integer not null check (evaluated_buyer_count between 0 and 100),
  buyer_pool_truncated boolean not null,
  reason_codes text[] not null,
  property_snapshot jsonb not null check (jsonb_typeof(property_snapshot) = 'object'),
  analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (probable_buyer_count + possible_buyer_count <= eligible_buyer_count),
  check (eligible_buyer_count <= evaluated_buyer_count)
);

create table public.buyer_matches (
  run_id uuid not null references public.buyer_match_runs(id) on delete cascade,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  classification text not null check (classification in ('PROBABLE', 'POSSIBLE', 'EXCLUDED', 'INELIGIBLE')),
  fit_score integer not null check (fit_score between 0 and 100),
  credibility_score integer not null check (credibility_score between 0 and 100),
  reason_codes text[] not null,
  criteria jsonb not null check (jsonb_typeof(criteria) = 'array'),
  buyer_snapshot jsonb not null check (jsonb_typeof(buyer_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  primary key (run_id, buyer_id)
);

create index buyer_match_property_history_idx on public.buyer_match_runs (property_id, analyzed_at desc);
create index buyer_match_probable_idx on public.buyer_matches (run_id, fit_score desc, credibility_score desc)
  where classification = 'PROBABLE';

alter table public.buyer_match_runs enable row level security;
alter table public.buyer_matches enable row level security;

create policy "authenticated operators can read buyer match runs"
  on public.buyer_match_runs for select to authenticated using (true);
create policy "authenticated operators can read buyer matches"
  on public.buyer_matches for select to authenticated using (true);

create or replace function public.persist_buyer_match_run(
  p_run jsonb,
  p_revised_evaluation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid := (p_run ->> 'runId')::uuid;
  v_source_evaluation_id uuid := (p_run ->> 'sourceEvaluationId')::uuid;
  v_property_id uuid;
  v_deduplication_key text;
  v_revised_evaluation_id uuid;
  v_existing public.buyer_match_runs%rowtype;
  v_match jsonb;
  v_match_count integer;
  v_probable_count integer;
  v_possible_count integer;
  v_eligible_count integer;
begin
  select * into v_existing
  from public.buyer_match_runs as run
  where run.source_evaluation_id = v_source_evaluation_id;

  if found then
    return jsonb_build_object(
      'runId', v_existing.id,
      'propertyId', v_existing.property_id,
      'revisedEvaluationId', v_existing.revised_evaluation_id
    );
  end if;

  if p_run is null or jsonb_typeof(p_run) <> 'object'
    or p_revised_evaluation is null or jsonb_typeof(p_revised_evaluation) <> 'object'
    or jsonb_typeof(p_run -> 'matches') <> 'array'
    or jsonb_typeof(p_run -> 'property') <> 'object'
  then
    raise exception 'A complete buyer-match run and revised evaluation are required';
  end if;

  select evaluation.property_id, evaluation.deduplication_key
  into v_property_id, v_deduplication_key
  from public.opportunity_evaluations as evaluation
  where evaluation.id = v_source_evaluation_id;

  if not found or v_property_id is null or v_property_id <> (p_run ->> 'propertyId')::uuid then
    raise exception 'Buyer matching requires a persisted evaluation and matching normalized property';
  end if;

  select
    count(*),
    count(*) filter (where item ->> 'classification' = 'PROBABLE'),
    count(*) filter (where item ->> 'classification' = 'POSSIBLE'),
    count(*) filter (where item ->> 'classification' <> 'INELIGIBLE')
  into v_match_count, v_probable_count, v_possible_count, v_eligible_count
  from jsonb_array_elements(p_run -> 'matches') as item;

  if v_match_count > 100
    or v_match_count <> (p_run ->> 'evaluatedBuyerCount')::integer
    or v_probable_count <> (p_run ->> 'probableBuyerCount')::integer
    or v_possible_count <> (p_run ->> 'possibleBuyerCount')::integer
    or v_eligible_count <> (p_run ->> 'eligibleBuyerCount')::integer
  then
    raise exception 'Buyer-match aggregate counts do not match the supplied results';
  end if;

  if p_revised_evaluation #>> '{lead,deduplicationKey}' is distinct from v_deduplication_key
    or p_revised_evaluation ->> 'parserVersion' is distinct from p_run ->> 'modelVersion'
    or (p_revised_evaluation #>> '{rawInput,buyerDemandScore}')::integer
      is distinct from (p_run ->> 'buyerDemandScore')::integer
  then
    raise exception 'Revised evaluation does not match the buyer-demand run';
  end if;

  v_revised_evaluation_id := (public.persist_opportunity_evaluation(p_revised_evaluation) ->> 'evaluationId')::uuid;

  insert into public.buyer_match_runs (
    id, property_id, source_evaluation_id, revised_evaluation_id, model_version,
    buyer_demand_score, probable_buyer_count, possible_buyer_count,
    eligible_buyer_count, evaluated_buyer_count, buyer_pool_truncated,
    reason_codes, property_snapshot, analyzed_at
  ) values (
    v_run_id,
    v_property_id,
    v_source_evaluation_id,
    v_revised_evaluation_id,
    p_run ->> 'modelVersion',
    (p_run ->> 'buyerDemandScore')::integer,
    v_probable_count,
    v_possible_count,
    v_eligible_count,
    v_match_count,
    (p_run ->> 'buyerPoolTruncated')::boolean,
    array(select jsonb_array_elements_text(p_run -> 'reasonCodes')),
    p_run -> 'property',
    (p_run ->> 'analyzedAt')::timestamptz
  );

  for v_match in select * from jsonb_array_elements(p_run -> 'matches')
  loop
    if not exists(select 1 from public.buyers where id = (v_match ->> 'buyerId')::uuid) then
      raise exception 'Buyer-match result references an unknown buyer';
    end if;

    insert into public.buyer_matches (
      run_id, buyer_id, classification, fit_score, credibility_score,
      reason_codes, criteria, buyer_snapshot
    ) values (
      v_run_id,
      (v_match ->> 'buyerId')::uuid,
      v_match ->> 'classification',
      (v_match ->> 'fitScore')::integer,
      (v_match ->> 'credibilityScore')::integer,
      array(select jsonb_array_elements_text(v_match -> 'reasonCodes')),
      v_match -> 'criteria',
      v_match -> 'buyerSnapshot'
    );
  end loop;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'BUYER_MATCH_RUN',
    v_run_id::text,
    'PERSISTED',
    jsonb_build_object(
      'property_id', v_property_id,
      'source_evaluation_id', v_source_evaluation_id,
      'revised_evaluation_id', v_revised_evaluation_id,
      'buyer_demand_score', (p_run ->> 'buyerDemandScore')::integer,
      'probable_buyer_count', v_probable_count,
      'evaluated_buyer_count', v_match_count,
      'model_version', p_run ->> 'modelVersion'
    )
  );

  return jsonb_build_object(
    'runId', v_run_id,
    'propertyId', v_property_id,
    'revisedEvaluationId', v_revised_evaluation_id
  );
end;
$$;

create view public.latest_buyer_match_status
with (security_invoker = true)
as
select
  run.id as run_id,
  run.source_evaluation_id,
  run.revised_evaluation_id,
  run.property_id,
  run.model_version,
  run.buyer_demand_score,
  run.probable_buyer_count,
  run.possible_buyer_count,
  run.eligible_buyer_count,
  run.evaluated_buyer_count,
  run.buyer_pool_truncated,
  run.reason_codes,
  run.property_snapshot,
  coalesce(matches.items, '[]'::jsonb) as matches,
  run.analyzed_at
from (
  select ranked.*
  from (
    select source.*, row_number() over (
      partition by source.property_id order by source.analyzed_at desc, source.created_at desc
    ) as recency_rank
    from public.buyer_match_runs as source
  ) as ranked
  where ranked.recency_rank = 1
) as run
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'buyerId', match.buyer_id,
      'buyerName', match.buyer_snapshot ->> 'displayName',
      'classification', match.classification,
      'fitScore', match.fit_score,
      'credibilityScore', match.credibility_score,
      'reasonCodes', match.reason_codes,
      'criteria', match.criteria,
      'buyerSnapshot', match.buyer_snapshot
    ) order by
      case match.classification when 'PROBABLE' then 0 when 'POSSIBLE' then 1 when 'EXCLUDED' then 2 else 3 end,
      match.fit_score desc,
      match.credibility_score desc
  ) as items
  from public.buyer_matches as match
  where match.run_id = run.id
) as matches on true;

revoke execute on function public.persist_buyer_match_run(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_buyer_match_run(jsonb, jsonb) to service_role;

grant select, insert on table public.buyer_match_runs, public.buyer_matches to service_role;
grant select on public.latest_buyer_match_status to service_role, authenticated;

commit;
