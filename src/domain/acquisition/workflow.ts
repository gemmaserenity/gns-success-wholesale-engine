import type { SellerInquiry } from "../seller-intake/types";
import type { RawLeadInput } from "../opportunities/types";
import { diligenceItemKinds } from "./types";
import type { AcquisitionCaseStatus, AcquisitionDecisionGate, AcquisitionDecisionInput, AcquisitionDiligenceAssessment, AcquisitionDiligenceInput, AcquisitionDiligenceStatus, AcquisitionResearchInput, DiligenceItemKind, OfferAuthorizationGate, OfferAuthorizationInput, OfferAuthorizationStatusRecord, OfferDraftGate, OfferDraftInput } from "./types";

export function buildSellerAcquisitionLead(inquiry: SellerInquiry, research: AcquisitionResearchInput): RawLeadInput {
  return {
    source: "SELLER_INQUIRY_RESEARCH",
    sourceRecordId: inquiry.id,
    sourceUrl: research.sourceUrl,
    retrievedAt: research.retrievedAt,
    county: research.county,
    apn: research.apn,
    address: research.address,
    ownerName: research.ownerName,
    ...(research.trusteeSaleDate ? { trusteeSaleDate: research.trusteeSaleDate } : {}),
    ...(research.recordedDate ? { recordedDate: research.recordedDate } : {}),
    ...(research.propertyType ? { propertyType: research.propertyType } : {}),
    ...(research.squareFeet ? { squareFeet: research.squareFeet } : {}),
    ...(research.yearBuilt ? { yearBuilt: research.yearBuilt } : {}),
    ...(research.occupancy ? { occupancy: research.occupancy } : {}),
    arvLow: research.arvLow,
    arvHigh: research.arvHigh,
    repairsLow: research.repairsLow,
    repairsHigh: research.repairsHigh,
    debtLow: research.debtLow,
    debtHigh: research.debtHigh,
    ...(research.liens !== undefined ? { liens: research.liens } : {}),
    ...(research.workingContractPrice !== undefined ? { proposedContractPrice: research.workingContractPrice } : {}),
    ownerConfidence: research.ownerConfidence,
    dataConfidence: research.dataConfidence,
    ...(research.titleComplexity !== undefined ? { titleComplexity: research.titleComplexity } : {}),
    ownerMismatch: research.ownerIdentityStatus === "MISMATCH",
  };
}

export function evaluateAcquisitionDecisionGate(status: AcquisitionCaseStatus, input: AcquisitionDecisionInput): AcquisitionDecisionGate {
  const reasonCodes: string[] = [];
  if (status.caseId !== input.caseId) reasonCodes.push("CASE_MISMATCH");
  if (status.evaluation.evaluationId !== input.sourceEvaluationId) reasonCodes.push("STALE_EVALUATION");
  if (!input.noOfferAuthorized) reasonCodes.push("NO_OFFER_BOUNDARY_REQUIRED");
  if (input.decision === "ADVANCE_TO_ACQUISITION_REVIEW") {
    if (!input.materialFactsReviewed) reasonCodes.push("MATERIAL_FACTS_REVIEW_REQUIRED");
    if (!input.consentBoundaryReviewed) reasonCodes.push("CONSENT_REVIEW_REQUIRED");
    if (!status.verification.propertyIdentityVerified) reasonCodes.push("PROPERTY_NOT_VERIFIED");
    if (status.verification.ownerIdentityStatus !== "MATCHED") reasonCodes.push("OWNER_NOT_MATCHED");
    if (status.verification.sellerAuthorityStatus !== "VERIFIED") reasonCodes.push("SELLER_AUTHORITY_NOT_VERIFIED");
    if (status.evaluation.state === "REJECTED") reasonCodes.push("EVALUATION_REJECTED");
    if (!status.buyerDemand) reasonCodes.push("BUYER_DEMAND_REQUIRED");
    else if (input.buyerMatchRunId !== status.buyerDemand.runId) reasonCodes.push("BUYER_MATCH_MISMATCH");
  }
  return { allowed: reasonCodes.length === 0, reasonCodes: reasonCodes.length ? reasonCodes : ["HUMAN_DECISION_READY"] };
}

const requiredSatisfiedKinds = new Set<DiligenceItemKind>([
  "PROPERTY_IDENTITY", "OWNER_IDENTITY", "SELLER_AUTHORITY", "TITLE", "LIENS_PAYOFFS", "TAXES",
  "CONDITION_REPAIRS", "VALUE_SUPPORT", "BUYER_DEMAND", "WHOLESALE_DISCLOSURE",
]);

