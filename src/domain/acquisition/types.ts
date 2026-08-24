import type { OpportunityEvaluation } from "../opportunities/types";
import type { SellerInquiry } from "../seller-intake/types";

export const ownerIdentityStatuses = ["MATCHED", "MISMATCH", "UNRESOLVED"] as const;
export const sellerAuthorityStatuses = ["VERIFIED", "UNVERIFIED"] as const;
export const acquisitionDecisions = ["ADVANCE_TO_ACQUISITION_REVIEW", "HOLD_FOR_RESEARCH", "DECLINE"] as const;

export type OwnerIdentityStatus = typeof ownerIdentityStatuses[number];
export type SellerAuthorityStatus = typeof sellerAuthorityStatuses[number];
export type AcquisitionDecision = typeof acquisitionDecisions[number];

export interface AcquisitionResearchInput {
  inquiryId: string;
  sourceName: string;
  sourceType: "PUBLIC_RECORD" | "HUMAN_VERIFIED";
  sourceUrl: string;
  retrievedAt: string;
  county: "MARICOPA" | "PINAL";
  apn: string;
  address: string;
  ownerName: string;
  ownerIdentityStatus: OwnerIdentityStatus;
  sellerAuthorityStatus: SellerAuthorityStatus;
  propertyIdentityVerified: true;
  verificationNotes: string;
  researchCostCents: 0;
  trusteeSaleDate?: string | undefined;
  recordedDate?: string | undefined;
  propertyType?: string | undefined;
  squareFeet?: number | undefined;
  yearBuilt?: number | undefined;
  occupancy?: string | undefined;
  arvLow: number;
  arvHigh: number;
  repairsLow: number;
  repairsHigh: number;
  debtLow: number;
  debtHigh: number;
  liens?: number | undefined;
  workingContractPrice?: number | undefined;
  ownerConfidence: number;
  dataConfidence: number;
  titleComplexity?: boolean | undefined;
}

export interface AcquisitionDecisionInput {
  caseId: string;
  inquiryId: string;
  sourceEvaluationId: string;
  buyerMatchRunId?: string | undefined;
  decision: AcquisitionDecision;
  rationale: string;
  materialFactsReviewed: boolean;
  consentBoundaryReviewed: boolean;
  noOfferAuthorized: true;
}

export interface AcquisitionDecisionGate {
  allowed: boolean;
  reasonCodes: string[];
}

export interface AcquisitionCaseStatus {
  caseId: string;
  inquiryId: string;
  propertyId: string;
  openedAt: string;
  verification: {
    verificationId: string;
    evaluationId: string;
    sourceName: string;
    sourceType: "PUBLIC_RECORD" | "HUMAN_VERIFIED";
    sourceUrl: string;
    retrievedAt: string;
    propertyIdentityVerified: boolean;
    ownerIdentityStatus: OwnerIdentityStatus;
    sellerAuthorityStatus: SellerAuthorityStatus;
    researchCostCents: number;
    verificationNotes: string;
  };
  evaluation: {
    evaluationId: string;
    state: OpportunityEvaluation["state"];
    score: number;
    confidence: OpportunityEvaluation["confidence"];
    nextAction: OpportunityEvaluation["nextAction"];
    baseUnderwriting: OpportunityEvaluation["scenarios"][number];
    evaluatedAt: string;
  };
  buyerDemand?: {
    runId: string;
    sourceEvaluationId: string;
    revisedEvaluationId: string;
    buyerDemandScore: number;
    probableBuyerCount: number;
    possibleBuyerCount: number;
    analyzedAt: string;
  } | undefined;
  decision?: {
    decisionId: string;
    decision: AcquisitionDecision;
    sourceEvaluationId: string;
    buyerMatchRunId?: string | undefined;
    rationale: string;
    decidedAt: string;
  } | undefined;
}

export interface AcquisitionCaseCommand {
  caseId: string;
  verificationId: string;
  openedAt: string;
  inquiry: SellerInquiry;
  research: AcquisitionResearchInput;
  evaluation: OpportunityEvaluation;
}
