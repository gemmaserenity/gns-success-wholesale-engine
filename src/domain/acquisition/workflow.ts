import type { SellerInquiry } from "../seller-intake/types";
import type { RawLeadInput } from "../opportunities/types";
import type { AcquisitionCaseStatus, AcquisitionDecisionGate, AcquisitionDecisionInput, AcquisitionResearchInput } from "./types";

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