export function assessAcquisitionDiligence(input: AcquisitionDiligenceInput): AcquisitionDiligenceAssessment {
  const itemByKind = new Map(input.items.map((item) => [item.kind, item]));
  const blockedItemKinds = diligenceItemKinds.filter((kind) => itemByKind.get(kind)?.status === "BLOCKED").sort();
  const openItemKinds = diligenceItemKinds.filter((kind) => {
    const status = itemByKind.get(kind)?.status;
    return status === "OPEN" || (status === "NOT_APPLICABLE" && requiredSatisfiedKinds.has(kind));
  }).sort();
  const reasonCodes: string[] = [];
  let readiness: AcquisitionDiligenceAssessment["readiness"] = "READY_FOR_HUMAN_OFFER_AUTHORIZATION";
  if (blockedItemKinds.length) {
    readiness = "BLOCKED";
    reasonCodes.push("DILIGENCE_BLOCKER_PRESENT");
  } else if (openItemKinds.length || !input.materialFactsCurrent) {
    readiness = "NEEDS_RESEARCH";
    if (openItemKinds.length) reasonCodes.push("DILIGENCE_ITEMS_OPEN");
    if (!input.materialFactsCurrent) reasonCodes.push("MATERIAL_FACTS_NOT_CURRENT");
  } else {
    reasonCodes.push("READY_FOR_HUMAN_OFFER_AUTHORIZATION");
  }
  return { modelVersion: "acquisition-diligence-v1", readiness, reasonCodes, openItemKinds, blockedItemKinds };
}

export function evaluateDiligenceEntryGate(status: AcquisitionCaseStatus, input: AcquisitionDiligenceInput): AcquisitionDecisionGate {
  const reasonCodes: string[] = [];
  if (status.caseId !== input.caseId || status.inquiryId !== input.inquiryId) reasonCodes.push("CASE_MISMATCH");
  if (status.evaluation.evaluationId !== input.sourceEvaluationId) reasonCodes.push("STALE_EVALUATION");
  if (!status.buyerDemand || status.buyerDemand.runId !== input.buyerMatchRunId) reasonCodes.push("CURRENT_BUYER_DEMAND_REQUIRED");
  if (!status.decision || status.decision.decisionId !== input.acquisitionDecisionId || status.decision.decision !== "ADVANCE_TO_ACQUISITION_REVIEW") {
    reasonCodes.push("ACQUISITION_ADVANCE_REQUIRED");
  } else {
    if (status.decision.sourceEvaluationId !== status.evaluation.evaluationId) reasonCodes.push("ACQUISITION_DECISION_STALE");
    if (status.decision.buyerMatchRunId !== status.buyerDemand?.runId) reasonCodes.push("ACQUISITION_BUYER_EVIDENCE_STALE");
  }
  if (!input.noOfferGenerated) reasonCodes.push("NO_OFFER_BOUNDARY_REQUIRED");
  if (!input.noOutreachInitiated) reasonCodes.push("NO_OUTREACH_BOUNDARY_REQUIRED");
  return { allowed: reasonCodes.length === 0, reasonCodes: reasonCodes.length ? reasonCodes : ["DILIGENCE_REVIEW_ALLOWED"] };
}

