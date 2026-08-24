import { z } from "zod";
import { acquisitionDecisions, diligenceItemKinds, diligenceItemStatuses, diligenceReadinessStatuses, offerAuthorizationDecisions, offerAuthorizationRoles, offerAuthorizationStatuses, ownerIdentityStatuses, sellerAuthorityStatuses } from "../domain/acquisition/types";
import type { AcquisitionCaseCommand, AcquisitionCaseStatus, AcquisitionDecisionGate, AcquisitionDecisionInput, AcquisitionDiligenceAssessment, AcquisitionDiligenceInput, AcquisitionDiligenceStatus, OfferAuthorizationGate, OfferAuthorizationInput, OfferAuthorizationRevocationInput, OfferAuthorizationStatusRecord } from "../domain/acquisition/types";
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
