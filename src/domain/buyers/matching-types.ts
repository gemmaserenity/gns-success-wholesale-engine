import type { BuyerProfile, BuyerPropertyType } from "./types";
import type { County, OpportunityEvaluation, RawLeadInput } from "../opportunities/types";

export const buyerMatchOutcomes = ["MATCH", "MISMATCH", "UNKNOWN", "NOT_APPLICABLE"] as const;
export type BuyerMatchOutcome = typeof buyerMatchOutcomes[number];

export const buyerMatchClassifications = ["PROBABLE", "POSSIBLE", "EXCLUDED", "INELIGIBLE"] as const;
export type BuyerMatchClassification = typeof buyerMatchClassifications[number];

export interface BuyerMatchProperty {
  county: County;
  zip?: string | undefined;
  propertyType?: BuyerPropertyType | undefined;
  buyerAcquisitionPrice: number;
  arv: number;
  repairs: number;
  squareFeet?: number | undefined;
  yearBuilt?: number | undefined;
  occupancy?: "VACANT" | "TENANT_OCCUPIED" | "OWNER_OCCUPIED" | undefined;
  hasHoa?: boolean | undefined;
  daysToDeadline?: number | undefined;
}

export interface BuyerCriterionResult {
  criterion: string;
  outcome: BuyerMatchOutcome;
  weight: number;
  reasonCode: string;
  detail: string;
}

export interface BuyerMatchResult {
  buyerId: string;
  buyerName: string;
  classification: BuyerMatchClassification;
  fitScore: number;
  credibilityScore: number;
  reasonCodes: string[];
  criteria: BuyerCriterionResult[];
  buyerSnapshot: BuyerProfile;
}

export interface BuyerDemandAnalysis {
  modelVersion: "buyer-demand-v1";
  buyerDemandScore: number;
  probableBuyerCount: number;
  possibleBuyerCount: number;
  eligibleBuyerCount: number;
  evaluatedBuyerCount: number;
  buyerPoolTruncated: boolean;
  reasonCodes: string[];
  property: BuyerMatchProperty;
  matches: BuyerMatchResult[];
}

export interface BuyerMatchRunCommand {
  runId: string;
  sourceEvaluationId: string;
  propertyId: string;
  analyzedAt: string;
  analysis: BuyerDemandAnalysis;
  revisedEvaluation: OpportunityEvaluation;
}

export interface BuyerMatchStatus extends BuyerDemandAnalysis {
  runId: string;
  sourceEvaluationId: string;
  revisedEvaluationId: string;
  propertyId: string;
  analyzedAt: string;
}

export interface BuyerMatchBuildInput {
  rawInput: RawLeadInput;
  propertyFacts?: Array<{ field: string; value: string | number | boolean }>;
  now?: Date;
}
