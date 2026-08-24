import { z } from "zod";
import { acquisitionDecisions, diligenceItemKinds, diligenceItemStatuses, diligenceReadinessStatuses, documentReleaseStatuses, offerAuthorizationDecisions, offerAuthorizationRoles, offerAuthorizationStatuses, offerDraftStatuses, offerDraftTemplateVersions, ownerIdentityStatuses, sellerAuthorityStatuses } from "../domain/acquisition/types";
import type { AcquisitionCaseCommand, AcquisitionCaseStatus, AcquisitionDecisionGate, AcquisitionDecisionInput, AcquisitionDiligenceAssessment, AcquisitionDiligenceInput, AcquisitionDiligenceStatus, DocumentGovernanceIntegrityStatus, DocumentReleaseGovernanceStatus, OfferAuthorizationGate, OfferAuthorizationInput, OfferAuthorizationRevocationInput, OfferAuthorizationStatusRecord, OfferDraftGate, OfferDraftInput, OfferDraftStatusRecord, Phase3ClosureStatus } from "../domain/acquisition/types";
import { isModernSupabaseSecretKey, SupabaseFeatureUnavailableError, type SupabaseConfig } from "./supabase-repository";

const scenarioSchema = z.object({
  name: z.enum(["DOWNSIDE", "BASE", "UPSIDE"]),
  arv: z.number(), repairs: z.number(), estimatedDebt: z.number(), investorPurchaseCeiling: z.number(),
  estimatedContractPrice: z.number(), maximumContractForTargetFee: z.number(), expectedAssignmentFee: z.number(), estimatedEquity: z.number(),
});

const rowSchema = z.object({
  case_id: z.string().uuid(), inquiry_id: z.string().uuid(), property_id: z.string().uuid(), opened_at: z.string().datetime({ offset: true }),
  verification: z.object({
    verificationId: z.string().uuid(), evaluationId: z.string().uuid(), sourceName: z.string(),
    sourceType: z.enum(["PUBLIC_RECORD", "HUMAN_VERIFIED"]), sourceUrl: z.string().url(), retrievedAt: z.string().datetime({ offset: true }),
    propertyIdentityVerified: z.boolean(), ownerIdentityStatus: z.enum(ownerIdentityStatuses), sellerAuthorityStatus: z.enum(sellerAuthorityStatuses),
    researchCostCents: z.number().int().nonnegative(), verificationNotes: z.string(),
  }),
  evaluation: z.object({
    evaluationId: z.string().uuid(), state: z.enum(["DISCOVERED", "NORMALIZED", "PRELIM_SCREEN", "REJECTED", "QUALIFIED"]),
    score: z.number().int().min(0).max(100), confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    nextAction: z.enum(["REJECT", "RESEARCH", "ENRICH", "HUMAN_REVIEW", "CONTACT_READY"]),
    baseUnderwriting: scenarioSchema, evaluatedAt: z.string().datetime({ offset: true }),
  }),
  buyer_demand: z.object({
    runId: z.string().uuid(), sourceEvaluationId: z.string().uuid(), revisedEvaluationId: z.string().uuid(),
    buyerDemandScore: z.number().int().min(0).max(100), probableBuyerCount: z.number().int().nonnegative(),
    possibleBuyerCount: z.number().int().nonnegative(), analyzedAt: z.string().datetime({ offset: true }),
  }).nullable(),
  decision: z.object({
    decisionId: z.string().uuid(), decision: z.enum(acquisitionDecisions), sourceEvaluationId: z.string().uuid(),
    buyerMatchRunId: z.string().uuid().nullable(), rationale: z.string(), decidedAt: z.string().datetime({ offset: true }),
  }).nullable(),
});

const diligenceItemRowSchema = z.object({
  kind: z.enum(diligenceItemKinds), status: z.enum(diligenceItemStatuses), sourceName: z.string(),
  sourceType: z.enum(["PUBLIC_RECORD", "HUMAN_VERIFIED", "PROFESSIONAL_REVIEW", "OPERATOR_REVIEW"]),
  sourceUrl: z.string().url().nullable(), reviewedAt: z.string().datetime({ offset: true }),
  confidence: z.number().min(0).max(1), notes: z.string(), costCents: z.number().int().nonnegative(),
});

