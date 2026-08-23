import type { RawLeadInput } from "../opportunities/types";
import type { PropertyEnrichmentRequest } from "./types";

const evaluationFields = new Set([
  "propertyType",
  "squareFeet",
  "yearBuilt",
  "arvLow",
  "arvHigh",
  "repairsLow",
  "repairsHigh",
  "debtLow",
  "debtHigh",
  "liens",
]);

export function buildEnrichedEvaluationInput(
  current: RawLeadInput,
  request: PropertyEnrichmentRequest,
  enrichmentRunId: string,
  now = new Date(),
): RawLeadInput | undefined {
  const updates = request.facts.filter((fact) => evaluationFields.has(fact.field));
  if (updates.length === 0) return undefined;
  const revised: RawLeadInput = {
    ...current,
    source: `ENRICHMENT:${request.sourceType}`,
    sourceRecordId: enrichmentRunId,
    retrievedAt: request.retrievedAt ?? now.toISOString(),
    ...(request.sourceUrl ? { sourceUrl: request.sourceUrl } : {}),
  };
  for (const fact of updates) {
    switch (fact.field) {
      case "propertyType":
        revised.propertyType = String(fact.value);
        break;
      case "squareFeet":
      case "yearBuilt":
      case "arvLow":
      case "arvHigh":
      case "repairsLow":
      case "repairsHigh":
      case "debtLow":
      case "debtHigh":
      case "liens":
        revised[fact.field] = Number(fact.value);
        break;
    }
  }
  return revised;
}
