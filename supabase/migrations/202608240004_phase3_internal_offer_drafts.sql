begin;

create extension if not exists pgcrypto with schema extensions;

create table public.seller_offer_drafts (
  id uuid primary key,
  case_id uuid not null references public.seller_acquisition_cases(id) on delete restrict,
  authorization_id uuid not null references public.seller_offer_authorizations(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  template_version text not null check (template_version = 'internal-offer-terms-v1'),
  preparer_fingerprint text not null check (preparer_fingerprint ~ '^[a-f0-9]{64}$'),
  preparer_role text not null check (preparer_role in ('ACQUISITIONS_MANAGER', 'PRINCIPAL')),
  preparation_notes text not null check (char_length(preparation_notes) between 30 and 2000),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  exact_authorization_reconfirmed boolean not null check (exact_authorization_reconfirmed),
  internal_draft_only boolean not null check (internal_draft_only),
  legal_review_required boolean not null check (legal_review_required),
  seller_facing_approved boolean not null check (not seller_facing_approved),
  signature_requested boolean not null check (not signature_requested),
  delivery_initiated boolean not null check (not delivery_initiated),
  outreach_initiated boolean not null check (not outreach_initiated),
  prepared_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (authorization_id, revision_number)
);

create index seller_offer_draft_history_idx
  on public.seller_offer_drafts (case_id, prepared_at desc, created_at desc);

alter table public.seller_offer_drafts enable row level security;

create policy "authenticated operators can read seller offer drafts"
  on public.seller_offer_drafts for select to authenticated using (true);

create or replace function public.record_seller_offer_draft(p_draft jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_draft_id uuid := (p_draft ->> 'draftId')::uuid;
  v_case public.seller_acquisition_cases%rowtype;
  v_inquiry public.seller_inquiries%rowtype;
  v_authorization public.seller_offer_authorizations%rowtype;
  v_authorization_status text;
  v_revision_number integer;
  v_prepared_at timestamptz := (p_draft ->> 'preparedAt')::timestamptz;
  v_content jsonb;
  v_content_sha256 text;
begin
  if exists(select 1 from public.seller_offer_drafts where id = v_draft_id) then
    return jsonb_build_object('draftId', v_draft_id, 'created', false);
  end if;

  select * into v_case from public.seller_acquisition_cases where id = (p_draft ->> 'caseId')::uuid;
  if not found or v_case.inquiry_id is distinct from (p_draft ->> 'inquiryId')::uuid then
    raise exception 'Acquisition case was not found';
  end if;
  select * into v_inquiry from public.seller_inquiries where id = v_case.inquiry_id;
  select * into v_authorization from public.seller_offer_authorizations
    where id = (p_draft ->> 'authorizationId')::uuid and case_id = v_case.id;
  if not found then raise exception 'Offer authorization was not found'; end if;
  select effective_status into v_authorization_status
    from public.current_seller_offer_authorizations
    where case_id = v_case.id and authorization_id = v_authorization.id;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object'
    or v_authorization_status is distinct from 'AUTHORIZED'
    or v_authorization.decision <> 'AUTHORIZE_INTERNAL_TERMS'
    or v_authorization.expires_at <= now()
    or p_draft ->> 'templateVersion' <> 'internal-offer-terms-v1'
    or p_draft ->> 'preparerRole' not in ('ACQUISITIONS_MANAGER', 'PRINCIPAL')
    or p_draft ->> 'preparerFingerprint' !~ '^[a-f0-9]{64}$'
    or char_length(p_draft ->> 'preparationNotes') not between 30 and 2000
    or coalesce((p_draft ->> 'exactAuthorizationReconfirmed')::boolean, false) is not true
    or coalesce((p_draft ->> 'internalDraftOnly')::boolean, false) is not true
    or coalesce((p_draft ->> 'legalReviewRequired')::boolean, false) is not true
    or coalesce((p_draft ->> 'sellerFacingApproved')::boolean, true) is not false
    or coalesce((p_draft ->> 'noSignatureRequested')::boolean, false) is not true
    or coalesce((p_draft ->> 'noDeliveryInitiated')::boolean, false) is not true
    or coalesce((p_draft ->> 'noOutreachInitiated')::boolean, false) is not true
    or v_prepared_at < now() - interval '5 minutes' or v_prepared_at > now() + interval '1 minute'
  then raise exception 'Internal draft preparation requires a current authorization and all draft-only controls'; end if;

  select coalesce(max(revision_number), 0) + 1 into v_revision_number
    from public.seller_offer_drafts where authorization_id = v_authorization.id;

  v_content := jsonb_build_object(
    'templateVersion', 'internal-offer-terms-v1',
    'classification', 'INTERNAL_DRAFT_NOT_FOR_DELIVERY',
    'title', 'Internal Offer Terms Draft',
    'sellerName', v_inquiry.seller_name,
    'propertyAddress', v_inquiry.property_address,
    'terms', jsonb_build_object(
      'purchasePriceCents', v_authorization.purchase_price_cents,
      'assignmentFeeTargetCents', v_authorization.assignment_fee_target_cents,
      'earnestMoneyCents', v_authorization.earnest_money_cents,
      'inspectionPeriodDays', v_authorization.inspection_period_days,
      'closingPeriodDays', v_authorization.closing_period_days
    ),
    'authorizationExpiresAt', v_authorization.expires_at,
    'notice', 'Not an offer, contract, disclosure, signature instrument, or permission to contact the seller.',
    'requiredNextReview', jsonb_build_array('APPROVED_LEGAL_TEMPLATE', 'APPROVED_WHOLESALE_DISCLOSURE', 'FINAL_HUMAN_RELEASE')
  );
  v_content_sha256 := encode(digest(convert_to(v_content::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.seller_offer_drafts (
    id, case_id, authorization_id, revision_number, template_version, preparer_fingerprint,
    preparer_role, preparation_notes, content, content_sha256, exact_authorization_reconfirmed,
    internal_draft_only, legal_review_required, seller_facing_approved, signature_requested,
    delivery_initiated, outreach_initiated, prepared_at
  ) values (
    v_draft_id, v_case.id, v_authorization.id, v_revision_number, 'internal-offer-terms-v1',
    p_draft ->> 'preparerFingerprint', p_draft ->> 'preparerRole', p_draft ->> 'preparationNotes',
    v_content, v_content_sha256, true, true, true, false, false, false, false, v_prepared_at
  );

  insert into public.audit_events (entity_type, entity_id, action, details)
  values ('SELLER_OFFER_DRAFT', v_draft_id::text, 'PREPARED', jsonb_build_object(
    'case_id', v_case.id, 'authorization_id', v_authorization.id, 'revision_number', v_revision_number,
    'template_version', 'internal-offer-terms-v1', 'content_sha256', v_content_sha256,
    'preparer_fingerprint', p_draft ->> 'preparerFingerprint', 'preparer_role', p_draft ->> 'preparerRole',
    'seller_facing_approved', false, 'signature_requested', false, 'delivery_initiated', false,
    'outreach_initiated', false
  ));

  return jsonb_build_object('draftId', v_draft_id, 'caseId', v_case.id, 'revisionNumber', v_revision_number, 'created', true);
end;
$$;

create view public.current_seller_offer_drafts
with (security_invoker = true)
as
select
  draft.id as draft_id,
  draft.case_id,
  draft.authorization_id,
  draft.revision_number,
  draft.template_version,
  case
    when current_authorization.authorization_id is distinct from draft.authorization_id then 'AUTHORIZATION_STALE'
    when current_authorization.effective_status = 'EXPIRED' then 'AUTHORIZATION_EXPIRED'
    when current_authorization.effective_status = 'REVOKED' then 'AUTHORIZATION_REVOKED'
    when current_authorization.effective_status <> 'AUTHORIZED' then 'AUTHORIZATION_STALE'
    else 'CURRENT'
  end as effective_status,
  draft.preparer_fingerprint,
  draft.preparer_role,
  draft.preparation_notes,
  draft.content_sha256,
  draft.content,
  draft.prepared_at
from (
  select ranked.* from (
    select source.*, row_number() over (partition by source.case_id order by source.prepared_at desc, source.created_at desc) as recency_rank
    from public.seller_offer_drafts as source
  ) as ranked where ranked.recency_rank = 1
) as draft
left join public.current_seller_offer_authorizations as current_authorization
  on current_authorization.case_id = draft.case_id;

revoke execute on function public.record_seller_offer_draft(jsonb) from public, anon, authenticated;
grant execute on function public.record_seller_offer_draft(jsonb) to service_role;
grant select, insert on table public.seller_offer_drafts to service_role;
revoke update, delete on table public.seller_offer_drafts from service_role;
grant select on public.current_seller_offer_drafts to service_role, authenticated;

commit;
