begin;

create extension if not exists pgcrypto with schema extensions;

create table public.seller_document_activation_events (
  id uuid primary key,
  decision text not null check (decision in ('OPEN', 'CLOSE')),
  governance_manifest_sha256 text not null check (governance_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  primary_actor_fingerprint text not null check (primary_actor_fingerprint ~ '^[a-f0-9]{64}$'),
  independent_reviewer_fingerprint text not null check (independent_reviewer_fingerprint ~ '^[a-f0-9]{64}$'),
  legal_evidence_reference text not null check (char_length(legal_evidence_reference) between 10 and 500),
  retention_policy_reference text not null check (char_length(retention_policy_reference) between 10 and 500),
  provider_authorization_reference text,
  rationale text not null check (char_length(rationale) between 30 and 2000),
  effective_at timestamptz not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  check (primary_actor_fingerprint <> independent_reviewer_fingerprint),
  check (decision = 'CLOSE' or provider_authorization_reference is not null)
);

create view public.current_seller_document_activation with (security_invoker = true) as
select id as event_id, decision, governance_manifest_sha256, primary_actor_fingerprint,
  independent_reviewer_fingerprint, legal_evidence_reference, retention_policy_reference,
  provider_authorization_reference, rationale, effective_at
from public.seller_document_activation_events
where effective_at <= now()
order by effective_at desc, created_at desc
limit 1;

create or replace function public.get_phase3_governance_evidence_manifest()
returns jsonb language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_integrity jsonb := public.get_seller_document_governance_integrity();
  v_activation public.current_seller_document_activation%rowtype;
  v_payload jsonb;
  v_hash text;
begin
  select * into v_activation from public.current_seller_document_activation;
  v_payload := jsonb_build_object(
    'manifestVersion', 'phase3-governance-evidence-v1',
    'phase', 'PHASE_3',
    'integrityModelVersion', v_integrity ->> 'modelVersion',
    'integrityStatus', v_integrity ->> 'status',
    'centralHoldActive', (v_integrity ->> 'centralHoldActive')::boolean,
    'reasonCodes', v_integrity -> 'reasonCodes',
    'counts', v_integrity -> 'counts',
    'activationDecision', coalesce(v_activation.decision, 'CLOSED_BY_DEFAULT'),
    'activationEventId', v_activation.event_id,
    'sellerFacingGenerationAvailable', false,
    'signatureRequestAvailable', false,
    'deliveryAvailable', false,
    'providerConfigured', false,
    'outreachAvailable', false
  );
  v_hash := encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  return jsonb_build_object(
    'manifest', v_payload,
    'manifestSha256', v_hash,
    'phaseStatus', case
      when v_activation.decision = 'OPEN' and v_activation.governance_manifest_sha256 = v_hash
        and v_integrity ->> 'status' = 'HEALTHY'
        and coalesce((v_integrity -> 'counts' ->> 'approvedContractVersions')::integer, 0) > 0
        and coalesce((v_integrity -> 'counts' ->> 'approvedDisclosureVersions')::integer, 0) > 0
        and coalesce((v_integrity -> 'counts' ->> 'activePermissions')::integer, 0) > 0
      then 'ACTIVATION_PREREQUISITES_RECORDED'
      else 'COMPLETE_RELEASE_CLOSED'
    end,
    'activationAvailable', false,
    'sellerFacingGenerationAvailable', false,
    'signatureRequestAvailable', false,
    'deliveryAvailable', false,
    'providerConfigured', false,
    'outreachAvailable', false
  );
end;
$$;

create or replace function public.seller_document_activation_interlock_open()
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_status jsonb := public.get_phase3_governance_evidence_manifest();
begin
  return v_status ->> 'phaseStatus' = 'ACTIVATION_PREREQUISITES_RECORDED'
    and not public.seller_document_governance_hold_active();
end;
$$;

create or replace function public.enforce_seller_document_activation_interlock()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.seller_document_activation_interlock_open() then
    raise exception 'Phase 3 seller-document activation interlock is closed';
  end if;
  return new;
end;
$$;

create trigger enforce_activation_on_signature before insert on public.seller_document_signature_events
  for each statement execute function public.enforce_seller_document_activation_interlock();
create trigger enforce_activation_on_delivery before insert on public.seller_document_delivery_events
  for each statement execute function public.enforce_seller_document_activation_interlock();

alter table public.seller_document_activation_events enable row level security;
revoke all on public.seller_document_activation_events from public, anon, authenticated;
grant select on public.seller_document_activation_events, public.current_seller_document_activation to service_role;
revoke insert, update, delete on public.seller_document_activation_events from service_role;
revoke execute on function public.get_phase3_governance_evidence_manifest() from public, anon, authenticated;
revoke execute on function public.seller_document_activation_interlock_open() from public, anon, authenticated;
revoke execute on function public.enforce_seller_document_activation_interlock() from public, anon, authenticated, service_role;
grant execute on function public.get_phase3_governance_evidence_manifest() to service_role;

commit;
