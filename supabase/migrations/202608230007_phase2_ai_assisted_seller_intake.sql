begin;

create table public.seller_ai_review_packets (
  id uuid primary key,
  inquiry_id uuid not null references public.seller_inquiries(id) on delete restrict,
  input_version text not null check (input_version = 'seller-ai-input-v1'),
  prompt_version text not null check (prompt_version = 'seller-ai-prompt-v1'),
  minimized_input jsonb not null check (jsonb_typeof(minimized_input) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  prepared_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (inquiry_id, input_version, prompt_version, payload_sha256)
);

create table public.seller_ai_assistance_results (
  id uuid primary key,
  packet_id uuid not null references public.seller_ai_review_packets(id) on delete restrict,
  provider text not null check (char_length(provider) between 2 and 120),
  model text not null check (char_length(model) between 1 and 160),
  output_schema_version text not null check (output_schema_version = 'seller-ai-output-v1'),
  output jsonb not null check (jsonb_typeof(output) = 'object'),
  generated_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table public.seller_ai_assistance_reviews (
  id uuid primary key,
  result_id uuid not null unique references public.seller_ai_assistance_results(id) on delete restrict,
  decision text not null check (decision in ('ACCEPTED_AS_ASSISTANCE', 'REJECTED', 'NEEDS_REVISION')),
  rationale text not null check (char_length(rationale) between 20 and 1000),
  reviewer_type text not null default 'OPERATOR' check (reviewer_type = 'OPERATOR'),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index seller_ai_packets_inquiry_idx on public.seller_ai_review_packets (inquiry_id, prepared_at desc, created_at desc);
create index seller_ai_results_packet_idx on public.seller_ai_assistance_results (packet_id, generated_at desc, recorded_at desc);

alter table public.seller_ai_review_packets enable row level security;
alter table public.seller_ai_assistance_results enable row level security;
alter table public.seller_ai_assistance_reviews enable row level security;

create or replace function public.prepare_seller_ai_review_packet(p_packet jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_packet_id uuid := (p_packet ->> 'packetId')::uuid;
  v_inquiry_id uuid := (p_packet ->> 'inquiryId')::uuid;
  v_input jsonb := p_packet -> 'minimizedInput';
  v_existing public.seller_ai_review_packets%rowtype;
begin
  if not exists (select 1 from public.seller_inquiries where id = v_inquiry_id) then raise exception 'Seller inquiry was not found'; end if;
  if p_packet ->> 'inputVersion' <> 'seller-ai-input-v1'
    or p_packet ->> 'promptVersion' <> 'seller-ai-prompt-v1'
    or jsonb_typeof(v_input) <> 'object'
    or not ((select array_agg(key order by key) from jsonb_object_keys(v_input) key) <@ array[
      'askingPriceProvided','authorizedChannels','condition','county','currentStatus','mortgageBalanceProvided',
      'motivation','occupancy','qualification','relationship','timeline'
    ]::text[])
    or (select count(*) from jsonb_object_keys(v_input)) <> 11
    or jsonb_typeof(v_input -> 'authorizedChannels') <> 'array'
    or jsonb_typeof(v_input -> 'qualification') <> 'object'
    or p_packet ->> 'payloadSha256' !~ '^[a-f0-9]{64}$'
  then raise exception 'A valid privacy-minimized AI review packet is required'; end if;

  select * into v_existing from public.seller_ai_review_packets
  where inquiry_id = v_inquiry_id and input_version = 'seller-ai-input-v1'
    and prompt_version = 'seller-ai-prompt-v1' and payload_sha256 = p_packet ->> 'payloadSha256';
  if found then
    return jsonb_build_object('packetId', v_existing.id, 'inquiryId', v_existing.inquiry_id,
      'inputVersion', v_existing.input_version, 'promptVersion', v_existing.prompt_version,
      'minimizedInput', v_existing.minimized_input, 'payloadSha256', v_existing.payload_sha256,
      'preparedAt', v_existing.prepared_at);
  end if;

  insert into public.seller_ai_review_packets (id, inquiry_id, input_version, prompt_version, minimized_input, payload_sha256, prepared_at)
  values (v_packet_id, v_inquiry_id, 'seller-ai-input-v1', 'seller-ai-prompt-v1', v_input, p_packet ->> 'payloadSha256', (p_packet ->> 'preparedAt')::timestamptz);
  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_AI_PACKET', v_packet_id::text, 'PREPARED', jsonb_build_object(
    'inquiry_id', v_inquiry_id, 'input_version', 'seller-ai-input-v1', 'prompt_version', 'seller-ai-prompt-v1',
    'payload_sha256', p_packet ->> 'payloadSha256', 'external_transmission', false,
    'excluded_fields', jsonb_build_array('name','email','phone','property_address','apn','notes')
  ));
  return p_packet;
end;
$$;

create or replace function public.record_seller_ai_assistance(p_result jsonb, p_review jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result_id uuid := (p_result ->> 'resultId')::uuid;
  v_packet_id uuid := (p_result ->> 'packetId')::uuid;
  v_output jsonb := p_result -> 'output';
begin
  if not exists (select 1 from public.seller_ai_review_packets where id = v_packet_id) then raise exception 'AI review packet was not found'; end if;
  if p_result ->> 'outputSchemaVersion' <> 'seller-ai-output-v1'
    or jsonb_typeof(v_output) <> 'object'
    or (select count(*) from jsonb_object_keys(v_output)) <> 4
    or not (v_output ?& array['summary','verificationQuestions','riskFlags','recommendedNextStep'])
    or p_review ->> 'resultId' <> v_result_id::text
  then raise exception 'A valid, human-reviewed AI assistance result is required'; end if;

  insert into public.seller_ai_assistance_results (id, packet_id, provider, model, output_schema_version, output, generated_at)
  values (v_result_id, v_packet_id, p_result ->> 'provider', p_result ->> 'model', 'seller-ai-output-v1', v_output, (p_result ->> 'generatedAt')::timestamptz);
  insert into public.seller_ai_assistance_reviews (id, result_id, decision, rationale, reviewed_at)
  values ((p_review ->> 'reviewId')::uuid, v_result_id, p_review ->> 'decision', p_review ->> 'rationale', (p_review ->> 'reviewedAt')::timestamptz);
  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_AI_RESULT', v_result_id::text, 'HUMAN_REVIEW_RECORDED', jsonb_build_object(
    'packet_id', v_packet_id, 'provider', p_result ->> 'provider', 'model', p_result ->> 'model',
    'output_schema_version', 'seller-ai-output-v1', 'decision', p_review ->> 'decision',
    'external_transmission_by_application', false, 'outreach_initiated', false
  ));
  return jsonb_build_object('resultId', v_result_id, 'packetId', v_packet_id,
    'provider', p_result ->> 'provider', 'model', p_result ->> 'model',
    'outputSchemaVersion', 'seller-ai-output-v1', 'output', v_output,
    'generatedAt', p_result ->> 'generatedAt', 'decision', p_review ->> 'decision',
    'rationale', p_review ->> 'rationale', 'reviewedAt', p_review ->> 'reviewedAt');
end;
$$;

create view public.current_seller_ai_assistance with (security_invoker = true) as
select packet.inquiry_id,
  jsonb_build_object('packetId', packet.id, 'inquiryId', packet.inquiry_id, 'inputVersion', packet.input_version,
    'promptVersion', packet.prompt_version, 'minimizedInput', packet.minimized_input,
    'payloadSha256', packet.payload_sha256, 'preparedAt', packet.prepared_at) as packet,
  case when result.id is null then null else jsonb_build_object('resultId', result.id, 'packetId', packet.id,
    'provider', result.provider, 'model', result.model, 'outputSchemaVersion', result.output_schema_version,
    'output', result.output, 'generatedAt', result.generated_at, 'decision', review.decision,
    'rationale', review.rationale, 'reviewedAt', review.reviewed_at) end as result
from public.seller_ai_review_packets packet
left join lateral (select item.* from public.seller_ai_assistance_results item where item.packet_id = packet.id order by item.generated_at desc, item.recorded_at desc limit 1) result on true
left join public.seller_ai_assistance_reviews review on review.result_id = result.id
where not exists (select 1 from public.seller_ai_review_packets newer where newer.inquiry_id = packet.inquiry_id and (newer.prepared_at, newer.created_at) > (packet.prepared_at, packet.created_at));

revoke execute on function public.prepare_seller_ai_review_packet(jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_ai_assistance(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_seller_ai_review_packet(jsonb) to service_role;
grant execute on function public.record_seller_ai_assistance(jsonb, jsonb) to service_role;
grant select, insert on public.seller_ai_review_packets, public.seller_ai_assistance_results, public.seller_ai_assistance_reviews to service_role;
grant select on public.current_seller_ai_assistance to service_role;
revoke update, delete on public.seller_ai_review_packets, public.seller_ai_assistance_results, public.seller_ai_assistance_reviews from service_role;

commit;