const diligenceRowSchema = z.object({
  review_id: z.string().uuid(), case_id: z.string().uuid(), source_evaluation_id: z.string().uuid(),
  buyer_match_run_id: z.string().uuid(), acquisition_decision_id: z.string().uuid(),
  model_version: z.literal("acquisition-diligence-v1"), readiness: z.enum(diligenceReadinessStatuses),
  reason_codes: z.array(z.string()), open_item_kinds: z.array(z.enum(diligenceItemKinds)),
  blocked_item_kinds: z.array(z.enum(diligenceItemKinds)), summary: z.string(), material_facts_current: z.boolean(),
  reviewed_at: z.string().datetime({ offset: true }), items: z.array(diligenceItemRowSchema),
});

const offerTermsRowSchema = z.object({
  purchasePriceCents: z.number().int().positive(), assignmentFeeTargetCents: z.number().int().positive(),
  earnestMoneyCents: z.number().int().nonnegative(), inspectionPeriodDays: z.number().int().positive(), closingPeriodDays: z.number().int().positive(),
});

const offerAuthorizationRowSchema = z.object({
  authorization_id: z.string().uuid(), case_id: z.string().uuid(), diligence_review_id: z.string().uuid(),
  source_evaluation_id: z.string().uuid(), buyer_match_run_id: z.string().uuid(), acquisition_decision_id: z.string().uuid(),
  decision: z.enum(offerAuthorizationDecisions), effective_status: z.enum(offerAuthorizationStatuses),
  authorizer_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), authorizer_role: z.enum(offerAuthorizationRoles), rationale: z.string(),
  terms: offerTermsRowSchema.nullable(), authorized_at: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }).nullable(),
  revoked_at: z.string().datetime({ offset: true }).nullable(), revocation_reason: z.string().nullable(),
});

const offerDraftContentSchema = z.object({
  templateVersion: z.enum(offerDraftTemplateVersions),
  classification: z.literal("INTERNAL_DRAFT_NOT_FOR_DELIVERY"),
  title: z.literal("Internal Offer Terms Draft"),
  sellerName: z.string(), propertyAddress: z.string(), terms: offerTermsRowSchema,
  authorizationExpiresAt: z.string().datetime({ offset: true }),
  notice: z.literal("Not an offer, contract, disclosure, signature instrument, or permission to contact the seller."),
  requiredNextReview: z.tuple([z.literal("APPROVED_LEGAL_TEMPLATE"), z.literal("APPROVED_WHOLESALE_DISCLOSURE"), z.literal("FINAL_HUMAN_RELEASE")]),
});

const offerDraftRowSchema = z.object({
  draft_id: z.string().uuid(), case_id: z.string().uuid(), authorization_id: z.string().uuid(),
  revision_number: z.number().int().positive(), template_version: z.enum(offerDraftTemplateVersions),
  effective_status: z.enum(offerDraftStatuses), preparer_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  preparer_role: z.enum(offerAuthorizationRoles), preparation_notes: z.string(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/), content: offerDraftContentSchema,
  prepared_at: z.string().datetime({ offset: true }),
});

const documentReleaseRowSchema = z.object({
  release_package_id: z.string().uuid(), case_id: z.string().uuid(), draft_id: z.string().uuid(),
  draft_content_sha256: z.string().regex(/^[a-f0-9]{64}$/), draft_template_version: z.enum(offerDraftTemplateVersions),
  contract_version: z.string(), contract_content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  disclosure_version: z.string(), disclosure_content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  release_manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/), preparer_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  intended_delivery_channel: z.literal("EMAIL"), consent_statement_version: z.string(),
  retention_until: z.string().datetime({ offset: true }), prepared_at: z.string().datetime({ offset: true }),
  effective_status: z.enum(documentReleaseStatuses), decision: z.enum(["APPROVE", "REJECT"]).nullable(),
  decided_at: z.string().datetime({ offset: true }).nullable(), revoked_at: z.string().datetime({ offset: true }).nullable(),
  seller_facing_document_generated: z.literal(false), signature_request_available: z.literal(false), delivery_available: z.literal(false),
}).passthrough();