export function evaluateOfferAuthorizationGate(
  status: AcquisitionCaseStatus,
  diligence: AcquisitionDiligenceStatus | undefined,
  input: OfferAuthorizationInput,
): OfferAuthorizationGate {
  const reasonCodes: string[] = [];
  const maximumPurchasePriceCents = Math.round(status.evaluation.baseUnderwriting.maximumContractForTargetFee * 100);
  if (status.caseId !== input.caseId || status.inquiryId !== input.inquiryId) reasonCodes.push("CASE_MISMATCH");
  if (status.evaluation.evaluationId !== input.sourceEvaluationId) reasonCodes.push("STALE_EVALUATION");
  if (!status.buyerDemand || status.buyerDemand.runId !== input.buyerMatchRunId) reasonCodes.push("CURRENT_BUYER_DEMAND_REQUIRED");
  if (!status.decision || status.decision.decisionId !== input.acquisitionDecisionId || status.decision.decision !== "ADVANCE_TO_ACQUISITION_REVIEW") {
    reasonCodes.push("CURRENT_ADVANCE_DECISION_REQUIRED");
  }
  if (!diligence || diligence.reviewId !== input.diligenceReviewId || diligence.readiness !== "READY_FOR_HUMAN_OFFER_AUTHORIZATION") {
    reasonCodes.push("CURRENT_READY_DILIGENCE_REQUIRED");
  } else {
    if (diligence.caseId !== status.caseId) reasonCodes.push("DILIGENCE_CASE_MISMATCH");
    if (diligence.sourceEvaluationId !== status.evaluation.evaluationId) reasonCodes.push("DILIGENCE_EVALUATION_STALE");
    if (diligence.buyerMatchRunId !== status.buyerDemand?.runId) reasonCodes.push("DILIGENCE_BUYER_EVIDENCE_STALE");
    if (diligence.acquisitionDecisionId !== status.decision?.decisionId) reasonCodes.push("DILIGENCE_DECISION_STALE");
  }
  if (!input.internalAuthorizationOnly) reasonCodes.push("INTERNAL_AUTHORIZATION_BOUNDARY_REQUIRED");
  if (!input.noOfferGenerated) reasonCodes.push("NO_OFFER_GENERATION_BOUNDARY_REQUIRED");
  if (!input.noOutreachInitiated) reasonCodes.push("NO_OUTREACH_BOUNDARY_REQUIRED");
  if (input.decision === "AUTHORIZE_INTERNAL_TERMS" && input.terms) {
    if (input.terms.purchasePriceCents + input.terms.assignmentFeeTargetCents > Math.round(status.evaluation.baseUnderwriting.investorPurchaseCeiling * 100)) {
      reasonCodes.push("INVESTOR_CEILING_EXCEEDED");
    }
    if (input.terms.purchasePriceCents > maximumPurchasePriceCents) reasonCodes.push("PURCHASE_PRICE_EXCEEDS_TARGET_FEE_CEILING");
    if (input.terms.earnestMoneyCents > input.terms.purchasePriceCents) reasonCodes.push("EARNEST_MONEY_EXCEEDS_PURCHASE_PRICE");
  }
  return {
    allowed: reasonCodes.length === 0,
    reasonCodes: reasonCodes.length ? reasonCodes : [input.decision === "AUTHORIZE_INTERNAL_TERMS" ? "INTERNAL_TERMS_READY_FOR_AUTHORIZATION" : "AUTHORIZATION_DECLINE_READY"],
    maximumPurchasePriceCents,
  };
}

export function evaluateOfferDraftGate(
  status: AcquisitionCaseStatus,
  diligence: AcquisitionDiligenceStatus | undefined,
  authorization: OfferAuthorizationStatusRecord | undefined,
  input: OfferDraftInput,
  now: Date,
): OfferDraftGate {
  const reasonCodes: string[] = [];
  if (status.caseId !== input.caseId || status.inquiryId !== input.inquiryId) reasonCodes.push("CASE_MISMATCH");
  if (!authorization || authorization.authorizationId !== input.authorizationId) reasonCodes.push("CURRENT_AUTHORIZATION_REQUIRED");
  else {
    if (authorization.effectiveStatus !== "AUTHORIZED") reasonCodes.push("AUTHORIZATION_NOT_ACTIVE");
    if (!authorization.terms || !authorization.expiresAt) reasonCodes.push("AUTHORIZED_TERMS_REQUIRED");
    else if (new Date(authorization.expiresAt).getTime() <= now.getTime()) reasonCodes.push("AUTHORIZATION_EXPIRED");
    if (authorization.caseId !== status.caseId) reasonCodes.push("AUTHORIZATION_CASE_MISMATCH");
    if (authorization.sourceEvaluationId !== status.evaluation.evaluationId) reasonCodes.push("AUTHORIZATION_EVALUATION_STALE");
    if (authorization.buyerMatchRunId !== status.buyerDemand?.runId) reasonCodes.push("AUTHORIZATION_BUYER_EVIDENCE_STALE");
    if (authorization.acquisitionDecisionId !== status.decision?.decisionId) reasonCodes.push("AUTHORIZATION_DECISION_STALE");
    if (authorization.diligenceReviewId !== diligence?.reviewId) reasonCodes.push("AUTHORIZATION_DILIGENCE_STALE");
  }
  if (!input.exactAuthorizationReconfirmed) reasonCodes.push("EXACT_AUTHORIZATION_RECONFIRMATION_REQUIRED");
  if (!input.internalDraftOnly) reasonCodes.push("INTERNAL_DRAFT_BOUNDARY_REQUIRED");
  if (!input.legalReviewRequired || input.sellerFacingApproved) reasonCodes.push("LEGAL_REVIEW_BOUNDARY_REQUIRED");
  if (!input.noSignatureRequested) reasonCodes.push("NO_SIGNATURE_BOUNDARY_REQUIRED");
  if (!input.noDeliveryInitiated) reasonCodes.push("NO_DELIVERY_BOUNDARY_REQUIRED");
  if (!input.noOutreachInitiated) reasonCodes.push("NO_OUTREACH_BOUNDARY_REQUIRED");
  return { allowed: reasonCodes.length === 0, reasonCodes: reasonCodes.length ? reasonCodes : ["INTERNAL_DRAFT_PREPARATION_ALLOWED"] };
}
