begin;

insert into public.properties (county, apn, canonical_address)
select distinct on (evaluation.county, evaluation.apn)
  evaluation.county,
  evaluation.apn,
  evaluation.canonical_address
from public.opportunity_evaluations as evaluation
where evaluation.property_id is null
order by evaluation.county, evaluation.apn, evaluation.evaluated_at desc
on conflict (county, apn) do update set
  canonical_address = excluded.canonical_address,
  updated_at = now();

update public.opportunity_evaluations as evaluation
set property_id = property.id
from public.properties as property
where evaluation.property_id is null
  and property.county = evaluation.county
  and property.apn = evaluation.apn;

alter table public.properties
  add column bedrooms numeric(4,1) check (bedrooms is null or bedrooms between 0 and 30),
  add column bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 30),
  add column lot_square_feet integer check (lot_square_feet is null or lot_square_feet > 0),
  add column assessed_value numeric(14,2) check (assessed_value is null or assessed_value >= 0),
  add column last_sale_date date,
  add column last_sale_price numeric(14,2) check (last_sale_price is null or last_sale_price >= 0),
  add column occupancy text,
  add column mailing_address text;

create table public.property_enrichment_runs (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  evaluation_id uuid not null references public.opportunity_evaluations(id) on delete restrict,
  revised_evaluation_id uuid references public.opportunity_evaluations(id) on delete set null,
  provider text not null check (char_length(provider) between 2 and 120),
  source_type text not null check (source_type in ('OPERATOR_RESEARCH', 'PUBLIC_RECORD', 'PERMITTED_API', 'PAID_PROVIDER')),
  source_url text,
  retrieved_at timestamptz not null,
  cost_cents integer not null check (cost_cents between 0 and 100000),
  average_confidence numeric(4,3) not null check (average_confidence between 0 and 1),
  gate_reason_codes text[] not null,
  created_at timestamptz not null default now()
);

create table public.property_facts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  enrichment_run_id uuid not null references public.property_enrichment_runs(id) on delete cascade,
  field_name text not null check (field_name in (
    'propertyType', 'squareFeet', 'bedrooms', 'bathrooms', 'yearBuilt',
    'lotSquareFeet', 'assessedValue', 'lastSaleDate', 'lastSalePrice',
    'occupancy', 'mailingAddress', 'arvLow', 'arvHigh', 'repairsLow',
    'repairsHigh', 'debtLow', 'debtHigh', 'liens'
  )),
  fact_value jsonb not null,
  classification text not null check (classification in ('VERIFIED', 'PUBLIC_RECORD', 'ESTIMATED', 'MODEL_DERIVED', 'HUMAN_VERIFIED')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  observed_at timestamptz not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (enrichment_run_id, field_name)
);

create unique index current_property_fact_once_idx
  on public.property_facts (property_id, field_name)
  where is_current;
create index property_enrichment_history_idx
  on public.property_enrichment_runs (property_id, retrieved_at desc);
create index property_fact_history_idx
  on public.property_facts (property_id, field_name, observed_at desc);

alter table public.property_enrichment_runs enable row level security;
alter table public.property_facts enable row level security;

create policy "authenticated operators can read enrichment runs"
  on public.property_enrichment_runs for select to authenticated using (true);
create policy "authenticated operators can read property facts"
  on public.property_facts for select to authenticated using (true);