const documentReleaseGovernanceSchema = z.object({
  caseId: z.string().uuid(), exactCurrentDraft: z.boolean(), draftId: z.string().uuid().nullable(),
  draftContentSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), currentAuthorization: z.boolean(),
  approvedLegalTemplateAvailable: z.boolean(), approvedArizonaDisclosureAvailable: z.boolean(),
  permissions: z.object({ prepare: z.boolean(), approve: z.boolean(), revoke: z.boolean() }),
  release: documentReleaseRowSchema.nullable(), sellerFacingGenerationAvailable: z.literal(false),
  signatureRequestAvailable: z.literal(false), deliveryAvailable: z.literal(false), providerConfigured: z.literal(false), outreachAvailable: z.literal(false).optional(),
});

const documentGovernanceIntegritySchema = z.object({
  modelVersion: z.literal("seller-document-governance-integrity-v1"), assessedAt: z.string().datetime({ offset: true }),
  status: z.enum(["HEALTHY", "HOLD", "VIOLATION"]), reasonCodes: z.array(z.string()), centralHoldActive: z.boolean(),
  counts: z.object({
    approvedContractVersions: z.number().int().nonnegative(), approvedDisclosureVersions: z.number().int().nonnegative(),
    activePermissions: z.number().int().nonnegative(), releasePackages: z.number().int().nonnegative(),
    signatureEvents: z.number().int().nonnegative(), deliveryEvents: z.number().int().nonnegative(),
    separationViolations: z.number().int().nonnegative(), invalidSignatureEvents: z.number().int().nonnegative(),
    invalidDeliveryEvents: z.number().int().nonnegative(), retentionOverdue: z.number().int().nonnegative(),
  }), sellerFacingGenerationAvailable: z.literal(false), signatureRequestAvailable: z.literal(false),
  deliveryAvailable: z.literal(false), providerConfigured: z.literal(false), outreachAvailable: z.literal(false),
});

const governanceCountsSchema = documentGovernanceIntegritySchema.shape.counts;
const phase3ClosureSchema = z.object({
  manifest: z.object({
    manifestVersion: z.literal("phase3-governance-evidence-v1"), phase: z.literal("PHASE_3"),
    integrityModelVersion: z.literal("seller-document-governance-integrity-v1"),
    integrityStatus: z.enum(["HEALTHY", "HOLD", "VIOLATION"]), centralHoldActive: z.boolean(),
    reasonCodes: z.array(z.string()), counts: governanceCountsSchema,
    activationDecision: z.enum(["CLOSED_BY_DEFAULT", "OPEN", "CLOSE"]), activationEventId: z.string().uuid().nullable(),
    sellerFacingGenerationAvailable: z.literal(false), signatureRequestAvailable: z.literal(false), deliveryAvailable: z.literal(false),
    providerConfigured: z.literal(false), outreachAvailable: z.literal(false),
  }), manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  phaseStatus: z.enum(["COMPLETE_RELEASE_CLOSED", "ACTIVATION_PREREQUISITES_RECORDED"]), activationAvailable: z.literal(false),
  sellerFacingGenerationAvailable: z.literal(false), signatureRequestAvailable: z.literal(false), deliveryAvailable: z.literal(false),
  providerConfigured: z.literal(false), outreachAvailable: z.literal(false),
});

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 3 seller acquisition workflow");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

function mapRow(row: z.infer<typeof rowSchema>): AcquisitionCaseStatus {
  return {
    caseId: row.case_id, inquiryId: row.inquiry_id, propertyId: row.property_id, openedAt: row.opened_at,
    verification: row.verification, evaluation: row.evaluation,
    ...(row.buyer_demand ? { buyerDemand: row.buyer_demand } : {}),
    ...(row.decision ? { decision: {
      decisionId: row.decision.decisionId, decision: row.decision.decision,
      sourceEvaluationId: row.decision.sourceEvaluationId,
      ...(row.decision.buyerMatchRunId ? { buyerMatchRunId: row.decision.buyerMatchRunId } : {}),
      rationale: row.decision.rationale, decidedAt: row.decision.decidedAt,
    } } : {}),
  };
}

