import type { SellerInquiry } from "../seller-intake/types";
import type { RawLeadInput } from "../opportunities/types";
import { diligenceItemKinds } from "./types";
import type { AcquisitionCaseStatus, AcquisitionDecisionGate, AcquisitionDecisionInput, AcquisitionDiligenceAssessment, AcquisitionDiligenceInput, AcquisitionResearchInput, DiligenceItemKind } from "./types";

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
