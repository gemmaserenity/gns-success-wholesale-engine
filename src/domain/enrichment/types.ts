import type { PipelineState, RawLeadInput } from "../opportunities/types";

export const enrichmentSourceTypes = [
  "OPERATOR_RESEARCH",
  "PUBLIC_RECORD",
  "PERMITTED_API",
  "PAID_PROVIDER",
] as const;
export type EnrichmentSourceType = (typeof enrichmentSourceTypes)[number];

export const evidenceClassifications = [
  "VERIFIED",
  "PUBLIC_RECORD",
  "ESTIMATED",
  "MODEL_DERIVED",
  "HUMAN_VERIFIED",
] as const;
export type EvidenceClassification = (typeof evidenceClassifications)[number];

export const propertyFactFields = [
  "propertyType",
  "squareFeet",
  "bedrooms",
  "bathrooms",
  "yearBuilt",
  "lotSquareFeet",
  "assessedValue",
  "lastSaleDate",
  "lastSalePrice",
  "occupancy",
  "hoaStatus",
  "mailingAddress",
  "arvLow",
  "arvHigh",
  "repairsLow",
  "repairsHigh",
  "debtLow",
  "debtHigh",
  "liens",
] as const;
export type PropertyFactField = (typeof propertyFactFields)[number];
export type PropertyFactValue = string | number | boolean;

export interface PropertyFactInput {
  field: PropertyFactField;
  value: PropertyFactValue;
  classification: EvidenceClassification;
  confidence: number;
}

export interface PropertyEnrichmentRequest {
  evaluationId: string;
  provider: string;
  sourceType: EnrichmentSourceType;
  sourceUrl?: string | undefined;
  retrievedAt?: string | undefined;
  costCents: number;
  facts: PropertyFactInput[];
}

export interface EnrichmentCandidate {
  evaluationId: string;
  propertyId: string;
  state: PipelineState;
  score: number;
  expectedAssignmentFee: number;
  rawInput: RawLeadInput;
}

export interface EnrichmentGateDecision {
  allowed: boolean;
  paid: boolean;
  reasonCodes: string[];
  averageConfidence: number;
  expectedAssignmentFee: number;
  maximumApprovedCostCents: number;
}

export interface PersistedPropertyFact extends PropertyFactInput {
  id: string;
  observedAt: string;
  provider: string;
  sourceType: EnrichmentSourceType;
  sourceUrl?: string | undefined;
  costCents: number;
}

export interface PropertyEnrichmentStatus {
  propertyId: string;
  totalCostCents: number;
  lastEnrichedAt?: string | undefined;
  averageConfidence?: number | undefined;
  currentFacts: PersistedPropertyFact[];
}