export async function getAcquisitionCase(config: SupabaseConfig, inquiryId: string): Promise<AcquisitionCaseStatus | undefined> {
  const params = new URLSearchParams({ select: "case_id,inquiry_id,property_id,opened_at,verification,evaluation,buyer_demand,decision", inquiry_id: `eq.${inquiryId}`, limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/current_seller_acquisition_cases?${params}`, { headers: headers(config) });
  const rows = z.array(rowSchema).parse(await readJson(response, "seller-acquisition case lookup"));
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function persistAcquisitionCase(config: SupabaseConfig, command: AcquisitionCaseCommand): Promise<AcquisitionCaseStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_seller_acquisition_case`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({
      p_case: { caseId: command.caseId, inquiryId: command.inquiry.id, openedAt: command.openedAt },
      p_verification: { verificationId: command.verificationId, ...command.research },
      p_evaluation: command.evaluation,
    }),
  });
  await readJson(response, "seller-acquisition case persistence");
  const status = await getAcquisitionCase(config, command.inquiry.id);
  if (!status) throw new Error("Persisted seller-acquisition case was not found");
  return status;
}

export async function recordAcquisitionDecision(
  config: SupabaseConfig,
  input: AcquisitionDecisionInput,
  gate: AcquisitionDecisionGate,
  decidedAt: string,
): Promise<AcquisitionCaseStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_acquisition_decision`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({ p_decision: { decisionId: crypto.randomUUID(), ...input, gateReasonCodes: gate.reasonCodes, decidedAt } }),
  });
  const result = z.object({ inquiryId: z.string().uuid() }).parse(await readJson(response, "seller-acquisition decision persistence"));
  const status = await getAcquisitionCase(config, result.inquiryId);
  if (!status) throw new Error("Updated seller-acquisition case was not found");
  return status;
}

function mapDiligenceRow(row: z.infer<typeof diligenceRowSchema>): AcquisitionDiligenceStatus {
  return {
    reviewId: row.review_id, caseId: row.case_id, sourceEvaluationId: row.source_evaluation_id,
    buyerMatchRunId: row.buyer_match_run_id, acquisitionDecisionId: row.acquisition_decision_id,
    modelVersion: row.model_version, readiness: row.readiness, reasonCodes: row.reason_codes,
    openItemKinds: row.open_item_kinds, blockedItemKinds: row.blocked_item_kinds,
    summary: row.summary, materialFactsCurrent: row.material_facts_current, reviewedAt: row.reviewed_at,
    items: row.items.map((item) => ({
      kind: item.kind, status: item.status, sourceName: item.sourceName, sourceType: item.sourceType,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}), reviewedAt: item.reviewedAt,
      confidence: item.confidence, notes: item.notes, costCents: 0,
    })),
  };
}

export async function getAcquisitionDiligence(config: SupabaseConfig, caseId: string): Promise<AcquisitionDiligenceStatus | undefined> {
  const params = new URLSearchParams({
    select: "review_id,case_id,source_evaluation_id,buyer_match_run_id,acquisition_decision_id,model_version,readiness,reason_codes,open_item_kinds,blocked_item_kinds,summary,material_facts_current,reviewed_at,items",
    case_id: `eq.${caseId}`, limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/current_seller_acquisition_diligence?${params}`, { headers: headers(config) });
  const rows = z.array(diligenceRowSchema).parse(await readJson(response, "acquisition-diligence lookup"));
  return rows[0] ? mapDiligenceRow(rows[0]) : undefined;
}

