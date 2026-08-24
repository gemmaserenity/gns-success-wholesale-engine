import type { OpportunityEvaluation } from "../opportunities/types";
import type { SellerInquiry } from "../seller-intake/types";

export const ownerIdentityStatuses = ["MATCHED", "MISMATCH", "UNRESOLVED"] as const;
export const sellerAuthorityStatuses = ["VERIFIED", "UNVERIFIED"] as const;
export const acquisitionDecisions = ["ADVANCE_TO_ACQUISITION_REVIEW", "HOLD_FOR_RESEARCH", "DECLINE"] as const;
export const diligenceItemKinds = [
  "PROPERTY_IDENTITY", "OWNER_IDENTITY", "SELLER_AUTHORITY", "TITLE", "LIENS_PAYOFFS", "TAXES",
  "DISTRESS_TIMELINE", "OCCUPANCY", "CONDITION_REPAIRS", "VALUE_SUPPORT", "BUYER_DEMAND",
  "WHOLESALE_DISCLOSURE", "CONSENT_COMMUNICATIONS",
] as const;
export const diligenceItemStatuses = ["SATISFIED", "OPEN", "BLOCKED", "NOT_APPLICABLE"] as const;
export const diligenceReadinessStatuses = ["NEEDS_RESEARCH", "BLOCKED", "READY_FOR_HUMAN_OFFER_AUTHORIZATION"] as const;

export type OwnerIdentityStatus = typeof ownerIdentityStatuses[number];
export type SellerAuthorityStatus = typeof sellerAuthorityStatuses[number];
export type AcquisitionDecision = typeof acquisitionDecisions[number];
export type DiligenceItemKind = typeof diligenceItemKinds[number];
export type DiligenceItemStatus = typeof diligenceItemStatuses[number];
export type DiligenceReadinessStatus = typeof diligenceReadinessStatuses[number];

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

export interface AcquisitionDiligenceItemInput {
  kind: DiligenceItemKind;
  status: DiligenceItemStatus;
  sourceName: string;
  sourceType: "PUBLIC_RECORD" | "HUMAN_VERIFIED" | "PROFESSIONAL_REVIEW" | "OPERATOR_REVIEW";
  sourceUrl?: string | undefined;
  reviewedAt: string;
  confidence: number;
  notes: string;
  costCents: 0;
}

export interface AcquisitionDiligenceInput {
  caseId: string;
  inquiryId: string;
  sourceEvaluationId: string;
  buyerMatchRunId: string;
  acquisitionDecisionId: string;
  summary: string;
  materialFactsCurrent: boolean;
  noOfferGenerated: true;
  noOutreachInitiated: true;
  items: AcquisitionDiligenceItemInput[];
}

export interface AcquisitionDiligenceAssessment {
  modelVersion: "acquisition-diligence-v1";
  readiness: DiligenceReadinessStatus;
  reasonCodes: string[];
  openItemKinds: DiligenceItemKind[];
  blockedItemKinds: DiligenceItemKind[];
}

export interface AcquisitionDiligenceStatus extends AcquisitionDiligenceAssessment {
  reviewId: string;
  caseId: string;
  sourceEvaluationId: string;
  buyerMatchRunId: string;
  acquisitionDecisionId: string;
  summary: string;
  materialFactsCurrent: boolean;
  reviewedAt: string;
  items: AcquisitionDiligenceItemInput[];
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