create or replace function public.persist_property_enrichment(
  p_run jsonb,
  p_gate jsonb,
  p_revised_evaluation jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid := (p_run ->> 'runId')::uuid;
  v_evaluation_id uuid := (p_run ->> 'evaluationId')::uuid;
  v_property_id uuid;
  v_existing_revised_id uuid;
  v_revised_evaluation_id uuid;
  v_state public.pipeline_state;
  v_score integer;
  v_assignment_fee numeric;
  v_paid boolean;
  v_average_confidence numeric;
  v_fact_count integer;
  v_fact jsonb;
  v_field text;
  v_value jsonb;
begin
  select run.property_id, run.revised_evaluation_id
  into v_property_id, v_existing_revised_id
  from public.property_enrichment_runs as run
  where run.id = v_run_id;

  if found then
    return jsonb_build_object(
      'runId', v_run_id,
      'propertyId', v_property_id,
      'revisedEvaluationId', v_existing_revised_id,
      'factsStored', (
        select count(*) from public.property_facts as fact where fact.enrichment_run_id = v_run_id
      )
    );
  end if;

  if coalesce((p_gate ->> 'allowed')::boolean, false) is not true then
    raise exception 'Enrichment gate denied this request';
  end if;

  select
    evaluation.property_id,
    evaluation.state,
    evaluation.score,
    (evaluation.base_underwriting ->> 'expectedAssignmentFee')::numeric
  into v_property_id, v_state, v_score, v_assignment_fee
  from public.opportunity_evaluations as evaluation
  where evaluation.id = v_evaluation_id;

  if not found or v_property_id is null then
    raise exception 'A persisted evaluation with a normalized property is required';
  end if;

  select count(*), avg((fact ->> 'confidence')::numeric)
  into v_fact_count, v_average_confidence
  from jsonb_array_elements(p_run -> 'facts') as fact;

  if v_fact_count < 1 or v_fact_count > 25 then
    raise exception 'An enrichment run must contain between 1 and 25 facts';
  end if;

  v_paid := (p_run ->> 'costCents')::integer > 0 or p_run ->> 'sourceType' = 'PAID_PROVIDER';
  if v_state = 'REJECTED' then
    raise exception 'Rejected opportunities cannot be enriched';
  end if;
  if v_paid and (v_state <> 'QUALIFIED' or v_score < 80 or v_assignment_fee < 10000) then
    raise exception 'Paid enrichment requires a qualified opportunity with target economics';
  end if;
  if v_paid and v_average_confidence < 0.65 then
    raise exception 'Paid enrichment requires average confidence of at least 0.65';
  end if;
  if v_paid and (p_run ->> 'costCents')::integer > (p_gate ->> 'maximumApprovedCostCents')::integer then
    raise exception 'Paid enrichment cost exceeds the approved limit';
  end if;

  insert into public.property_enrichment_runs (
    id,
    property_id,
    evaluation_id,
    provider,
    source_type,
    source_url,
    retrieved_at,
    cost_cents,
    average_confidence,
    gate_reason_codes
  ) values (
    v_run_id,
    v_property_id,
    v_evaluation_id,
    p_run ->> 'provider',
    p_run ->> 'sourceType',
    nullif(p_run ->> 'sourceUrl', ''),
    (p_run ->> 'retrievedAt')::timestamptz,
    (p_run ->> 'costCents')::integer,
    v_average_confidence,
    array(select jsonb_array_elements_text(p_gate -> 'reasonCodes'))
  );

  for v_fact in select * from jsonb_array_elements(p_run -> 'facts')
  loop
    v_field := v_fact ->> 'field';
    v_value := v_fact -> 'value';

    update public.property_facts
    set is_current = false
    where property_id = v_property_id
      and field_name = v_field
      and is_current;

    insert into public.property_facts (
      property_id,
      enrichment_run_id,
      field_name,
      fact_value,
      classification,
      confidence,
      observed_at
    ) values (
      v_property_id,
      v_run_id,
      v_field,
      v_value,
      v_fact ->> 'classification',
      (v_fact ->> 'confidence')::numeric,
      (p_run ->> 'retrievedAt')::timestamptz
    );

    update public.properties
    set
      property_type = case when v_field = 'propertyType' then v_value #>> '{}' else property_type end,
      square_feet = case when v_field = 'squareFeet' then (v_value #>> '{}')::integer else square_feet end,
      bedrooms = case when v_field = 'bedrooms' then (v_value #>> '{}')::numeric else bedrooms end,
      bathrooms = case when v_field = 'bathrooms' then (v_value #>> '{}')::numeric else bathrooms end,
      year_built = case when v_field = 'yearBuilt' then (v_value #>> '{}')::integer else year_built end,
      lot_square_feet = case when v_field = 'lotSquareFeet' then (v_value #>> '{}')::integer else lot_square_feet end,
      assessed_value = case when v_field = 'assessedValue' then (v_value #>> '{}')::numeric else assessed_value end,
      last_sale_date = case when v_field = 'lastSaleDate' then (v_value #>> '{}')::date else last_sale_date end,
      last_sale_price = case when v_field = 'lastSalePrice' then (v_value #>> '{}')::numeric else last_sale_price end,
      occupancy = case when v_field = 'occupancy' then v_value #>> '{}' else occupancy end,
      mailing_address = case when v_field = 'mailingAddress' then v_value #>> '{}' else mailing_address end,
      updated_at = now()
    where id = v_property_id;
  end loop;

  if p_revised_evaluation is not null then
    v_revised_evaluation_id := (public.persist_opportunity_evaluation(p_revised_evaluation) ->> 'evaluationId')::uuid;
    update public.property_enrichment_runs
    set revised_evaluation_id = v_revised_evaluation_id
    where id = v_run_id;
  end if;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'PROPERTY_ENRICHMENT',
    v_run_id::text,
    'PERSISTED',
    jsonb_build_object(
      'property_id', v_property_id,
      'evaluation_id', v_evaluation_id,
      'revised_evaluation_id', v_revised_evaluation_id,
      'cost_cents', (p_run ->> 'costCents')::integer,
      'fact_count', v_fact_count,
      'gate_reason_codes', p_gate -> 'reasonCodes'
    )
  );

  return jsonb_build_object(
    'runId', v_run_id,
    'propertyId', v_property_id,
    'revisedEvaluationId', v_revised_evaluation_id,
    'factsStored', v_fact_count
  );
end;
$$;

create view public.property_enrichment_status
with (security_invoker = true)
as
select
  property.id as property_id,
  coalesce(cost.total_cost_cents, 0)::bigint as total_cost_cents,
  cost.last_enriched_at,
  cost.average_confidence,
  coalesce(facts.current_facts, '[]'::jsonb) as current_facts
from public.properties as property
left join lateral (
  select
    sum(run.cost_cents) as total_cost_cents,
    max(run.retrieved_at) as last_enriched_at,
    avg(run.average_confidence) as average_confidence
  from public.property_enrichment_runs as run
  where run.property_id = property.id
) as cost on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', fact.id,
      'field', fact.field_name,
      'value', fact.fact_value,
      'classification', fact.classification,
      'confidence', fact.confidence,
      'observedAt', fact.observed_at,
      'provider', run.provider,
      'sourceType', run.source_type,
      'sourceUrl', run.source_url,
      'costCents', run.cost_cents
    ) order by fact.field_name
  ) as current_facts
  from public.property_facts as fact
  join public.property_enrichment_runs as run on run.id = fact.enrichment_run_id
  where fact.property_id = property.id and fact.is_current
) as facts on true;

revoke execute on function public.persist_property_enrichment(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_property_enrichment(jsonb, jsonb, jsonb) to service_role;

grant select, insert, update, delete on table
  public.property_enrichment_runs,
  public.property_facts
to service_role;
grant select on public.property_enrichment_status to service_role, authenticated;

commit;