export async function persistAcquisitionDiligence(
  config: SupabaseConfig,
  reviewId: string,
  input: AcquisitionDiligenceInput,
  assessment: AcquisitionDiligenceAssessment,
  gate: AcquisitionDecisionGate,
  reviewedAt: string,
): Promise<AcquisitionDiligenceStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_acquisition_diligence`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({ p_review: { reviewId, ...input, ...assessment, gateReasonCodes: gate.reasonCodes, reviewedAt } }),
  });
  await readJson(response, "acquisition-diligence persistence");
  const status = await getAcquisitionDiligence(config, input.caseId);
  if (!status) throw new Error("Persisted acquisition-diligence review was not found");
  return status;
}

function mapOfferAuthorizationRow(row: z.infer<typeof offerAuthorizationRowSchema>): OfferAuthorizationStatusRecord {
  return {
    authorizationId: row.authorization_id, caseId: row.case_id, diligenceReviewId: row.diligence_review_id,
    sourceEvaluationId: row.source_evaluation_id, buyerMatchRunId: row.buyer_match_run_id,
    acquisitionDecisionId: row.acquisition_decision_id, decision: row.decision, effectiveStatus: row.effective_status,
    authorizerFingerprint: row.authorizer_fingerprint, authorizerRole: row.authorizer_role, rationale: row.rationale,
    ...(row.terms ? { terms: row.terms } : {}), authorizedAt: row.authorized_at,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}), ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
  };
}

export async function getOfferAuthorization(config: SupabaseConfig, caseId: string): Promise<OfferAuthorizationStatusRecord | undefined> {
  const params = new URLSearchParams({
    select: "authorization_id,case_id,diligence_review_id,source_evaluation_id,buyer_match_run_id,acquisition_decision_id,decision,effective_status,authorizer_fingerprint,authorizer_role,rationale,terms,authorized_at,expires_at,revoked_at,revocation_reason",
    case_id: `eq.${caseId}`, limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/current_seller_offer_authorizations?${params}`, { headers: headers(config) });
  const rows = z.array(offerAuthorizationRowSchema).parse(await readJson(response, "seller offer-authorization lookup"));
  return rows[0] ? mapOfferAuthorizationRow(rows[0]) : undefined;
}

export async function persistOfferAuthorization(
  config: SupabaseConfig,
  authorizationId: string,
  input: OfferAuthorizationInput,
  gate: OfferAuthorizationGate,
  authorizerFingerprint: string,
  authorizedAt: string,
): Promise<OfferAuthorizationStatusRecord> {
  const expiresAt = input.validForHours ? new Date(new Date(authorizedAt).getTime() + input.validForHours * 3_600_000).toISOString() : undefined;
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_offer_authorization`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({ p_authorization: { authorizationId, ...input, gateReasonCodes: gate.reasonCodes, authorizerFingerprint, authorizedAt, expiresAt } }),
  });
  await readJson(response, "seller offer-authorization persistence");
  const status = await getOfferAuthorization(config, input.caseId);
  if (!status) throw new Error("Persisted seller offer authorization was not found");
  return status;
}

export async function revokeOfferAuthorization(
  config: SupabaseConfig,
  revocationId: string,
  input: OfferAuthorizationRevocationInput,
  actorFingerprint: string,
  revokedAt: string,
): Promise<OfferAuthorizationStatusRecord> {
  const response = await fetch(`${config.url}/rest/v1/rpc/revoke_seller_offer_authorization`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({ p_revocation: { revocationId, ...input, actorFingerprint, revokedAt } }),
  });
  await readJson(response, "seller offer-authorization revocation");
  const status = await getOfferAuthorization(config, input.caseId);
  if (!status) throw new Error("Revoked seller offer authorization was not found");
  return status;
}

function mapOfferDraftRow(row: z.infer<typeof offerDraftRowSchema>): OfferDraftStatusRecord {
  return {
    draftId: row.draft_id, caseId: row.case_id, authorizationId: row.authorization_id,
    revisionNumber: row.revision_number, templateVersion: row.template_version,
    effectiveStatus: row.effective_status, preparerFingerprint: row.preparer_fingerprint,
    preparerRole: row.preparer_role, preparationNotes: row.preparation_notes,
    contentSha256: row.content_sha256, content: row.content, preparedAt: row.prepared_at,
  };
}

export async function getOfferDraft(config: SupabaseConfig, caseId: string): Promise<OfferDraftStatusRecord | undefined> {
  const params = new URLSearchParams({
    select: "draft_id,case_id,authorization_id,revision_number,template_version,effective_status,preparer_fingerprint,preparer_role,preparation_notes,content_sha256,content,prepared_at",
    case_id: `eq.${caseId}`, limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/current_seller_offer_drafts?${params}`, { headers: headers(config) });
  const rows = z.array(offerDraftRowSchema).parse(await readJson(response, "seller offer-draft lookup"));
  return rows[0] ? mapOfferDraftRow(rows[0]) : undefined;
}

