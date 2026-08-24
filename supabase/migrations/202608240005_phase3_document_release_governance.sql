begin;

create extension if not exists pgcrypto with schema extensions;

-- These records are administered outside the browser-facing application. The
-- service role can read the current projection but cannot grant itself access.
create table public.seller_document_permission_events (
  id uuid primary key,
  actor_fingerprint text not null check (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  capability text not null check (capability in ('RELEASE_PREPARE', 'RELEASE_APPROVE', 'RELEASE_REVOKE', 'SIGNATURE_RECORD', 'DELIVERY_RECORD')),
  decision text not null check (decision in ('GRANT', 'REVOKE')),
  administered_by_fingerprint text not null check (administered_by_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_reference text not null check (char_length(evidence_reference) between 10 and 500),
  effective_at timestamptz not null,
  expires_at timestamptz,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > effective_at)
);

create view public.current_seller_document_permissions with (security_invoker = true) as
select actor_fingerprint, capability, decision, evidence_reference, effective_at, expires_at
from (
  select event.*, row_number() over (
    partition by event.actor_fingerprint, event.capability
    order by event.effective_at desc, event.created_at desc
  ) as recency_rank
  from public.seller_document_permission_events as event
) ranked
where recency_rank = 1 and decision = 'GRANT' and effective_at <= now()
  and (expires_at is null or expires_at > now());

-- Legal artifacts contain hashes and approval provenance, never invented legal
-- text. No artifact or approval is seeded by this migration.
create table public.seller_legal_document_versions (
  id uuid primary key,
  kind text not null check (kind in ('ARIZONA_PURCHASE_CONTRACT', 'ARIZONA_WHOLESALE_DISCLOSURE')),
  version text not null check (char_length(version) between 3 and 120),
  jurisdiction text not null check (jurisdiction = 'ARIZONA'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  storage_reference text not null check (char_length(storage_reference) between 10 and 500),
  retention_until timestamptz not null,
  registered_at timestamptz not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  unique (kind, version, content_sha256)
);

create table public.seller_legal_document_approval_events (
  id uuid primary key,
  document_version_id uuid not null references public.seller_legal_document_versions(id) on delete restrict,
  decision text not null check (decision in ('APPROVE', 'REJECT', 'REVOKE')),
  approver_fingerprint text not null check (approver_fingerprint ~ '^[a-f0-9]{64}$'),
  approval_evidence_reference text not null check (char_length(approval_evidence_reference) between 10 and 500),
  rationale text not null check (char_length(rationale) between 20 and 2000),
  decided_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  check ((decision = 'APPROVE') = (valid_from is not null)),
  check (valid_until is null or valid_until > valid_from)
);

create view public.current_seller_legal_document_versions with (security_invoker = true) as
select document.id, document.kind, document.version, document.jurisdiction,
  document.content_sha256, document.storage_reference, document.retention_until,
  approval.decision as approval_status, approval.approval_evidence_reference,
  approval.decided_at, approval.valid_from, approval.valid_until
from public.seller_legal_document_versions document
join lateral (
  select event.* from public.seller_legal_document_approval_events event
  where event.document_version_id = document.id
  order by event.decided_at desc, event.created_at desc limit 1
) approval on true;

create table public.seller_document_release_packages (
  id uuid primary key,
  case_id uuid not null references public.seller_acquisition_cases(id) on delete restrict,
  draft_id uuid not null references public.seller_offer_drafts(id) on delete restrict,
  draft_content_sha256 text not null check (draft_content_sha256 ~ '^[a-f0-9]{64}$'),
  draft_template_version text not null check (draft_template_version = 'internal-offer-terms-v1'),
  contract_version_id uuid not null references public.seller_legal_document_versions(id) on delete restrict,
  contract_content_sha256 text not null check (contract_content_sha256 ~ '^[a-f0-9]{64}$'),
  disclosure_version_id uuid not null references public.seller_legal_document_versions(id) on delete restrict,
  disclosure_content_sha256 text not null check (disclosure_content_sha256 ~ '^[a-f0-9]{64}$'),
  release_manifest jsonb not null check (jsonb_typeof(release_manifest) = 'object'),
  release_manifest_sha256 text not null check (release_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  seller_identity_sha256 text not null check (seller_identity_sha256 ~ '^[a-f0-9]{64}$'),
  property_sha256 text not null check (property_sha256 ~ '^[a-f0-9]{64}$'),
  terms_sha256 text not null check (terms_sha256 ~ '^[a-f0-9]{64}$'),
  intended_delivery_channel text not null check (intended_delivery_channel = 'EMAIL'),
  consent_statement_version text not null,
  preparer_fingerprint text not null check (preparer_fingerprint ~ '^[a-f0-9]{64}$'),
  authorization_revalidated boolean not null check (authorization_revalidated),
  seller_identity_revalidated boolean not null check (seller_identity_revalidated),
  property_revalidated boolean not null check (property_revalidated),
  terms_revalidated boolean not null check (terms_revalidated),
  consent_revalidated boolean not null check (consent_revalidated),
  suppression_revalidated boolean not null check (suppression_revalidated),
  retention_until timestamptz not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  prepared_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (draft_id, contract_version_id, disclosure_version_id)
);

create table public.seller_document_release_decisions (
  id uuid primary key,
  release_package_id uuid not null references public.seller_document_release_packages(id) on delete restrict,
  decision text not null check (decision in ('APPROVE', 'REJECT')),
  decision_maker_fingerprint text not null check (decision_maker_fingerprint ~ '^[a-f0-9]{64}$'),
  rationale text not null check (char_length(rationale) between 30 and 2000),
  final_human_decision boolean not null check (final_human_decision),
  exact_manifest_reconfirmed boolean not null check (exact_manifest_reconfirmed),
  authorization_revalidated boolean not null check (authorization_revalidated),
  consent_revalidated boolean not null check (consent_revalidated),
  suppression_revalidated boolean not null check (suppression_revalidated),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  decided_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_document_release_revocations (
  id uuid primary key,
  release_package_id uuid not null unique references public.seller_document_release_packages(id) on delete restrict,
  actor_fingerprint text not null check (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  reason text not null check (char_length(reason) between 30 and 2000),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 200),
  revoked_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Provider-neutral evidence ledgers. The Worker receives no execute/insert grant
-- for these tables in Milestone 5, so it cannot initiate or fabricate events.
create table public.seller_document_signature_events (
  id uuid primary key,
  release_package_id uuid not null references public.seller_document_release_packages(id) on delete restrict,
  event_type text not null check (event_type in ('REQUESTED', 'VIEWED', 'SIGNED', 'DECLINED', 'VOIDED', 'FAILED')),
  provider text not null,
  provider_reference_sha256 text not null check (provider_reference_sha256 ~ '^[a-f0-9]{64}$'),
  signed_document_sha256 text check (signed_document_sha256 is null or signed_document_sha256 ~ '^[a-f0-9]{64}$'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  retention_until timestamptz not null,
  idempotency_key text not null unique,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.seller_document_delivery_events (
  id uuid primary key,
  release_package_id uuid not null references public.seller_document_release_packages(id) on delete restrict,
  event_type text not null check (event_type in ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SUPPRESSED')),
  channel text not null check (channel = 'EMAIL'),
  provider text not null,
  provider_reference_sha256 text not null check (provider_reference_sha256 ~ '^[a-f0-9]{64}$'),
  delivered_document_sha256 text not null check (delivered_document_sha256 ~ '^[a-f0-9]{64}$'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  retention_until timestamptz not null,
  idempotency_key text not null unique,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index seller_release_history_idx on public.seller_document_release_packages (case_id, prepared_at desc, created_at desc);
create index seller_release_decision_history_idx on public.seller_document_release_decisions (release_package_id, decided_at desc, created_at desc);
create index seller_signature_history_idx on public.seller_document_signature_events (release_package_id, occurred_at, created_at);
create index seller_delivery_history_idx_v2 on public.seller_document_delivery_events (release_package_id, occurred_at, created_at);

create view public.current_seller_document_releases with (security_invoker = true) as
select package.id as release_package_id, package.case_id, package.draft_id,
  package.draft_content_sha256, package.draft_template_version,
  package.contract_version_id, contract.version as contract_version, package.contract_content_sha256,
  package.disclosure_version_id, disclosure.version as disclosure_version, package.disclosure_content_sha256,
  package.release_manifest_sha256, package.preparer_fingerprint, package.intended_delivery_channel,
  package.consent_statement_version, package.retention_until, package.prepared_at,
  decision.id as decision_id, decision.decision, decision.decision_maker_fingerprint, decision.rationale,
  decision.decided_at, revocation.revoked_at,
  case
    when revocation.id is not null then 'REVOKED'
    when auth_state.effective_status is distinct from 'AUTHORIZED' then 'AUTHORIZATION_INVALID'
    when draft.effective_status is distinct from 'CURRENT' or draft.content_sha256 is distinct from package.draft_content_sha256 then 'DRAFT_INVALID'
    when contract.approval_status is distinct from 'APPROVE' or contract.valid_from > now() or (contract.valid_until is not null and contract.valid_until <= now()) then 'LEGAL_TEMPLATE_INVALID'
    when disclosure.approval_status is distinct from 'APPROVE' or disclosure.valid_from > now() or (disclosure.valid_until is not null and disclosure.valid_until <= now()) then 'DISCLOSURE_INVALID'
    when decision.decision = 'REJECT' then 'REJECTED'
    when decision.decision = 'APPROVE' then 'APPROVED_FOR_CONTROLLED_RELEASE'
    else 'AWAITING_FINAL_HUMAN_DECISION'
  end as effective_status,
  false as seller_facing_document_generated,
  false as signature_request_available,
  false as delivery_available
from public.seller_document_release_packages package
join public.current_seller_offer_drafts draft on draft.draft_id = package.draft_id
join public.current_seller_offer_authorizations auth_state on auth_state.authorization_id = draft.authorization_id
join public.current_seller_legal_document_versions contract on contract.id = package.contract_version_id
join public.current_seller_legal_document_versions disclosure on disclosure.id = package.disclosure_version_id
left join lateral (
  select event.* from public.seller_document_release_decisions event
  where event.release_package_id = package.id order by event.decided_at desc, event.created_at desc limit 1
) decision on true
left join public.seller_document_release_revocations revocation on revocation.release_package_id = package.id;

create or replace function public.get_seller_document_release_governance(p_case_id uuid, p_actor_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_current jsonb; v_draft public.current_seller_offer_drafts%rowtype;
begin
  select * into v_draft from public.current_seller_offer_drafts where case_id = p_case_id;
  select to_jsonb(current_release) into v_current from public.current_seller_document_releases current_release
    where current_release.case_id = p_case_id order by current_release.prepared_at desc limit 1;
  return jsonb_build_object(
    'caseId', p_case_id,
    'exactCurrentDraft', v_draft.draft_id is not null and v_draft.effective_status = 'CURRENT',
    'draftId', v_draft.draft_id,
    'draftContentSha256', v_draft.content_sha256,
    'currentAuthorization', v_draft.draft_id is not null and v_draft.effective_status = 'CURRENT',
    'approvedLegalTemplateAvailable', exists(select 1 from public.current_seller_legal_document_versions where kind = 'ARIZONA_PURCHASE_CONTRACT' and approval_status = 'APPROVE' and valid_from <= now() and (valid_until is null or valid_until > now())),
    'approvedArizonaDisclosureAvailable', exists(select 1 from public.current_seller_legal_document_versions where kind = 'ARIZONA_WHOLESALE_DISCLOSURE' and approval_status = 'APPROVE' and valid_from <= now() and (valid_until is null or valid_until > now())),
    'permissions', jsonb_build_object(
      'prepare', exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_actor_fingerprint and capability = 'RELEASE_PREPARE'),
      'approve', exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_actor_fingerprint and capability = 'RELEASE_APPROVE'),
      'revoke', exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_actor_fingerprint and capability = 'RELEASE_REVOKE')
    ),
    'release', v_current,
    'sellerFacingGenerationAvailable', false,
    'signatureRequestAvailable', false,
    'deliveryAvailable', false,
    'providerConfigured', false
  );
end; $$;

create or replace function public.prepare_seller_document_release_package(p_package jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid := (p_package ->> 'releasePackageId')::uuid;
  v_case public.seller_acquisition_cases%rowtype;
  v_inquiry public.seller_inquiries%rowtype;
  v_draft public.current_seller_offer_drafts%rowtype;
  v_contract public.current_seller_legal_document_versions%rowtype;
  v_disclosure public.current_seller_legal_document_versions%rowtype;
  v_authorization public.current_seller_offer_authorizations%rowtype;
  v_consent public.seller_inquiry_consent_events%rowtype;
  v_suppressed boolean;
  v_manifest jsonb;
  v_manifest_hash text;
  v_retention_until timestamptz := (p_package ->> 'retentionUntil')::timestamptz;
  v_prepared_at timestamptz := (p_package ->> 'preparedAt')::timestamptz;
begin
  if exists(select 1 from public.seller_document_release_packages where idempotency_key = p_package ->> 'idempotencyKey') then
    return (select jsonb_build_object('releasePackageId', id, 'created', false) from public.seller_document_release_packages where idempotency_key = p_package ->> 'idempotencyKey');
  end if;
  select * into v_case from public.seller_acquisition_cases where id = (p_package ->> 'caseId')::uuid;
  if not found then raise exception 'Acquisition case was not found'; end if;
  select * into v_inquiry from public.seller_inquiries where id = v_case.inquiry_id;
  select * into v_draft from public.current_seller_offer_drafts where case_id = v_case.id and draft_id = (p_package ->> 'draftId')::uuid;
  select * into v_contract from public.current_seller_legal_document_versions where id = (p_package ->> 'contractVersionId')::uuid;
  select * into v_disclosure from public.current_seller_legal_document_versions where id = (p_package ->> 'disclosureVersionId')::uuid;
  if v_draft.draft_id is not null then
    select * into v_authorization from public.current_seller_offer_authorizations where authorization_id = v_draft.authorization_id and case_id = v_case.id;
  end if;
  select * into v_consent from public.seller_inquiry_consent_events where inquiry_id = v_case.inquiry_id and channel = 'EMAIL' order by observed_at desc, created_at desc limit 1;
  select exists(
    select 1 from public.ownership_interests interest
    join lateral (
      select standing from public.seller_contact_standing_events event where event.owner_id = interest.owner_id
      order by event.observed_at desc, event.created_at desc limit 1
    ) current_standing on true
    where interest.property_id = v_case.property_id and interest.valid_to is null and current_standing.standing in ('DO_NOT_CONTACT', 'DECEASED')
  ) into v_suppressed;

  if p_package is null or jsonb_typeof(p_package) <> 'object'
    or p_package ->> 'actorFingerprint' !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_package ->> 'actorFingerprint' and capability = 'RELEASE_PREPARE')
    or v_draft.draft_id is null or v_draft.effective_status <> 'CURRENT'
    or v_draft.content_sha256 is distinct from p_package ->> 'draftContentSha256'
    or v_authorization.effective_status is distinct from 'AUTHORIZED'
    or v_contract.kind is distinct from 'ARIZONA_PURCHASE_CONTRACT' or v_contract.approval_status is distinct from 'APPROVE'
    or v_contract.valid_from > now() or (v_contract.valid_until is not null and v_contract.valid_until <= now())
    or v_disclosure.kind is distinct from 'ARIZONA_WHOLESALE_DISCLOSURE' or v_disclosure.approval_status is distinct from 'APPROVE'
    or v_disclosure.valid_from > now() or (v_disclosure.valid_until is not null and v_disclosure.valid_until <= now())
    or v_draft.content ->> 'sellerName' is distinct from v_inquiry.seller_name
    or v_draft.content ->> 'propertyAddress' is distinct from v_inquiry.property_address
    or not exists(select 1 from public.seller_property_verifications where case_id = v_case.id and property_identity_verified and owner_identity_status = 'MATCHED' and seller_authority_status = 'VERIFIED')
    or v_consent.id is null or not v_consent.granted or v_suppressed
    or p_package ->> 'intendedDeliveryChannel' <> 'EMAIL'
    or coalesce((p_package ->> 'authorizationRevalidated')::boolean, false) is not true
    or coalesce((p_package ->> 'sellerIdentityRevalidated')::boolean, false) is not true
    or coalesce((p_package ->> 'propertyRevalidated')::boolean, false) is not true
    or coalesce((p_package ->> 'termsRevalidated')::boolean, false) is not true
    or coalesce((p_package ->> 'consentRevalidated')::boolean, false) is not true
    or coalesce((p_package ->> 'suppressionRevalidated')::boolean, false) is not true
    or char_length(p_package ->> 'idempotencyKey') not between 16 and 200
    or v_retention_until <= now() or v_prepared_at < now() - interval '5 minutes' or v_prepared_at > now() + interval '1 minute'
  then raise exception 'Release-control preparation requires exact current evidence, approvals, consent, suppression review, and central permission'; end if;

  v_manifest := jsonb_build_object(
    'draft', jsonb_build_object('id', v_draft.draft_id, 'templateVersion', v_draft.template_version, 'sha256', v_draft.content_sha256),
    'contract', jsonb_build_object('id', v_contract.id, 'version', v_contract.version, 'sha256', v_contract.content_sha256),
    'disclosure', jsonb_build_object('id', v_disclosure.id, 'version', v_disclosure.version, 'sha256', v_disclosure.content_sha256),
    'intendedDeliveryChannel', 'EMAIL', 'consentStatementVersion', v_consent.statement_version,
    'sellerFacingDocumentGenerated', false, 'signatureRequested', false, 'deliveryInitiated', false
  );
  v_manifest_hash := encode(digest(convert_to(v_manifest::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.seller_document_release_packages (
    id, case_id, draft_id, draft_content_sha256, draft_template_version,
    contract_version_id, contract_content_sha256, disclosure_version_id, disclosure_content_sha256,
    release_manifest, release_manifest_sha256, seller_identity_sha256, property_sha256, terms_sha256,
    intended_delivery_channel, consent_statement_version, preparer_fingerprint,
    authorization_revalidated, seller_identity_revalidated, property_revalidated, terms_revalidated,
    consent_revalidated, suppression_revalidated, retention_until, idempotency_key, prepared_at
  ) values (
    v_id, v_case.id, v_draft.draft_id, v_draft.content_sha256, v_draft.template_version,
    v_contract.id, v_contract.content_sha256, v_disclosure.id, v_disclosure.content_sha256,
    v_manifest, v_manifest_hash,
    encode(digest(convert_to(v_inquiry.seller_name, 'UTF8'), 'sha256'), 'hex'),
    encode(digest(convert_to(jsonb_build_object('propertyId', v_case.property_id, 'address', v_inquiry.property_address)::text, 'UTF8'), 'sha256'), 'hex'),
    encode(digest(convert_to((v_draft.content -> 'terms')::text, 'UTF8'), 'sha256'), 'hex'),
    'EMAIL', v_consent.statement_version, p_package ->> 'actorFingerprint', true, true, true, true, true, true,
    v_retention_until, p_package ->> 'idempotencyKey', v_prepared_at
  );
  insert into public.audit_events(entity_type, entity_id, action, details) values (
    'SELLER_DOCUMENT_RELEASE', v_id::text, 'CONTROL_PACKAGE_PREPARED',
    jsonb_build_object('case_id', v_case.id, 'draft_id', v_draft.draft_id, 'manifest_sha256', v_manifest_hash,
      'contract_version_id', v_contract.id, 'disclosure_version_id', v_disclosure.id,
      'seller_facing_document_generated', false, 'signature_requested', false, 'delivery_initiated', false)
  );
  return jsonb_build_object('releasePackageId', v_id, 'manifestSha256', v_manifest_hash, 'created', true);
end; $$;

create or replace function public.record_seller_document_release_decision(p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_package public.seller_document_release_packages%rowtype;
  v_decision_id uuid := (p_decision ->> 'decisionId')::uuid;
  v_consent_granted boolean;
  v_suppressed boolean;
  v_release_status text;
begin
  if exists(select 1 from public.seller_document_release_decisions where idempotency_key = p_decision ->> 'idempotencyKey') then
    return (select jsonb_build_object('decisionId', id, 'created', false) from public.seller_document_release_decisions where idempotency_key = p_decision ->> 'idempotencyKey');
  end if;
  select * into v_package from public.seller_document_release_packages where id = (p_decision ->> 'releasePackageId')::uuid;
  select effective_status into v_release_status from public.current_seller_document_releases where release_package_id = v_package.id;
  select consent.granted into v_consent_granted
    from public.seller_acquisition_cases acquisition_case
    join public.seller_inquiry_consent_events consent on consent.inquiry_id = acquisition_case.inquiry_id and consent.channel = 'EMAIL'
    where acquisition_case.id = v_package.case_id order by consent.observed_at desc, consent.created_at desc limit 1;
  select exists(
    select 1 from public.seller_acquisition_cases acquisition_case
    join public.ownership_interests interest on interest.property_id = acquisition_case.property_id and interest.valid_to is null
    join lateral (
      select standing from public.seller_contact_standing_events event where event.owner_id = interest.owner_id
      order by event.observed_at desc, event.created_at desc limit 1
    ) current_standing on true
    where acquisition_case.id = v_package.case_id and current_standing.standing in ('DO_NOT_CONTACT', 'DECEASED')
  ) into v_suppressed;
  if v_package.id is null or p_decision ->> 'decision' not in ('APPROVE', 'REJECT')
    or p_decision ->> 'actorFingerprint' !~ '^[a-f0-9]{64}$'
    or p_decision ->> 'actorFingerprint' = v_package.preparer_fingerprint
    or not exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_decision ->> 'actorFingerprint' and capability = 'RELEASE_APPROVE')
    or char_length(p_decision ->> 'rationale') not between 30 and 2000
    or coalesce((p_decision ->> 'finalHumanDecision')::boolean, false) is not true
    or coalesce((p_decision ->> 'exactManifestReconfirmed')::boolean, false) is not true
    or coalesce((p_decision ->> 'authorizationRevalidated')::boolean, false) is not true
    or coalesce((p_decision ->> 'consentRevalidated')::boolean, false) is not true
    or coalesce((p_decision ->> 'suppressionRevalidated')::boolean, false) is not true
    or exists(select 1 from public.seller_document_release_decisions where release_package_id = v_package.id and decision = 'APPROVE')
    or exists(select 1 from public.seller_document_release_revocations where release_package_id = v_package.id)
    or (p_decision ->> 'decision' = 'APPROVE' and (v_release_status is distinct from 'AWAITING_FINAL_HUMAN_DECISION' or not coalesce(v_consent_granted, false) or v_suppressed))
  then raise exception 'A separate centrally permitted final human decision with all revalidations is required'; end if;
  insert into public.seller_document_release_decisions(id, release_package_id, decision, decision_maker_fingerprint,
    rationale, final_human_decision, exact_manifest_reconfirmed, authorization_revalidated,
    consent_revalidated, suppression_revalidated, idempotency_key, decided_at)
  values(v_decision_id, v_package.id, p_decision ->> 'decision', p_decision ->> 'actorFingerprint',
    p_decision ->> 'rationale', true, true, true, true, true, p_decision ->> 'idempotencyKey', (p_decision ->> 'decidedAt')::timestamptz);
  insert into public.audit_events(entity_type, entity_id, action, details) values ('SELLER_DOCUMENT_RELEASE', v_package.id::text,
    p_decision ->> 'decision', jsonb_build_object('decision_id', v_decision_id, 'manifest_sha256', v_package.release_manifest_sha256,
      'seller_facing_document_generated', false, 'signature_requested', false, 'delivery_initiated', false));
  return jsonb_build_object('decisionId', v_decision_id, 'releasePackageId', v_package.id, 'created', true);
end; $$;

create or replace function public.revoke_seller_document_release(p_revocation jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid := (p_revocation ->> 'revocationId')::uuid; v_package_id uuid := (p_revocation ->> 'releasePackageId')::uuid;
begin
  if exists(select 1 from public.seller_document_release_revocations where idempotency_key = p_revocation ->> 'idempotencyKey') then
    return (select jsonb_build_object('revocationId', id, 'created', false) from public.seller_document_release_revocations where idempotency_key = p_revocation ->> 'idempotencyKey');
  end if;
  if p_revocation ->> 'actorFingerprint' !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from public.current_seller_document_permissions where actor_fingerprint = p_revocation ->> 'actorFingerprint' and capability = 'RELEASE_REVOKE')
    or char_length(p_revocation ->> 'reason') not between 30 and 2000
    or not exists(select 1 from public.current_seller_document_releases where release_package_id = v_package_id and effective_status = 'APPROVED_FOR_CONTROLLED_RELEASE')
    or exists(select 1 from public.seller_document_release_revocations where release_package_id = v_package_id)
  then raise exception 'A current approved release and centrally administered revocation permission are required'; end if;
  insert into public.seller_document_release_revocations(id, release_package_id, actor_fingerprint, reason, idempotency_key, revoked_at)
  values(v_id, v_package_id, p_revocation ->> 'actorFingerprint', p_revocation ->> 'reason', p_revocation ->> 'idempotencyKey', (p_revocation ->> 'revokedAt')::timestamptz);
  insert into public.audit_events(entity_type, entity_id, action, details) values ('SELLER_DOCUMENT_RELEASE', v_package_id::text, 'REVOKE',
    jsonb_build_object('revocation_id', v_id, 'seller_facing_document_generated', false, 'signature_requested', false, 'delivery_initiated', false));
  return jsonb_build_object('revocationId', v_id, 'releasePackageId', v_package_id, 'created', true);
end; $$;

alter table public.seller_document_permission_events enable row level security;
alter table public.seller_legal_document_versions enable row level security;
alter table public.seller_legal_document_approval_events enable row level security;
alter table public.seller_document_release_packages enable row level security;
alter table public.seller_document_release_decisions enable row level security;
alter table public.seller_document_release_revocations enable row level security;
alter table public.seller_document_signature_events enable row level security;
alter table public.seller_document_delivery_events enable row level security;

revoke all on public.seller_document_permission_events, public.seller_legal_document_versions,
  public.seller_legal_document_approval_events, public.seller_document_release_packages,
  public.seller_document_release_decisions, public.seller_document_release_revocations,
  public.seller_document_signature_events, public.seller_document_delivery_events from anon, authenticated;
revoke update, delete on public.seller_document_permission_events, public.seller_legal_document_versions,
  public.seller_legal_document_approval_events, public.seller_document_release_packages,
  public.seller_document_release_decisions, public.seller_document_release_revocations,
  public.seller_document_signature_events, public.seller_document_delivery_events from service_role;
grant select on public.seller_document_permission_events, public.seller_legal_document_versions,
  public.seller_legal_document_approval_events, public.seller_document_release_packages,
  public.seller_document_release_decisions, public.seller_document_release_revocations,
  public.seller_document_signature_events, public.seller_document_delivery_events,
  public.current_seller_document_permissions, public.current_seller_legal_document_versions,
  public.current_seller_document_releases to service_role;
revoke execute on function public.get_seller_document_release_governance(uuid, text) from public, anon, authenticated;
revoke execute on function public.prepare_seller_document_release_package(jsonb) from public, anon, authenticated;
revoke execute on function public.record_seller_document_release_decision(jsonb) from public, anon, authenticated;
revoke execute on function public.revoke_seller_document_release(jsonb) from public, anon, authenticated;
grant execute on function public.get_seller_document_release_governance(uuid, text) to service_role;
grant execute on function public.prepare_seller_document_release_package(jsonb) to service_role;
grant execute on function public.record_seller_document_release_decision(jsonb) to service_role;
grant execute on function public.revoke_seller_document_release(jsonb) to service_role;

commit;
