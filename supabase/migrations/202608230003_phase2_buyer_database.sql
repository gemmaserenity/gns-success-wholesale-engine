begin;

create table public.buyers (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 2 and 160),
  normalized_name text not null check (char_length(normalized_name) between 2 and 160),
  company_name text,
  email text,
  phone text,
  status text not null check (status in ('ACTIVE', 'PAUSED', 'DO_NOT_CONTACT', 'ARCHIVED')),
  contact_status text not null check (contact_status in ('UNVERIFIED', 'RELATIONSHIP', 'OPTED_IN', 'DO_NOT_CONTACT')),
  source text not null check (char_length(source) between 2 and 120),
  source_url text,
  notes text check (notes is null or char_length(notes) <= 2000),
  verified_purchase_count integer not null default 0 check (verified_purchase_count between 0 and 100000),
  gns_closing_count integer not null default 0 check (gns_closing_count between 0 and 100000),
  retrade_count integer not null default 0 check (retrade_count between 0 and 100000),
  reliability_score integer check (reliability_score is null or reliability_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null),
  check ((status = 'DO_NOT_CONTACT') = (contact_status = 'DO_NOT_CONTACT'))
);

create unique index buyer_email_once_idx on public.buyers (lower(email)) where email is not null;
create index buyer_operating_queue_idx on public.buyers (status, reliability_score desc nulls last, updated_at desc);

create table public.buyer_criteria (
  buyer_id uuid primary key references public.buyers(id) on delete cascade,
  preferred_counties text[] not null,
  preferred_zips text[] not null default '{}',
  property_types text[] not null,
  purchase_price_min numeric(14,2) check (purchase_price_min is null or purchase_price_min >= 0),
  purchase_price_max numeric(14,2) check (purchase_price_max is null or purchase_price_max >= 0),
  arv_min numeric(14,2) check (arv_min is null or arv_min >= 0),
  arv_max numeric(14,2) check (arv_max is null or arv_max >= 0),
  max_repairs numeric(14,2) check (max_repairs is null or max_repairs >= 0),
  square_feet_min integer check (square_feet_min is null or square_feet_min >= 0),
  square_feet_max integer check (square_feet_max is null or square_feet_max >= 0),
  year_built_min integer check (year_built_min is null or year_built_min between 1800 and 2200),
  year_built_max integer check (year_built_max is null or year_built_max between 1800 and 2200),
  hoa_preference text not null check (hoa_preference in ('ALLOWED', 'AVOID', 'EITHER')),
  occupancies text[] not null,
  close_speed_days integer check (close_speed_days is null or close_speed_days between 1 and 180),
  financing text[] not null,
  updated_at timestamptz not null default now(),
  check (cardinality(preferred_counties) between 1 and 2),
  check (preferred_counties <@ array['MARICOPA', 'PINAL']::text[]),
  check (cardinality(property_types) between 1 and 6),
  check (property_types <@ array['SFR', 'CONDO', 'TOWNHOUSE', 'MULTIFAMILY', 'MOBILE_HOME', 'LAND']::text[]),
  check (cardinality(occupancies) between 1 and 4),
  check (occupancies <@ array['VACANT', 'TENANT_OCCUPIED', 'OWNER_OCCUPIED', 'ANY']::text[]),
  check (not ('ANY' = any(occupancies)) or cardinality(occupancies) = 1),
  check (cardinality(financing) between 1 and 5),
  check (financing <@ array['CASH', 'HARD_MONEY', 'PRIVATE_MONEY', 'CONVENTIONAL', 'OTHER']::text[]),
  check (purchase_price_min is null or purchase_price_max is null or purchase_price_min <= purchase_price_max),
  check (arv_min is null or arv_max is null or arv_min <= arv_max),
  check (square_feet_min is null or square_feet_max is null or square_feet_min <= square_feet_max),
  check (year_built_min is null or year_built_max is null or year_built_min <= year_built_max)
);

create index buyer_criteria_counties_idx on public.buyer_criteria using gin (preferred_counties);
create index buyer_criteria_zips_idx on public.buyer_criteria using gin (preferred_zips);
create index buyer_criteria_property_types_idx on public.buyer_criteria using gin (property_types);

alter table public.buyers enable row level security;
alter table public.buyer_criteria enable row level security;

create policy "authenticated operators can read buyers"
  on public.buyers for select to authenticated using (true);
create policy "authenticated operators can read buyer criteria"
  on public.buyer_criteria for select to authenticated using (true);

