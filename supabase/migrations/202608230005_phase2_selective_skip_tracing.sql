begin;

create table public.skip_trace_cases (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_id uuid not null references public.owners(id) on delete restrict,
  source_evaluation_id uuid not null unique references public.opportunity_evaluations(id) on delete restrict,
  status text not null default 'READY_FOR_RESEARCH'
    check (status in ('READY_FOR_RESEARCH', 'COMPLETED', 'CANCELLED')),
  purpose text not null
    check (purpose in ('OWNER_LOCATION', 'OWNER_IDENTITY_CONFIRMATION', 'AUTHORIZED_REPRESENTATIVE')),
  necessity_reason text not null check (char_length(necessity_reason) between 20 and 1000),
  identity_basis text not null check (char_length(identity_basis) between 20 and 1000),
  planned_source_type text not null
    check (planned_source_type in ('PUBLIC_RECORD', 'OPERATOR_RESEARCH', 'PERMITTED_PROVIDER', 'PAID_PROVIDER')),
  provider text not null check (char_length(provider) between 2 and 120),
  source_url text,
  estimated_cost_cents integer not null check (estimated_cost_cents between 0 and 100000),
  actual_cost_cents integer not null default 0 check (actual_cost_cents between 0 and 100000),
  privacy_notes text not null check (char_length(privacy_notes) between 20 and 1000),
  qualification_snapshot jsonb not null check (jsonb_typeof(qualification_snapshot) = 'object'),
  outcome text check (outcome is null or outcome in ('CONTACT_FOUND', 'NO_MATCH', 'NEEDS_REVIEW')),
  requested_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'COMPLETED') = (completed_at is not null)),
  check ((status = 'COMPLETED') = (outcome is not null)),
  check (planned_source_type = 'OPERATOR_RESEARCH' or source_url is not null),
  check (planned_source_type <> 'PAID_PROVIDER' or estimated_cost_cents > 0)
);

