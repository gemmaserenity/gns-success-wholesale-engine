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
export const offerAuthorizationDecisions = ["AUTHORIZE_INTERNAL_TERMS", "DECLINE_AUTHORIZATION"] as const;
export const offerAuthorizationRoles = ["ACQUISITIONS_MANAGER", "PRINCIPAL"] as const;
export const offerAuthorizationStatuses = ["AUTHORIZED", "DECLINED", "REVOKED", "EXPIRED", "STALE"] as const;
export const offerDraftTemplateVersions = ["internal-offer-terms-v1"] as const;
export const offerDraftStatuses = ["CURRENT", "AUTHORIZATION_EXPIRED", "AUTHORIZATION_REVOKED", "AUTHORIZATION_STALE"] as const;

export type OwnerIdentityStatus = typeof ownerIdentityStatuses[number];
export type SellerAuthorityStatus = typeof sellerAuthorityStatuses[number];
export type AcquisitionDecision = typeof acquisitionDecisions[number];
export type DiligenceItemKind = typeof diligenceItemKinds[number];
export type DiligenceItemStatus = typeof diligenceItemStatuses[number];
export type DiligenceReadinessStatus = typeof diligenceReadinessStatuses[number];
export type OfferAuthorizationDecision = typeof offerAuthorizationDecisions[number];
export type OfferAuthorizationRole = typeof offerAuthorizationRoles[number];
export type OfferAuthorizationStatus = typeof offerAuthorizationStatuses[number];
export type OfferDraftTemplateVersion = typeof offerDraftTemplateVersions[number];
export type OfferDraftStatus = typeof offerDraftStatuses[number];

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

export interface OfferTermLimits {
  purchasePriceCents: number;
  assignmentFeeTargetCents: number;
  earnestMoneyCents: number;
  inspectionPeriodDays: number;
  closingPeriodDays: number;
}

export interface OfferAuthorizationInput {
  caseId: string;
  inquiryId: string;
  diligenceReviewId: string;
  sourceEvaluationId: string;
  buyerMatchRunId: string;
  acquisitionDecisionId: string;
  decision: OfferAuthorizationDecision;
  authorizerRole: OfferAuthorizationRole;
  rationale: string;
  validForHours?: 24 | 48 | 72 | undefined;
  terms?: OfferTermLimits | undefined;
  materialFactsReconfirmed: true;
  disclosureReviewed: true;
  internalAuthorizationOnly: true;
  noOfferGenerated: true;
  noOutreachInitiated: true;
}

export interface OfferAuthorizationGate extends AcquisitionDecisionGate {
  maximumPurchasePriceCents?: number | undefined;
}

export interface OfferAuthorizationStatusRecord {
  authorizationId: string;
  caseId: string;
  diligenceReviewId: string;
  sourceEvaluationId: string;
  buyerMatchRunId: string;
  acquisitionDecisionId: string;
  decision: OfferAuthorizationDecision;
  effectiveStatus: OfferAuthorizationStatus;
  authorizerFingerprint: string;
  authorizerRole: OfferAuthorizationRole;
  rationale: string;
  terms?: OfferTermLimits | undefined;
  authorizedAt: string;
  expiresAt?: string | undefined;
  revokedAt?: string | undefined;
  revocationReason?: string | undefined;
}

export interface OfferAuthorizationRevocationInput {
  caseId: string;
  authorizationId: string;
  reason: string;
  internalAuthorizationOnly: true;
  noOfferGenerated: true;
  noOutreachInitiated: true;
}

export interface OfferDraftInput {
  caseId: string;
  inquiryId: string;
  authorizationId: string;
  templateVersion: OfferDraftTemplateVersion;
  preparerRole: OfferAuthorizationRole;
  preparationNotes: string;
  exactAuthorizationReconfirmed: true;
  internalDraftOnly: true;
  legalReviewRequired: true;
  sellerFacingApproved: false;
  noSignatureRequested: true;
  noDeliveryInitiated: true;
  noOutreachInitiated: true;
}

export interface OfferDraftGate extends AcquisitionDecisionGate {}

export interface OfferDraftContent {
  templateVersion: OfferDraftTemplateVersion;
  classification: "INTERNAL_DRAFT_NOT_FOR_DELIVERY";
  title: "Internal Offer Terms Draft";
  sellerName: string;
  propertyAddress: string;
  terms: OfferTermLimits;
  authorizationExpiresAt: string;
  notice: "Not an offer, contract, disclosure, signature instrument, or permission to contact the seller.";
  requiredNextReview: ["APPROVED_LEGAL_TEMPLATE", "APPROVED_WHOLESALE_DISCLOSURE", "FINAL_HUMAN_RELEASE"];
}

export interface OfferDraftStatusRecord {
  draftId: string;
  caseId: string;
  authorizationId: string;
  revisionNumber: number;
  templateVersion: OfferDraftTemplateVersion;
  effectiveStatus: OfferDraftStatus;
  preparerFingerprint: string;
  preparerRole: OfferAuthorizationRole;
  preparationNotes: string;
  contentSha256: string;
  content: OfferDraftContent;
  preparedAt: string;
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