create or replace function public.persist_buyer_profile(p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer_id uuid := (p_profile ->> 'id')::uuid;
  v_criteria jsonb := p_profile -> 'criteria';
  v_created boolean;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object'
    or v_criteria is null or jsonb_typeof(v_criteria) <> 'object'
  then
    raise exception 'A complete buyer profile and criteria are required';
  end if;

  select not exists(select 1 from public.buyers where id = v_buyer_id) into v_created;

  insert into public.buyers (
    id, display_name, normalized_name, company_name, email, phone, status, contact_status,
    source, source_url, notes, verified_purchase_count, gns_closing_count, retrade_count,
    reliability_score
  ) values (
    v_buyer_id,
    p_profile ->> 'displayName',
    upper(regexp_replace(trim(p_profile ->> 'displayName'), '\s+', ' ', 'g')),
    nullif(p_profile ->> 'companyName', ''),
    lower(nullif(p_profile ->> 'email', '')),
    nullif(p_profile ->> 'phone', ''),
    p_profile ->> 'status',
    p_profile ->> 'contactStatus',
    p_profile ->> 'source',
    nullif(p_profile ->> 'sourceUrl', ''),
    nullif(p_profile ->> 'notes', ''),
    (p_profile ->> 'verifiedPurchaseCount')::integer,
    (p_profile ->> 'gnsClosingCount')::integer,
    (p_profile ->> 'retradeCount')::integer,
    nullif(p_profile ->> 'reliabilityScore', '')::integer
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    normalized_name = excluded.normalized_name,
    company_name = excluded.company_name,
    email = excluded.email,
    phone = excluded.phone,
    status = excluded.status,
    contact_status = excluded.contact_status,
    source = excluded.source,
    source_url = excluded.source_url,
    notes = excluded.notes,
    verified_purchase_count = excluded.verified_purchase_count,
    gns_closing_count = excluded.gns_closing_count,
    retrade_count = excluded.retrade_count,
    reliability_score = excluded.reliability_score,
    updated_at = now();

  insert into public.buyer_criteria (
    buyer_id, preferred_counties, preferred_zips, property_types, purchase_price_min,
    purchase_price_max, arv_min, arv_max, max_repairs, square_feet_min, square_feet_max,
    year_built_min, year_built_max, hoa_preference, occupancies, close_speed_days, financing
  ) values (
    v_buyer_id,
    array(select jsonb_array_elements_text(v_criteria -> 'preferredCounties')),
    array(select jsonb_array_elements_text(v_criteria -> 'preferredZips')),
    array(select jsonb_array_elements_text(v_criteria -> 'propertyTypes')),
    nullif(v_criteria ->> 'purchasePriceMin', '')::numeric,
    nullif(v_criteria ->> 'purchasePriceMax', '')::numeric,
    nullif(v_criteria ->> 'arvMin', '')::numeric,
    nullif(v_criteria ->> 'arvMax', '')::numeric,
    nullif(v_criteria ->> 'maxRepairs', '')::numeric,
    nullif(v_criteria ->> 'squareFeetMin', '')::integer,
    nullif(v_criteria ->> 'squareFeetMax', '')::integer,
    nullif(v_criteria ->> 'yearBuiltMin', '')::integer,
    nullif(v_criteria ->> 'yearBuiltMax', '')::integer,
    v_criteria ->> 'hoaPreference',
    array(select jsonb_array_elements_text(v_criteria -> 'occupancies')),
    nullif(v_criteria ->> 'closeSpeedDays', '')::integer,
    array(select jsonb_array_elements_text(v_criteria -> 'financing'))
  )
  on conflict (buyer_id) do update set
    preferred_counties = excluded.preferred_counties,
    preferred_zips = excluded.preferred_zips,
    property_types = excluded.property_types,
    purchase_price_min = excluded.purchase_price_min,
    purchase_price_max = excluded.purchase_price_max,
    arv_min = excluded.arv_min,
    arv_max = excluded.arv_max,
    max_repairs = excluded.max_repairs,
    square_feet_min = excluded.square_feet_min,
    square_feet_max = excluded.square_feet_max,
    year_built_min = excluded.year_built_min,
    year_built_max = excluded.year_built_max,
    hoa_preference = excluded.hoa_preference,
    occupancies = excluded.occupancies,
    close_speed_days = excluded.close_speed_days,
    financing = excluded.financing,
    updated_at = now();

  insert into public.audit_events (entity_type, entity_id, action, details)
  values (
    'BUYER_PROFILE',
    v_buyer_id::text,
    case when v_created then 'CREATED' else 'UPDATED' end,
    jsonb_build_object(
      'status', p_profile ->> 'status',
      'contact_status', p_profile ->> 'contactStatus',
      'preferred_counties', v_criteria -> 'preferredCounties',
      'property_types', v_criteria -> 'propertyTypes'
    )
  );

  return jsonb_build_object('buyerId', v_buyer_id, 'created', v_created);
end;
$$;

create view public.buyer_profiles
with (security_invoker = true)
as
select
  buyer.id,
  buyer.display_name,
  buyer.company_name,
  buyer.email,
  buyer.phone,
  buyer.status,
  buyer.contact_status,
  buyer.source,
  buyer.source_url,
  buyer.notes,
  buyer.verified_purchase_count,
  buyer.gns_closing_count,
  buyer.retrade_count,
  buyer.reliability_score,
  jsonb_strip_nulls(jsonb_build_object(
    'preferredCounties', criteria.preferred_counties,
    'preferredZips', criteria.preferred_zips,
    'propertyTypes', criteria.property_types,
    'purchasePriceMin', criteria.purchase_price_min,
    'purchasePriceMax', criteria.purchase_price_max,
    'arvMin', criteria.arv_min,
    'arvMax', criteria.arv_max,
    'maxRepairs', criteria.max_repairs,
    'squareFeetMin', criteria.square_feet_min,
    'squareFeetMax', criteria.square_feet_max,
    'yearBuiltMin', criteria.year_built_min,
    'yearBuiltMax', criteria.year_built_max,
    'hoaPreference', criteria.hoa_preference,
    'occupancies', criteria.occupancies,
    'closeSpeedDays', criteria.close_speed_days,
    'financing', criteria.financing
  )) as criteria,
  criteria.preferred_counties,
  buyer.created_at,
  greatest(buyer.updated_at, criteria.updated_at) as updated_at
from public.buyers as buyer
join public.buyer_criteria as criteria on criteria.buyer_id = buyer.id;

revoke execute on function public.persist_buyer_profile(jsonb) from public, anon, authenticated;
grant execute on function public.persist_buyer_profile(jsonb) to service_role;

grant select, insert, update on table public.buyers, public.buyer_criteria to service_role;
grant select on public.buyer_profiles to service_role, authenticated;

commit;
