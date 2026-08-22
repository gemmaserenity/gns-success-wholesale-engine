export const counties = ["MARICOPA", "PINAL"] as const;
export type County = (typeof counties)[number];

export const pipelineStates = [
  "DISCOVERED",
  "NORMALIZED",
  "PRELIM_SCREEN",
  "REJECTED",
  "QUALIFIED",
] as const;
export type PipelineState = (typeof pipelineStates)[number];

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type NextAction = "REJECT" | "RESEARCH" | "ENRICH" | "HUMAN_REVIEW" | "CONTACT_READY";

export interface RawLeadInput {
  source: string;
  sourceRecordId?: string | undefined;
  sourceUrl?: string | undefined;
  retrievedAt?: string | undefined;
  county: string;
  apn: string;
  address: string;
  ownerName: string;
  trusteeSaleDate?: string | undefined;
  recordedDate?: string | undefined;
  propertyType?: string | undefined;
  squareFeet?: number | undefined;
  yearBuilt?: number | undefined;
  arvLow: number;
  arvHigh: number;
  repairsLow: number;
  repairsHigh: number;
  debtLow: number;
  debtHigh: number;
  liens?: number | undefined;
  proposedContractPrice?: number | undefined;
  ownerConfidence: number;
  dataConfidence: number;
  buyerDemandScore?: number | undefined;
  propertyDesirabilityScore?: number | undefined;
  contactabilityScore?: number | undefined;
  titleComplexity?: boolean | undefined;
  ownerMismatch?: boolean | undefined;
}

export interface NormalizedLead extends Omit<RawLeadInput, "county"> {
  county: County;
  apn: string;
  address: string;
  ownerName: string;
  retrievedAt: string;
  deduplicationKey: string;
}

export interface UnderwritingScenario {
  name: "DOWNSIDE" | "BASE" | "UPSIDE";
  arv: number;
  repairs: number;
  estimatedDebt: number;
  investorPurchaseCeiling: number;
  estimatedContractPrice: number;
  maximumContractForTargetFee: number;
  expectedAssignmentFee: number;
  estimatedEquity: number;
}

export interface DecisionReason {
  code: string;
  severity: "REJECT" | "REVIEW" | "POSITIVE";
  message: string;
}

export interface OpportunityScore {
  total: number;
  band: "IMMEDIATE_PRIORITY" | "HIGH_PRIORITY" | "RESEARCH_NURTURE" | "ARCHIVE";
  components: Record<string, number>;
}

export interface OpportunityEvaluation {
  evaluationId: string;
  evaluatedAt: string;
  parserVersion: string;
  rawInput: RawLeadInput;
  lead: NormalizedLead;
  scenarios: UnderwritingScenario[];
  reasons: DecisionReason[];
  score: OpportunityScore;
  state: PipelineState;
  confidence: ConfidenceLevel;
  nextAction: NextAction;
  duplicate: boolean;
}
