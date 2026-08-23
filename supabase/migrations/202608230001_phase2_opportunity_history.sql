begin;

alter table public.owners
  add constraint owners_normalized_name_key unique (normalized_name);

alter table public.opportunity_evaluations
  add column property_id uuid references public.properties(id) on delete restrict,
  add column distress_event_id uuid references public.distress_events(id) on delete set null;

create index opportunity_evaluation_property_history_idx
  on public.opportunity_evaluations (property_id, evaluated_at desc);

create unique index system_pipeline_event_once_idx
  on public.pipeline_events (evaluation_id, actor_type, to_state)
  where actor_type = 'SYSTEM';

create unique index evaluation_audit_action_once_idx
  on public.audit_events (entity_type, entity_id, action)
  where entity_type = 'OPPORTUNITY_EVALUATION';

create or replace function public.persist_opportunity_evaluation(p_evaluation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead jsonb := p_evaluation -> 'lead';
  v_raw jsonb := p_evaluation -> 'rawInput';
  v_source_record_id text;
  v_source_id uuid;
  v_property_id uuid;
  v_owner_id uuid;
  v_distress_event_id uuid;
  v_evaluation_id uuid;
begin
  if p_evaluation is null
    or jsonb_typeof(p_evaluation) <> 'object'
    or v_lead is null
    or jsonb_typeof(v_lead) <> 'object'
  then
    raise exception 'A complete opportunity evaluation is required';
  end if;

  v_evaluation_id := (p_evaluation ->> 'evaluationId')::uuid;
  v_source_record_id := coalesce(
    nullif(v_lead ->> 'sourceRecordId', ''),
    p_evaluation ->> 'evaluationId'
  );

  insert into public.source_records (
    source,
    source_record_id,
    source_url,
    retrieved_at,
    parser_version,
    raw_payload,
    normalized_payload,
    confidence
  ) values (
    v_lead ->> 'source',
    v_source_record_id,
    nullif(v_lead ->> 'sourceUrl', ''),
    (v_lead ->> 'retrievedAt')::timestamptz,
    p_evaluation ->> 'parserVersion',
    v_raw,
    v_lead,
    (v_lead ->> 'dataConfidence')::numeric
  )
  on conflict (source, source_record_id) do update set
    source_url = excluded.source_url,
    retrieved_at = excluded.retrieved_at,
    parser_version = excluded.parser_version,
    raw_payload = excluded.raw_payload,
    normalized_payload = excluded.normalized_payload,
    confidence = excluded.confidence
  returning id into v_source_id;

  insert into public.properties (
    county,
    apn,
    canonical_address,
    property_type,
    square_feet,
    year_built
  ) values (
    v_lead ->> 'county',
    v_lead ->> 'apn',
    v_lead ->> 'address',
    nullif(v_lead ->> 'propertyType', ''),
    nullif(v_lead ->> 'squareFeet', '')::integer,
    nullif(v_lead ->> 'yearBuilt', '')::integer
  )
  on conflict (county, apn) do update set
    canonical_address = excluded.canonical_address,
    property_type = coalesce(excluded.property_type, properties.property_type),
    square_feet = coalesce(excluded.square_feet, properties.square_feet),
    year_built = coalesce(excluded.year_built, properties.year_built),
    updated_at = now()
  returning id into v_property_id;

  insert into public.owners (normalized_name, display_name)
  values (
    v_lead ->> 'ownerName',
    coalesce(nullif(v_raw ->> 'ownerName', ''), v_lead ->> 'ownerName')
  )
  on conflict (normalized_name) do update set
    display_name = excluded.display_name
  returning id into v_owner_id;

  insert into public.ownership_interests (
    property_id,
    owner_id,
    confidence,
    source_record_id
  ) values (
    v_property_id,
    v_owner_id,
    (v_lead ->> 'ownerConfidence')::numeric,
    v_source_id
  )
  on conflict (property_id, owner_id) do update set
    confidence = excluded.confidence,
    source_record_id = excluded.source_record_id,
    valid_to = null;

  insert into public.distress_events (
    property_id,
    source_record_id,
    event_type,
    recorded_date,
    trustee_sale_date,
    status
  ) values (
    v_property_id,
    v_source_id,
    'NOTICE_OF_TRUSTEE_SALE',
    nullif(v_lead ->> 'recordedDate', '')::date,
    nullif(v_lead ->> 'trusteeSaleDate', '')::date,
    case
      when nullif(v_lead ->> 'trusteeSaleDate', '')::date < current_date then 'PAST_DUE'
      else 'ACTIVE'
    end
  )
  on conflict (source_record_id, event_type) do update set
    property_id = excluded.property_id,
    recorded_date = excluded.recorded_date,
    trustee_sale_date = excluded.trustee_sale_date,
    status = excluded.status
  returning id into v_distress_event_id;

  insert into public.opportunity_evaluations (
    id,
    property_id,
    distress_event_id,
    deduplication_key,
    county,
    apn,
    canonical_address,
    owner_name,
    trustee_sale_date,
    state,
    score,
    confidence,
    next_action,
    base_underwriting,
    evaluation,
    evaluated_at
  ) values (
    v_evaluation_id,
    v_property_id,
    v_distress_event_id,
    v_lead ->> 'deduplicationKey',
    v_lead ->> 'county',
    v_lead ->> 'apn',
    v_lead ->> 'address',
    v_lead ->> 'ownerName',
    nullif(v_lead ->> 'trusteeSaleDate', '')::date,
    (p_evaluation ->> 'state')::public.pipeline_state,
    (p_evaluation #>> '{score,total}')::integer,
    p_evaluation ->> 'confidence',
    p_evaluation ->> 'nextAction',
    p_evaluation #> '{scenarios,1}',
    p_evaluation,
    (p_evaluation ->> 'evaluatedAt')::timestamptz
  )
  on conflict (id) do nothing;

  insert into public.pipeline_events (
    evaluation_id,
    from_state,
    to_state,
    reason_codes,
    actor_type,
    occurred_at
  ) values (
    v_evaluation_id,
    null,
    (p_evaluation ->> 'state')::public.pipeline_state,
    array(
      select reason ->> 'code'
      from jsonb_array_elements(p_evaluation -> 'reasons') as reason
    ),
    'SYSTEM',
    (p_evaluation ->> 'evaluatedAt')::timestamptz
  )
  on conflict (evaluation_id, actor_type, to_state)
    where actor_type = 'SYSTEM'
  do nothing;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'OPPORTUNITY_EVALUATION',
    v_evaluation_id::text,
    'PERSISTED',
    jsonb_build_object(
      'property_id', v_property_id,
      'source_record_id', v_source_id,
      'distress_event_id', v_distress_event_id
    )
  )
  on conflict (entity_type, entity_id, action)
    where entity_type = 'OPPORTUNITY_EVALUATION'
  do nothing;

  return jsonb_build_object(
    'evaluationId', v_evaluation_id,
    'propertyId', v_property_id,
    'sourceRecordId', v_source_id,
    'distressEventId', v_distress_event_id
  );
end;
$$;

create view public.current_opportunities
with (security_invoker = true)
as
select
  ranked.id as evaluation_id,
  ranked.property_id,
  ranked.deduplication_key,
  ranked.county,
  ranked.apn,
  ranked.canonical_address,
  ranked.owner_name,
  ranked.trustee_sale_date,
  ranked.state,
  ranked.score,
  ranked.confidence,
  ranked.next_action,
  ranked.base_underwriting,
  ranked.evaluated_at,
  ranked.history_count
from (
  select
    evaluation.*,
    row_number() over (
      partition by evaluation.deduplication_key
      order by evaluation.evaluated_at desc, evaluation.created_at desc
    ) as recency_rank,
    count(*) over (partition by evaluation.deduplication_key) as history_count
  from public.opportunity_evaluations as evaluation
) as ranked
where ranked.recency_rank = 1;

revoke execute on function public.persist_opportunity_evaluation(jsonb) from public, anon, authenticated;
grant execute on function public.persist_opportunity_evaluation(jsonb) to service_role;

grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.source_records,
  public.properties,
  public.owners,
  public.ownership_interests,
  public.distress_events,
  public.opportunity_evaluations,
  public.pipeline_events,
  public.audit_events
to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on public.current_opportunities to service_role, authenticated;

commit;
