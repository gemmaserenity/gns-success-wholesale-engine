begin;

create table public.seller_inquiries (
  id uuid primary key,
  submitted_at timestamptz not null,
  seller_name text not null check (char_length(seller_name) between 2 and 160),
  email text,
  phone text,
  property_address text not null check (char_length(property_address) between 8 and 300),
  county text not null check (county in ('MARICOPA', 'PINAL', 'OTHER_ARIZONA', 'OUTSIDE_ARIZONA', 'UNKNOWN')),
  apn text,
  relationship text not null check (relationship in ('OWNER', 'CO_OWNER', 'AUTHORIZED_REPRESENTATIVE', 'OTHER')),
  timeline text not null check (timeline in ('0_30_DAYS', '31_60_DAYS', '61_90_DAYS', 'OVER_90_DAYS', 'UNSURE')),
  motivation text not null check (motivation in ('FORECLOSURE', 'INHERITED', 'VACANT', 'REPAIRS', 'RELOCATION', 'FINANCIAL', 'LANDLORD', 'OTHER')),
  property_condition text not null check (property_condition in ('MAJOR_REPAIRS', 'MODERATE_REPAIRS', 'LIGHT_REPAIRS', 'MOVE_IN_READY', 'UNKNOWN')),
  occupancy text not null check (occupancy in ('OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'VACANT', 'OTHER', 'UNKNOWN')),
  asking_price numeric check (asking_price is null or asking_price between 0 and 100000000),
  mortgage_balance numeric check (mortgage_balance is null or mortgage_balance between 0 and 100000000),
  notes text check (notes is null or char_length(notes) <= 2000),
  consent_email boolean not null,
  consent_call boolean not null,
  consent_text boolean not null,
  privacy_statement_version text not null default 'seller-privacy-v1',
  source text not null default 'PUBLIC_SELLER_PORTAL',
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null),
  check (not consent_email or email is not null),
  check (not (consent_call or consent_text) or phone is not null)
);

create table public.seller_qualification_assessments (
  id uuid primary key,
  inquiry_id uuid not null unique references public.seller_inquiries(id) on delete restrict,
  model_version text not null check (model_version = 'seller-intake-v1'),
  score integer not null check (score between 0 and 100),
  tier text not null check (tier in ('PRIORITY', 'REVIEW', 'NURTURE', 'INELIGIBLE')),
  reason_codes text[] not null,
  review_flags text[] not null,
  eligible_for_booking boolean not null,
  summary text not null check (char_length(summary) between 10 and 1000),
  assessed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (eligible_for_booking = (tier in ('PRIORITY', 'REVIEW')))
);

create table public.seller_inquiry_consent_events (
  id uuid primary key,
  inquiry_id uuid not null references public.seller_inquiries(id) on delete restrict,
  channel text not null check (channel in ('EMAIL', 'CALL', 'TEXT')),
  granted boolean not null,
  statement_version text not null check (statement_version = 'seller-contact-consent-v1'),
  evidence_source text not null check (evidence_source = 'PUBLIC_SELLER_PORTAL'),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (inquiry_id, channel)
);

create table public.seller_inquiry_status_events (
  id uuid primary key,
  inquiry_id uuid not null references public.seller_inquiries(id) on delete restrict,
  status text not null check (status in ('NEW', 'REVIEWING', 'CONTACTED', 'APPOINTMENT_SET', 'CLOSED')),
  rationale text not null check (char_length(rationale) between 10 and 1000),
  actor_type text not null check (actor_type in ('SYSTEM', 'OPERATOR')),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_appointment_offers (
  id uuid primary key,
  inquiry_id uuid not null unique references public.seller_inquiries(id) on delete restrict,
  provider text not null check (provider = 'CALCOM'),
  booking_url text not null,
  offered_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_communication_deliveries (
  id uuid primary key,
  inquiry_id uuid not null references public.seller_inquiries(id) on delete restrict,
  kind text not null check (kind in ('SELLER_ACKNOWLEDGEMENT', 'OPERATOR_NOTIFICATION')),
  provider text not null check (provider = 'RESEND'),
  status text not null check (status in ('SENT', 'SKIPPED', 'FAILED')),
  provider_message_id text,
  error_code text,
  idempotency_key text not null unique,
  attempted_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((status = 'SENT') = (provider_message_id is not null)),
  check (status = 'SENT' or error_code is not null)
);

create index seller_inquiries_submitted_idx on public.seller_inquiries (submitted_at desc);
create index seller_qualification_tier_idx on public.seller_qualification_assessments (tier, score desc);
create index seller_status_history_idx on public.seller_inquiry_status_events (inquiry_id, recorded_at desc, created_at desc);
create index seller_delivery_history_idx on public.seller_communication_deliveries (inquiry_id, attempted_at desc);

alter table public.seller_inquiries enable row level security;
alter table public.seller_qualification_assessments enable row level security;
alter table public.seller_inquiry_consent_events enable row level security;
alter table public.seller_inquiry_status_events enable row level security;
alter table public.seller_appointment_offers enable row level security;
alter table public.seller_communication_deliveries enable row level security;

create or replace function public.persist_seller_inquiry(p_inquiry jsonb, p_qualification jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inquiry_id uuid := (p_inquiry ->> 'submissionId')::uuid;
  v_submitted_at timestamptz := (p_inquiry ->> 'submittedAt')::timestamptz;
  v_started_at timestamptz := (p_inquiry ->> 'startedAt')::timestamptz;
  v_existing public.seller_inquiries%rowtype;
  v_channel text;
  v_granted boolean;
  v_booking_url text := nullif(p_inquiry ->> 'bookingUrl', '');
begin
  select * into v_existing from public.seller_inquiries where id = v_inquiry_id;
  if found then return jsonb_build_object('inquiryId', v_existing.id, 'created', false); end if;

  if p_inquiry is null or jsonb_typeof(p_inquiry) <> 'object'
    or p_qualification is null or jsonb_typeof(p_qualification) <> 'object'
    or coalesce((p_inquiry ->> 'privacyAccepted')::boolean, false) is not true
    or nullif(p_inquiry ->> 'companyWebsite', '') is not null
    or v_submitted_at - v_started_at < interval '2 seconds'
    or v_started_at < v_submitted_at - interval '24 hours'
    or p_qualification ->> 'modelVersion' <> 'seller-intake-v1'
    or jsonb_typeof(p_qualification -> 'reasonCodes') <> 'array'
    or jsonb_typeof(p_qualification -> 'reviewFlags') <> 'array'
  then raise exception 'A valid, privacy-accepted seller inquiry is required'; end if;

  insert into public.seller_inquiries (
    id, submitted_at, seller_name, email, phone, property_address, county, apn,
    relationship, timeline, motivation, property_condition, occupancy,
    asking_price, mortgage_balance, notes, consent_email, consent_call, consent_text
  ) values (
    v_inquiry_id, v_submitted_at, p_inquiry ->> 'name', nullif(p_inquiry ->> 'email', ''),
    nullif(p_inquiry ->> 'phone', ''), p_inquiry ->> 'propertyAddress', p_inquiry ->> 'county',
    nullif(p_inquiry ->> 'apn', ''), p_inquiry ->> 'relationship', p_inquiry ->> 'timeline',
    p_inquiry ->> 'motivation', p_inquiry ->> 'condition', p_inquiry ->> 'occupancy',
    nullif(p_inquiry ->> 'askingPrice', '')::numeric, nullif(p_inquiry ->> 'mortgageBalance', '')::numeric,
    nullif(p_inquiry ->> 'notes', ''), (p_inquiry ->> 'consentEmail')::boolean,
    (p_inquiry ->> 'consentCall')::boolean, (p_inquiry ->> 'consentText')::boolean
  );

  insert into public.seller_qualification_assessments (
    id, inquiry_id, model_version, score, tier, reason_codes, review_flags,
    eligible_for_booking, summary, assessed_at
  ) values (
    gen_random_uuid(), v_inquiry_id, p_qualification ->> 'modelVersion',
    (p_qualification ->> 'score')::integer, p_qualification ->> 'tier',
    array(select jsonb_array_elements_text(p_qualification -> 'reasonCodes')),
    array(select jsonb_array_elements_text(p_qualification -> 'reviewFlags')),
    (p_qualification ->> 'eligibleForBooking')::boolean, p_qualification ->> 'summary', v_submitted_at
  );

  foreach v_channel in array array['EMAIL', 'CALL', 'TEXT'] loop
    v_granted := case v_channel when 'EMAIL' then (p_inquiry ->> 'consentEmail')::boolean when 'CALL' then (p_inquiry ->> 'consentCall')::boolean else (p_inquiry ->> 'consentText')::boolean end;
    insert into public.seller_inquiry_consent_events (
      id, inquiry_id, channel, granted, statement_version, evidence_source, observed_at
    ) values (gen_random_uuid(), v_inquiry_id, v_channel, v_granted, 'seller-contact-consent-v1', 'PUBLIC_SELLER_PORTAL', v_submitted_at);
  end loop;

  insert into public.seller_inquiry_status_events (id, inquiry_id, status, rationale, actor_type, recorded_at)
  values (gen_random_uuid(), v_inquiry_id, 'NEW', 'Seller submitted the public property-intake form.', 'SYSTEM', v_submitted_at);

  if v_booking_url is not null and coalesce((p_qualification ->> 'eligibleForBooking')::boolean, false) then
    insert into public.seller_appointment_offers (id, inquiry_id, provider, booking_url, offered_at)
    values (gen_random_uuid(), v_inquiry_id, 'CALCOM', v_booking_url, v_submitted_at);
  end if;

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_INQUIRY', v_inquiry_id::text, 'RECEIVED', jsonb_build_object(
    'county', p_inquiry ->> 'county', 'relationship', p_inquiry ->> 'relationship',
    'qualification_tier', p_qualification ->> 'tier', 'qualification_score', (p_qualification ->> 'score')::integer,
    'consented_channels', (select coalesce(jsonb_agg(channel), '[]'::jsonb) from (values
      ('EMAIL', (p_inquiry ->> 'consentEmail')::boolean), ('CALL', (p_inquiry ->> 'consentCall')::boolean), ('TEXT', (p_inquiry ->> 'consentText')::boolean)
    ) as consent(channel, granted) where granted), 'booking_offered', v_booking_url is not null
  ));

  return jsonb_build_object('inquiryId', v_inquiry_id, 'created', true);
end;
$$;

create or replace function public.record_seller_communication_delivery(p_delivery jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := (p_delivery ->> 'deliveryId')::uuid;
  v_existing_id uuid;
begin
  if not exists (select 1 from public.seller_inquiries where id = (p_delivery ->> 'inquiryId')::uuid) then
    raise exception 'Seller inquiry was not found';
  end if;
  select id into v_existing_id from public.seller_communication_deliveries
  where idempotency_key = p_delivery ->> 'idempotencyKey';
  if found then return jsonb_build_object('deliveryId', v_existing_id); end if;

  insert into public.seller_communication_deliveries (
    id, inquiry_id, kind, provider, status, provider_message_id, error_code, idempotency_key, attempted_at
  ) values (
    v_id, (p_delivery ->> 'inquiryId')::uuid, p_delivery ->> 'kind', 'RESEND', p_delivery ->> 'status',
    nullif(p_delivery ->> 'providerMessageId', ''), nullif(p_delivery ->> 'errorCode', ''),
    p_delivery ->> 'idempotencyKey', (p_delivery ->> 'attemptedAt')::timestamptz
  );
  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_COMMUNICATION', v_id::text, 'DELIVERY_RECORDED', jsonb_build_object(
    'inquiry_id', p_delivery ->> 'inquiryId', 'kind', p_delivery ->> 'kind',
    'provider', 'RESEND', 'status', p_delivery ->> 'status', 'error_code', p_delivery ->> 'errorCode'
  ));
  return jsonb_build_object('deliveryId', v_id);
end;
$$;

create or replace function public.record_seller_inquiry_status(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inquiry_id uuid := (p_event ->> 'inquiryId')::uuid;
  v_current_status text;
begin
  select event.status into v_current_status from public.seller_inquiry_status_events event
  where event.inquiry_id = v_inquiry_id order by event.recorded_at desc, event.created_at desc limit 1;
  if not found then raise exception 'Seller inquiry was not found'; end if;
  if v_current_status = 'CLOSED' and p_event ->> 'status' <> 'CLOSED' then raise exception 'Closed seller inquiries cannot be reopened'; end if;
  insert into public.seller_inquiry_status_events (id, inquiry_id, status, rationale, actor_type, recorded_at)
  values ((p_event ->> 'eventId')::uuid, v_inquiry_id, p_event ->> 'status', p_event ->> 'rationale', 'OPERATOR', (p_event ->> 'recordedAt')::timestamptz);
  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_INQUIRY', v_inquiry_id::text, 'STATUS_RECORDED', jsonb_build_object(
    'from_status', v_current_status, 'to_status', p_event ->> 'status', 'rationale', p_event ->> 'rationale'
  ));
  return jsonb_build_object('inquiryId', v_inquiry_id, 'status', p_event ->> 'status');
