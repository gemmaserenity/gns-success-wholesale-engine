import type { PipelineState, RawLeadInput } from "../opportunities/types";

export const skipTracePurposes = ["OWNER_LOCATION", "OWNER_IDENTITY_CONFIRMATION", "AUTHORIZED_REPRESENTATIVE"] as const;
export type SkipTracePurpose = (typeof skipTracePurposes)[number];

export const skipTraceSourceTypes = ["PUBLIC_RECORD", "OPERATOR_RESEARCH", "PERMITTED_PROVIDER", "PAID_PROVIDER"] as const;
export type SkipTraceSourceType = (typeof skipTraceSourceTypes)[number];

export const skipTraceOutcomes = ["CONTACT_FOUND", "NO_MATCH", "NEEDS_REVIEW"] as const;
export type SkipTraceOutcome = (typeof skipTraceOutcomes)[number];

export const skipTraceFindingKinds = ["PHONE", "EMAIL", "MAILING_ADDRESS", "OTHER"] as const;
export type SkipTraceFindingKind = (typeof skipTraceFindingKinds)[number];

export const skipTraceIdentityStatuses = ["UNVERIFIED", "OWNER", "AUTHORIZED_REPRESENTATIVE", "WRONG_PARTY", "STALE"] as const;
export type SkipTraceIdentityStatus = (typeof skipTraceIdentityStatuses)[number];

export const sellerContactStandings = ["UNKNOWN", "CONSENTED", "EXISTING_RELATIONSHIP", "DO_NOT_CONTACT", "DECEASED"] as const;
export type SellerContactStanding = (typeof sellerContactStandings)[number];

export const contactChannels = ["CALL", "TEXT", "EMAIL", "MAIL"] as const;
export type ContactChannel = (typeof contactChannels)[number];

export interface SkipTraceCandidate {
  evaluationId: string;
  propertyId: string;
  state: PipelineState;
  score: number;
  expectedAssignmentFee: number;
  ownerConfidence: number;
  rawInput: RawLeadInput;
}

export interface SkipTraceCaseRequest {
  evaluationId: string;
  purpose: SkipTracePurpose;
  necessityReason: string;
  identityBasis: string;
  plannedSourceType: SkipTraceSourceType;
  provider: string;
  sourceUrl?: string | undefined;
  estimatedCostCents: number;
  privacyNotes: string;
  publicRecordsReviewed: boolean;
  contactStandingReviewed: boolean;
}

export interface SkipTraceGateDecision {
  allowed: boolean;
  reasonCodes: string[];
  expectedAssignmentFee: number;
  ownerConfidence: number;
  maximumApprovedCostCents: number;
  externalTransmissionAllowed: false;
}

export interface SkipTraceFindingInput {
  kind: SkipTraceFindingKind;
  value: string;
  subjectName: string;
  identityStatus: SkipTraceIdentityStatus;
  provider: string;
  sourceType: SkipTraceSourceType;
  sourceUrl?: string | undefined;
  sourceRecordId?: string | undefined;
  retrievedAt?: string | undefined;
  classification: "VERIFIED" | "PUBLIC_RECORD" | "HUMAN_VERIFIED" | "ESTIMATED";
  confidence: number;
  costCents: number;
  researchNotes: string;
}

export interface SkipTraceResultInput {
  caseId: string;
  outcome: SkipTraceOutcome;
  actualCostCents: number;
  completionNotes: string;
  findings: SkipTraceFindingInput[];
}

export interface ContactStandingInput {
  caseId: string;
  standing: SellerContactStanding;
  allowedChannels: ContactChannel[];
  reason: string;
  evidenceSource: string;
  evidenceUrl?: string | undefined;
  observedAt?: string | undefined;
}

export interface PersistedSkipTraceFinding extends SkipTraceFindingInput {
  id: string;
  retrievedAt: string;
}

export interface SkipTraceStatus {
  caseId: string;
  evaluationId: string;
  propertyId: string;
  ownerId: string;
  ownerName: string;
  status: "READY_FOR_RESEARCH" | "COMPLETED" | "CANCELLED";
  purpose: SkipTracePurpose;
  necessityReason: string;
  identityBasis: string;
  plannedSourceType: SkipTraceSourceType;
  provider: string;
  sourceUrl?: string | undefined;
  estimatedCostCents: number;
  actualCostCents: number;
  privacyNotes: string;
  gate: SkipTraceGateDecision;
  outcome?: SkipTraceOutcome | undefined;
  requestedAt: string;
  completedAt?: string | undefined;
  contactStanding: SellerContactStanding;
  allowedChannels: ContactChannel[];
  standingReason?: string | undefined;
  findings: PersistedSkipTraceFinding[];
}
