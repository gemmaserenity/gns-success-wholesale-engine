begin;

create table public.seller_document_governance_hold_events (
  id uuid primary key,
  decision text not null check (decision in ('HOLD', 'RELEASE')),
  actor_fingerprint text not null check (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (char_length(reason) between 30 and 2000),
  evidence_reference text not null check (char_length(evidence_reference) between 10 and 500),
  effective_at timestamptz not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now()
);

create view public.current_seller_document_governance_hold with (security_invoker = true) as
select id as event_id, decision, actor_fingerprint, reason, evidence_reference, effective_at
from public.seller_document_governance_hold_events
where effective_at <= now()
order by effective_at desc, created_at desc
limit 1;

create or replace function public.seller_document_governance_hold_active()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select decision = 'HOLD' from public.current_seller_document_governance_hold), false);
$$;

create or replace function public.enforce_seller_document_governance_hold()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.seller_document_governance_hold_active() then
    raise exception 'Seller document governance is under a central hold';
  end if;
  return new;
end;
$$;

create trigger enforce_governance_hold_on_release_package before insert on public.seller_document_release_packages
  for each statement execute function public.enforce_seller_document_governance_hold();
create trigger enforce_governance_hold_on_release_decision before insert on public.seller_document_release_decisions
  for each statement execute function public.enforce_seller_document_governance_hold();
create trigger enforce_governance_hold_on_signature_event before insert on public.seller_document_signature_events
  for each statement execute function public.enforce_seller_document_governance_hold();
create trigger enforce_governance_hold_on_delivery_event before insert on public.seller_document_delivery_events
  for each statement execute function public.enforce_seller_document_governance_hold();

create or replace function public.get_seller_document_governance_integrity()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hold boolean := public.seller_document_governance_hold_active();
  v_separation_violations integer;
  v_invalid_signature_events integer;
  v_invalid_delivery_events integer;
  v_retention_overdue integer;
  v_approved_contracts integer;
  v_approved_disclosures integer;
  v_active_permissions integer;
  v_release_packages integer;
  v_signature_events integer;
  v_delivery_events integer;
  v_reason_codes text[] := '{}';
begin
  select count(*) into v_separation_violations
    from public.seller_document_release_decisions decision
    join public.seller_document_release_packages package on package.id = decision.release_package_id
    where decision.decision_maker_fingerprint = package.preparer_fingerprint;
  select count(*) into v_invalid_signature_events
    from public.seller_document_signature_events signature
    left join public.current_seller_document_releases release on release.release_package_id = signature.release_package_id
    where release.effective_status is distinct from 'APPROVED_FOR_CONTROLLED_RELEASE';
  select count(*) into v_invalid_delivery_events
    from public.seller_document_delivery_events delivery
    left join public.current_seller_document_releases release on release.release_package_id = delivery.release_package_id
    where release.effective_status is distinct from 'APPROVED_FOR_CONTROLLED_RELEASE';
  select count(*) into v_retention_overdue from (
    select retention_until from public.seller_legal_document_versions
    union all select retention_until from public.seller_document_release_packages
    union all select retention_until from public.seller_document_signature_events
    union all select retention_until from public.seller_document_delivery_events
  ) retained where retention_until <= now();
  select count(*) filter (where kind = 'ARIZONA_PURCHASE_CONTRACT' and approval_status = 'APPROVE' and valid_from <= now() and (valid_until is null or valid_until > now())),
    count(*) filter (where kind = 'ARIZONA_WHOLESALE_DISCLOSURE' and approval_status = 'APPROVE' and valid_from <= now() and (valid_until is null or valid_until > now()))
    into v_approved_contracts, v_approved_disclosures from public.current_seller_legal_document_versions;
  select count(*) into v_active_permissions from public.current_seller_document_permissions;
  select count(*) into v_release_packages from public.seller_document_release_packages;
  select count(*) into v_signature_events from public.seller_document_signature_events;
  select count(*) into v_delivery_events from public.seller_document_delivery_events;

  if v_hold then v_reason_codes := array_append(v_reason_codes, 'CENTRAL_GOVERNANCE_HOLD_ACTIVE'); end if;
  if v_separation_violations > 0 then v_reason_codes := array_append(v_reason_codes, 'SEPARATION_OF_DUTIES_VIOLATION'); end if;
  if v_invalid_signature_events > 0 then v_reason_codes := array_append(v_reason_codes, 'SIGNATURE_WITHOUT_VALID_RELEASE'); end if;
  if v_invalid_delivery_events > 0 then v_reason_codes := array_append(v_reason_codes, 'DELIVERY_WITHOUT_VALID_RELEASE'); end if;
  if v_retention_overdue > 0 then v_reason_codes := array_append(v_reason_codes, 'RETENTION_REVIEW_OVERDUE'); end if;
  if cardinality(v_reason_codes) = 0 then v_reason_codes := array['GOVERNANCE_INTEGRITY_HEALTHY']; end if;

  return jsonb_build_object(
    'modelVersion', 'seller-document-governance-integrity-v1',
    'assessedAt', now(),
    'status', case when v_hold then 'HOLD' when v_separation_violations + v_invalid_signature_events + v_invalid_delivery_events + v_retention_overdue > 0 then 'VIOLATION' else 'HEALTHY' end,
    'reasonCodes', v_reason_codes,
    'centralHoldActive', v_hold,
    'counts', jsonb_build_object(
      'approvedContractVersions', v_approved_contracts,
      'approvedDisclosureVersions', v_approved_disclosures,
      'activePermissions', v_active_permissions,
      'releasePackages', v_release_packages,
      'signatureEvents', v_signature_events,
      'deliveryEvents', v_delivery_events,
      'separationViolations', v_separation_violations,
      'invalidSignatureEvents', v_invalid_signature_events,
      'invalidDeliveryEvents', v_invalid_delivery_events,
      'retentionOverdue', v_retention_overdue
    ),
    'sellerFacingGenerationAvailable', false,
    'signatureRequestAvailable', false,
    'deliveryAvailable', false,
    'providerConfigured', false,
    'outreachAvailable', false
  );
end;
$$;

alter table public.seller_document_governance_hold_events enable row level security;
revoke all on public.seller_document_governance_hold_events from public, anon, authenticated;
grant select on public.seller_document_governance_hold_events, public.current_seller_document_governance_hold to service_role;
revoke insert, update, delete on public.seller_document_governance_hold_events from service_role;
revoke execute on function public.seller_document_governance_hold_active() from public, anon, authenticated;
revoke execute on function public.get_seller_document_governance_integrity() from public, anon, authenticated;
grant execute on function public.seller_document_governance_hold_active() to service_role;
grant execute on function public.get_seller_document_governance_integrity() to service_role;

commit;