create table public.skip_trace_findings (
  id uuid primary key,
  case_id uuid not null references public.skip_trace_cases(id) on delete restrict,
  kind text not null check (kind in ('PHONE', 'EMAIL', 'MAILING_ADDRESS', 'OTHER')),
  finding_value text not null check (char_length(finding_value) between 3 and 500),
  subject_name text not null check (char_length(subject_name) between 2 and 200),
  identity_status text not null
    check (identity_status in ('UNVERIFIED', 'OWNER', 'AUTHORIZED_REPRESENTATIVE', 'WRONG_PARTY', 'STALE')),
  provider text not null check (char_length(provider) between 2 and 120),
  source_type text not null
    check (source_type in ('PUBLIC_RECORD', 'OPERATOR_RESEARCH', 'PERMITTED_PROVIDER', 'PAID_PROVIDER')),
  source_url text,
  source_record_id text,
  retrieved_at timestamptz not null,
  classification text not null
    check (classification in ('VERIFIED', 'PUBLIC_RECORD', 'HUMAN_VERIFIED', 'ESTIMATED')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  cost_cents integer not null check (cost_cents between 0 and 100000),
  research_notes text not null check (char_length(research_notes) between 10 and 1000),
  created_at timestamptz not null default now(),
  unique (case_id, kind, finding_value),
  check (source_type = 'OPERATOR_RESEARCH' or source_url is not null),
  check (source_type <> 'PAID_PROVIDER' or cost_cents > 0)
);

create table public.seller_contact_standing_events (
  id uuid primary key,
  owner_id uuid not null references public.owners(id) on delete restrict,
  case_id uuid not null references public.skip_trace_cases(id) on delete restrict,
  standing text not null
    check (standing in ('UNKNOWN', 'CONSENTED', 'EXISTING_RELATIONSHIP', 'DO_NOT_CONTACT', 'DECEASED')),
  allowed_channels text[] not null default '{}',
  reason text not null check (char_length(reason) between 10 and 1000),
  evidence_source text not null check (char_length(evidence_source) between 2 and 200),
  evidence_url text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (allowed_channels <@ array['CALL', 'TEXT', 'EMAIL', 'MAIL']::text[]),
  check (
    (standing in ('CONSENTED', 'EXISTING_RELATIONSHIP') and cardinality(allowed_channels) > 0)
    or (standing not in ('CONSENTED', 'EXISTING_RELATIONSHIP') and cardinality(allowed_channels) = 0)
  )
);

create index skip_trace_property_history_idx on public.skip_trace_cases (property_id, requested_at desc);
create index skip_trace_owner_history_idx on public.skip_trace_cases (owner_id, requested_at desc);
create index skip_trace_finding_case_idx on public.skip_trace_findings (case_id, created_at);
create index seller_contact_standing_owner_idx
  on public.seller_contact_standing_events (owner_id, observed_at desc, created_at desc);

alter table public.skip_trace_cases enable row level security;
alter table public.skip_trace_findings enable row level security;
alter table public.seller_contact_standing_events enable row level security;

create or replace function public.create_skip_trace_case(p_case jsonb, p_gate jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid := (p_case ->> 'caseId')::uuid;
  v_evaluation_id uuid := (p_case ->> 'evaluationId')::uuid;
  v_property_id uuid;
  v_owner_id uuid;
  v_state public.pipeline_state;
  v_score integer;
  v_assignment_fee numeric;
  v_owner_confidence numeric;
  v_existing public.skip_trace_cases%rowtype;
  v_current_standing text;
  v_estimated_cost integer := (p_case ->> 'estimatedCostCents')::integer;
  v_maximum_cost integer := (p_gate ->> 'maximumApprovedCostCents')::integer;
begin
  select * into v_existing
  from public.skip_trace_cases where source_evaluation_id = v_evaluation_id;
  if found then
    return jsonb_build_object('caseId', v_existing.id, 'propertyId', v_existing.property_id, 'created', false);
  end if;

  if p_case is null or jsonb_typeof(p_case) <> 'object'
    or p_gate is null or jsonb_typeof(p_gate) <> 'object'
    or coalesce((p_case ->> 'publicRecordsReviewed')::boolean, false) is not true
    or coalesce((p_case ->> 'contactStandingReviewed')::boolean, false) is not true
    or coalesce((p_gate ->> 'allowed')::boolean, false) is not true
    or coalesce((p_gate ->> 'externalTransmissionAllowed')::boolean, true) is not false
    or not coalesce((p_gate -> 'reasonCodes') ? 'SKIP_TRACE_RESEARCH_APPROVED', false)
  then
    raise exception 'A qualified research-only skip-trace request and gate are required';
  end if;

  select evaluation.property_id, evaluation.state, evaluation.score,
    (evaluation.base_underwriting ->> 'expectedAssignmentFee')::numeric,
    owner.id, interest.confidence
  into v_property_id, v_state, v_score, v_assignment_fee, v_owner_id, v_owner_confidence
  from public.opportunity_evaluations as evaluation
  join public.owners as owner on owner.normalized_name = evaluation.owner_name
  join public.ownership_interests as interest
    on interest.property_id = evaluation.property_id and interest.owner_id = owner.id and interest.valid_to is null
  where evaluation.id = v_evaluation_id;

  if not found or v_property_id is null then
    raise exception 'Selective skip tracing requires a persisted evaluation, property, and current owner interest';
  end if;

  select event.standing into v_current_standing
  from public.seller_contact_standing_events as event
  where event.owner_id = v_owner_id
  order by event.observed_at desc, event.created_at desc
  limit 1;

  if v_current_standing = 'DO_NOT_CONTACT' then
    raise exception 'Owner has an active do-not-contact suppression';
  end if;

  if v_state <> 'QUALIFIED'
    or v_score < 80
    or v_assignment_fee < 10000
    or v_owner_confidence < 0.65
    or v_maximum_cost is null
    or v_maximum_cost < 0
    or v_estimated_cost < 0
    or v_estimated_cost > v_maximum_cost
    or v_maximum_cost > floor(v_assignment_fee)
    or (p_gate ->> 'expectedAssignmentFee')::numeric is distinct from v_assignment_fee
    or (p_gate ->> 'ownerConfidence')::numeric is distinct from v_owner_confidence
  then
    raise exception 'Skip-trace qualification or cost evidence does not match the persisted opportunity';
  end if;

  insert into public.skip_trace_cases (
    id, property_id, owner_id, source_evaluation_id, purpose, necessity_reason,
    identity_basis, planned_source_type, provider, source_url,
    estimated_cost_cents, privacy_notes, qualification_snapshot, requested_at
  ) values (
    v_case_id, v_property_id, v_owner_id, v_evaluation_id,
    p_case ->> 'purpose', p_case ->> 'necessityReason', p_case ->> 'identityBasis',
    p_case ->> 'plannedSourceType', p_case ->> 'provider', nullif(p_case ->> 'sourceUrl', ''),
    v_estimated_cost, p_case ->> 'privacyNotes', p_gate, (p_case ->> 'requestedAt')::timestamptz
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'SKIP_TRACE_CASE', v_case_id::text, 'RESEARCH_APPROVED',
    jsonb_build_object(
      'property_id', v_property_id,
      'owner_id', v_owner_id,
      'source_evaluation_id', v_evaluation_id,
      'purpose', p_case ->> 'purpose',
      'planned_source_type', p_case ->> 'plannedSourceType',
      'estimated_cost_cents', v_estimated_cost,
      'reason_codes', p_gate -> 'reasonCodes',
      'external_transmission_allowed', false
    )
  );

  return jsonb_build_object('caseId', v_case_id, 'propertyId', v_property_id, 'created', true);
end;
$$;

create or replace function public.persist_skip_trace_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.skip_trace_cases%rowtype;
  v_case_id uuid := (p_result ->> 'caseId')::uuid;
  v_outcome text := p_result ->> 'outcome';
  v_actual_cost integer := (p_result ->> 'actualCostCents')::integer;
  v_maximum_cost integer;
  v_finding jsonb;
  v_finding_count integer;
  v_allocated_cost integer;
  v_completed_at timestamptz := (p_result ->> 'completedAt')::timestamptz;
  v_contact_standing text;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
    or jsonb_typeof(p_result -> 'findings') <> 'array'
  then
    raise exception 'A complete skip-trace result is required';
  end if;

  select * into v_case from public.skip_trace_cases where id = v_case_id for update;
  if not found then raise exception 'Skip-trace case was not found'; end if;

  if v_case.status = 'COMPLETED' then
    return jsonb_build_object('caseId', v_case.id, 'propertyId', v_case.property_id, 'findingsStored', 0);
  end if;
  if v_case.status <> 'READY_FOR_RESEARCH' then raise exception 'Skip-trace case is not open for research'; end if;

  select count(*), coalesce(sum((item ->> 'costCents')::integer), 0)
  into v_finding_count, v_allocated_cost
  from jsonb_array_elements(p_result -> 'findings') as item;
  v_maximum_cost := (v_case.qualification_snapshot ->> 'maximumApprovedCostCents')::integer;

  if v_finding_count > 10
    or (v_outcome = 'CONTACT_FOUND' and v_finding_count = 0)
    or (v_outcome = 'NO_MATCH' and v_finding_count <> 0)
    or v_allocated_cost > v_actual_cost
    or v_actual_cost > v_maximum_cost
  then
    raise exception 'Skip-trace result, evidence count, or cost allocation is invalid';
  end if;

  for v_finding in select * from jsonb_array_elements(p_result -> 'findings')
  loop
    insert into public.skip_trace_findings (
      id, case_id, kind, finding_value, subject_name, identity_status,
      provider, source_type, source_url, source_record_id, retrieved_at,
      classification, confidence, cost_cents, research_notes
    ) values (
      (v_finding ->> 'id')::uuid, v_case_id, v_finding ->> 'kind', v_finding ->> 'value',
      v_finding ->> 'subjectName', v_finding ->> 'identityStatus', v_finding ->> 'provider',
      v_finding ->> 'sourceType', nullif(v_finding ->> 'sourceUrl', ''),
      nullif(v_finding ->> 'sourceRecordId', ''), (v_finding ->> 'retrievedAt')::timestamptz,
      v_finding ->> 'classification', (v_finding ->> 'confidence')::numeric,
      (v_finding ->> 'costCents')::integer, v_finding ->> 'researchNotes'
    );
  end loop;

  if not exists (select 1 from public.seller_contact_standing_events where owner_id = v_case.owner_id) then
    insert into public.seller_contact_standing_events (
      id, owner_id, case_id, standing, allowed_channels, reason, evidence_source, observed_at
    ) values (
      gen_random_uuid(), v_case.owner_id, v_case.id, 'UNKNOWN', '{}',
      'Contact evidence was recorded; permission for outreach has not been established.',
      'SYSTEM_DEFAULT', v_completed_at
    );
  end if;

  select event.standing into v_contact_standing
  from public.seller_contact_standing_events as event
  where event.owner_id = v_case.owner_id
  order by event.observed_at desc, event.created_at desc
  limit 1;

  update public.skip_trace_cases set
    status = 'COMPLETED', outcome = v_outcome, actual_cost_cents = v_actual_cost, completed_at = v_completed_at
  where id = v_case_id;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'SKIP_TRACE_CASE', v_case_id::text, 'RESEARCH_COMPLETED',
    jsonb_build_object(
      'property_id', v_case.property_id,
      'owner_id', v_case.owner_id,
      'outcome', v_outcome,
      'finding_count', v_finding_count,
      'actual_cost_cents', v_actual_cost,
      'contact_standing', v_contact_standing,
      'outreach_initiated', false
    )
  );

  return jsonb_build_object('caseId', v_case.id, 'propertyId', v_case.property_id, 'findingsStored', v_finding_count);
end;
$$;

create or replace function public.record_seller_contact_standing(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.skip_trace_cases%rowtype;
  v_event_id uuid := (p_event ->> 'eventId')::uuid;
  v_standing text := p_event ->> 'standing';
  v_channels text[] := array(select jsonb_array_elements_text(p_event -> 'allowedChannels'));
  v_current_standing text;
begin
  select * into v_case from public.skip_trace_cases where id = (p_event ->> 'caseId')::uuid;
  if not found then raise exception 'Skip-trace case was not found'; end if;

  if (v_standing in ('CONSENTED', 'EXISTING_RELATIONSHIP') and cardinality(v_channels) = 0)
    or (v_standing not in ('CONSENTED', 'EXISTING_RELATIONSHIP') and cardinality(v_channels) <> 0)
  then
    raise exception 'Contact standing and allowed channels are inconsistent';
  end if;

  select event.standing into v_current_standing
  from public.seller_contact_standing_events as event
  where event.owner_id = v_case.owner_id
  order by event.observed_at desc, event.created_at desc
  limit 1;

  if v_current_standing = 'DO_NOT_CONTACT' and v_standing not in ('DO_NOT_CONTACT', 'CONSENTED') then
    raise exception 'Do-not-contact standing can only remain suppressed or be replaced by explicit consent evidence';
  end if;

  insert into public.seller_contact_standing_events (
    id, owner_id, case_id, standing, allowed_channels, reason,
    evidence_source, evidence_url, observed_at
  ) values (
    v_event_id, v_case.owner_id, v_case.id, v_standing, v_channels,
    p_event ->> 'reason', p_event ->> 'evidenceSource',
    nullif(p_event ->> 'evidenceUrl', ''), (p_event ->> 'observedAt')::timestamptz
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'SELLER_CONTACT_STANDING', v_event_id::text, 'RECORDED',
    jsonb_build_object(
      'owner_id', v_case.owner_id,
      'case_id', v_case.id,
      'standing', v_standing,
      'allowed_channels', v_channels,
      'evidence_source', p_event ->> 'evidenceSource',
      'outreach_initiated', false
    )
  );

  return jsonb_build_object('eventId', v_event_id, 'caseId', v_case.id, 'standing', v_standing);
end;
$$;

create view public.latest_skip_trace_status
with (security_invoker = true)
as
select
  trace.id as case_id,
  trace.source_evaluation_id,
  trace.property_id,
  trace.owner_id,
  owner.display_name as owner_name,
  trace.status,
  trace.purpose,
  trace.necessity_reason,
  trace.identity_basis,
  trace.planned_source_type,
  trace.provider,
  trace.source_url,
  trace.estimated_cost_cents,
  trace.actual_cost_cents,
  trace.privacy_notes,
  trace.qualification_snapshot,
  trace.outcome,
  trace.requested_at,
  trace.completed_at,
  coalesce(standing.standing, 'UNKNOWN') as contact_standing,
  coalesce(standing.allowed_channels, '{}') as allowed_channels,
  standing.reason as standing_reason,
  coalesce(findings.items, '[]'::jsonb) as findings
from (
  select ranked.* from (
    select source.*, row_number() over (
      partition by source.property_id order by source.requested_at desc, source.created_at desc
    ) as recency_rank
    from public.skip_trace_cases as source
  ) as ranked where ranked.recency_rank = 1
) as trace
join public.owners as owner on owner.id = trace.owner_id
left join lateral (
  select event.standing, event.allowed_channels, event.reason
  from public.seller_contact_standing_events as event
  where event.owner_id = trace.owner_id
  order by event.observed_at desc, event.created_at desc
  limit 1
) as standing on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', finding.id,
      'kind', finding.kind,
      'value', finding.finding_value,
      'subjectName', finding.subject_name,
      'identityStatus', finding.identity_status,
      'provider', finding.provider,
      'sourceType', finding.source_type,
      'sourceUrl', finding.source_url,
      'sourceRecordId', finding.source_record_id,
      'retrievedAt', finding.retrieved_at,
      'classification', finding.classification,
      'confidence', finding.confidence,
      'costCents', finding.cost_cents,
      'researchNotes', finding.research_notes
    ) order by finding.created_at
  ) as items
  from public.skip_trace_findings as finding where finding.case_id = trace.id
) as findings on true;

revoke execute on function public.create_skip_trace_case(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.persist_skip_trace_result(jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_contact_standing(jsonb) from public, anon, authenticated;
grant execute on function public.create_skip_trace_case(jsonb, jsonb) to service_role;
grant execute on function public.persist_skip_trace_result(jsonb) to service_role;
grant execute on function public.record_seller_contact_standing(jsonb) to service_role;

grant select, insert, update on table public.skip_trace_cases to service_role;
grant select, insert on table public.skip_trace_findings, public.seller_contact_standing_events to service_role;
grant select on public.latest_skip_trace_status to service_role;

commit;