end;
$$;

create view public.current_seller_inquiries
with (security_invoker = true)
as
select
  inquiry.id, inquiry.submitted_at, inquiry.seller_name, inquiry.email, inquiry.phone,
  inquiry.property_address, inquiry.county, inquiry.apn, inquiry.relationship, inquiry.timeline,
  inquiry.motivation, inquiry.property_condition, inquiry.occupancy, inquiry.asking_price,
  inquiry.mortgage_balance, inquiry.notes, inquiry.consent_email, inquiry.consent_call, inquiry.consent_text,
  status.status as current_status,
  qualification.tier as qualification_tier,
  jsonb_build_object(
    'modelVersion', qualification.model_version, 'score', qualification.score, 'tier', qualification.tier,
    'reasonCodes', qualification.reason_codes, 'reviewFlags', qualification.review_flags,
    'eligibleForBooking', qualification.eligible_for_booking, 'summary', qualification.summary
  ) as qualification,
  appointment.booking_url,
  coalesce(deliveries.items, '[]'::jsonb) as delivery_statuses
from public.seller_inquiries inquiry
join public.seller_qualification_assessments qualification on qualification.inquiry_id = inquiry.id
join lateral (
  select event.status from public.seller_inquiry_status_events event where event.inquiry_id = inquiry.id
  order by event.recorded_at desc, event.created_at desc limit 1
) status on true
left join public.seller_appointment_offers appointment on appointment.inquiry_id = inquiry.id
left join lateral (
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind', delivery.kind, 'status', delivery.status, 'providerMessageId', delivery.provider_message_id
  )) order by delivery.attempted_at) as items
  from public.seller_communication_deliveries delivery where delivery.inquiry_id = inquiry.id
) deliveries on true;

revoke execute on function public.persist_seller_inquiry(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_communication_delivery(jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_inquiry_status(jsonb) from public, anon, authenticated;
grant execute on function public.persist_seller_inquiry(jsonb, jsonb) to service_role;
grant execute on function public.record_seller_communication_delivery(jsonb) to service_role;
grant execute on function public.record_seller_inquiry_status(jsonb) to service_role;

grant select, insert on public.seller_inquiries, public.seller_qualification_assessments,
  public.seller_inquiry_consent_events, public.seller_inquiry_status_events,
  public.seller_appointment_offers, public.seller_communication_deliveries to service_role;
grant select on public.current_seller_inquiries to service_role;

commit;