export async function persistOfferDraft(
  config: SupabaseConfig,
  draftId: string,
  input: OfferDraftInput,
  gate: OfferDraftGate,
  preparerFingerprint: string,
  preparedAt: string,
): Promise<OfferDraftStatusRecord> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_offer_draft`, {
    method: "POST", headers: headers(config),
    body: JSON.stringify({ p_draft: { draftId, ...input, gateReasonCodes: gate.reasonCodes, preparerFingerprint, preparedAt } }),
  });
  await readJson(response, "seller offer-draft persistence");
  const status = await getOfferDraft(config, input.caseId);
  if (!status) throw new Error("Persisted seller offer draft was not found");
  return status;
}

export async function getDocumentReleaseGovernance(
  config: SupabaseConfig,
  caseId: string,
  actorFingerprint: string,
): Promise<DocumentReleaseGovernanceStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/get_seller_document_release_governance`, {
    method: "POST", headers: headers(config), body: JSON.stringify({ p_case_id: caseId, p_actor_fingerprint: actorFingerprint }),
  });
  const row = documentReleaseGovernanceSchema.parse(await readJson(response, "seller document-release governance lookup"));
  return {
    caseId: row.caseId, exactCurrentDraft: row.exactCurrentDraft,
    ...(row.draftId ? { draftId: row.draftId } : {}), ...(row.draftContentSha256 ? { draftContentSha256: row.draftContentSha256 } : {}),
    currentAuthorization: row.currentAuthorization, approvedLegalTemplateAvailable: row.approvedLegalTemplateAvailable,
    approvedArizonaDisclosureAvailable: row.approvedArizonaDisclosureAvailable, permissions: row.permissions,
    ...(row.release ? { release: {
      releasePackageId: row.release.release_package_id, caseId: row.release.case_id, draftId: row.release.draft_id,
      draftContentSha256: row.release.draft_content_sha256, draftTemplateVersion: row.release.draft_template_version,
      contractVersion: row.release.contract_version, contractContentSha256: row.release.contract_content_sha256,
      disclosureVersion: row.release.disclosure_version, disclosureContentSha256: row.release.disclosure_content_sha256,
      releaseManifestSha256: row.release.release_manifest_sha256, preparerFingerprint: row.release.preparer_fingerprint,
      intendedDeliveryChannel: row.release.intended_delivery_channel, consentStatementVersion: row.release.consent_statement_version,
      retentionUntil: row.release.retention_until, preparedAt: row.release.prepared_at, effectiveStatus: row.release.effective_status,
      ...(row.release.decision ? { decision: row.release.decision } : {}), ...(row.release.decided_at ? { decidedAt: row.release.decided_at } : {}),
      ...(row.release.revoked_at ? { revokedAt: row.release.revoked_at } : {}), sellerFacingDocumentGenerated: false,
      signatureRequestAvailable: false, deliveryAvailable: false,
    } } : {}),
    sellerFacingGenerationAvailable: false, signatureRequestAvailable: false, deliveryAvailable: false, providerConfigured: false, outreachAvailable: false,
  };
}

export async function getDocumentGovernanceIntegrity(config: SupabaseConfig): Promise<DocumentGovernanceIntegrityStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/get_seller_document_governance_integrity`, {
    method: "POST", headers: headers(config), body: "{}",
  });
  return documentGovernanceIntegritySchema.parse(await readJson(response, "seller document-governance integrity lookup"));
}

export async function getPhase3ClosureStatus(config: SupabaseConfig): Promise<Phase3ClosureStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/get_phase3_governance_evidence_manifest`, {
    method: "POST", headers: headers(config), body: "{}",
  });
  const row = phase3ClosureSchema.parse(await readJson(response, "Phase 3 closure manifest lookup"));
  return row;
}
