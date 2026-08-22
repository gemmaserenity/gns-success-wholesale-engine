begin;

create extension if not exists pgcrypto;

create type public.pipeline_state as enum (
  'DISCOVERED', 'NORMALIZED', 'PRELIM_SCREEN', 'REJECTED', 'QUALIFIED'
);

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_record_id text not null,
  source_url text,
  retrieved_at timestamptz not null,
  parser_version text not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (source, source_record_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  county text not null check (county in ('MARICOPA', 'PINAL')),
  apn text not null,
  canonical_address text not null,
  property_type text,
  square_feet integer check (square_feet is null or square_feet > 0),
  year_built integer check (year_built is null or year_built between 1800 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county, apn)
);

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.ownership_interests (
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete restrict,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  source_record_id uuid references public.source_records(id) on delete set null,
  valid_from date,
  valid_to date,
  primary key (property_id, owner_id)
);

create table public.distress_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_record_id uuid not null references public.source_records(id) on delete restrict,
  event_type text not null check (event_type = 'NOTICE_OF_TRUSTEE_SALE'),
  recorded_date date,
  trustee_sale_date date,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (source_record_id, event_type)
);

create table public.opportunity_evaluations (
  id uuid primary key,
  deduplication_key text not null,
  county text not null check (county in ('MARICOPA', 'PINAL')),
  apn text not null,
  canonical_address text not null,
  owner_name text not null,
  trustee_sale_date date,
  state public.pipeline_state not null,
  score integer not null check (score between 0 and 100),
  confidence text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  next_action text not null check (next_action in ('REJECT', 'RESEARCH', 'ENRICH', 'HUMAN_REVIEW', 'CONTACT_READY')),
  base_underwriting jsonb not null,
  evaluation jsonb not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index opportunity_queue_idx on public.opportunity_evaluations (state, score desc, evaluated_at desc);
create index opportunity_property_idx on public.opportunity_evaluations (county, apn, evaluated_at desc);
create index trustee_sale_date_idx on public.distress_events (trustee_sale_date) where status = 'ACTIVE';

create table public.pipeline_events (
  id bigint generated always as identity primary key,
  evaluation_id uuid not null references public.opportunity_evaluations(id) on delete cascade,
  from_state public.pipeline_state,
  to_state public.pipeline_state not null,
  reason_codes text[] not null default '{}',
  actor_type text not null check (actor_type in ('SYSTEM', 'HUMAN')),
  actor_id uuid,
  occurred_at timestamptz not null default now()
);

create table public.human_overrides (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.opportunity_evaluations(id) on delete cascade,
  previous_action text not null,
  override_action text not null,
  rationale text not null check (char_length(rationale) >= 10),
  operator_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.source_records enable row level security;
alter table public.properties enable row level security;
alter table public.owners enable row level security;
alter table public.ownership_interests enable row level security;
alter table public.distress_events enable row level security;
alter table public.opportunity_evaluations enable row level security;
alter table public.pipeline_events enable row level security;
alter table public.human_overrides enable row level security;
alter table public.audit_events enable row level security;

create policy "authenticated operators can read source records" on public.source_records for select to authenticated using (true);
create policy "authenticated operators can read properties" on public.properties for select to authenticated using (true);
create policy "authenticated operators can read owners" on public.owners for select to authenticated using (true);
create policy "authenticated operators can read ownership" on public.ownership_interests for select to authenticated using (true);
create policy "authenticated operators can read distress events" on public.distress_events for select to authenticated using (true);
create policy "authenticated operators can read evaluations" on public.opportunity_evaluations for select to authenticated using (true);
create policy "authenticated operators can read pipeline events" on public.pipeline_events for select to authenticated using (true);
create policy "authenticated operators can read overrides" on public.human_overrides for select to authenticated using (true);
create policy "authenticated operators can create overrides" on public.human_overrides for insert to authenticated with check (operator_id = auth.uid());
create policy "authenticated operators can read audit events" on public.audit_events for select to authenticated using (true);

commit;
