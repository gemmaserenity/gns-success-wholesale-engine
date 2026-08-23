import type {
  EnrichmentCandidate,
  EnrichmentGateDecision,
  PropertyEnrichmentRequest,
} from "./types";

export interface EnrichmentGateOptions {
  maximumPaidCostCents?: number;
  minimumPaidConfidence?: number;
  minimumAssignmentFee?: number;
}

export function evaluateEnrichmentGate(
  candidate: EnrichmentCandidate,
  request: PropertyEnrichmentRequest,
  options: EnrichmentGateOptions = {},
): EnrichmentGateDecision {
  const configuredMaximum = options.maximumPaidCostCents ?? 500;
  const minimumConfidence = options.minimumPaidConfidence ?? 0.65;
  const minimumAssignmentFee = options.minimumAssignmentFee ?? 10_000;
  const paid = request.costCents > 0 || request.sourceType === "PAID_PROVIDER";
  const averageConfidence = request.facts.reduce((total, fact) => total + fact.confidence, 0) / request.facts.length;
  const economicCostCeiling = Math.max(0, Math.floor(candidate.expectedAssignmentFee));
  const maximumApprovedCostCents = Math.min(configuredMaximum, economicCostCeiling);
  const reasonCodes: string[] = [];

  if (candidate.state === "REJECTED") reasonCodes.push("ENRICH_REJECTED_OPPORTUNITY");
  if (!paid && candidate.state !== "REJECTED") reasonCodes.push("ENRICH_FREE_RESEARCH_ALLOWED");
  if (paid && candidate.state !== "QUALIFIED") reasonCodes.push("ENRICH_PAID_REQUIRES_QUALIFIED");
  if (paid && candidate.score < 80) reasonCodes.push("ENRICH_PAID_SCORE_BELOW_80");
  if (paid && candidate.expectedAssignmentFee < minimumAssignmentFee) reasonCodes.push("ENRICH_PAID_SPREAD_BELOW_TARGET");
  if (paid && averageConfidence < minimumConfidence) reasonCodes.push("ENRICH_PAID_CONFIDENCE_TOO_LOW");
  if (paid && request.costCents > maximumApprovedCostCents) reasonCodes.push("ENRICH_PAID_COST_ABOVE_LIMIT");
  if (paid && reasonCodes.length === 0) reasonCodes.push("ENRICH_PAID_APPROVED");
  if (!paid && averageConfidence < 0.5) reasonCodes.push("ENRICH_LOW_CONFIDENCE_REVIEW");

  const blockingCodes = new Set([
    "ENRICH_REJECTED_OPPORTUNITY",
    "ENRICH_PAID_REQUIRES_QUALIFIED",
    "ENRICH_PAID_SCORE_BELOW_80",
    "ENRICH_PAID_SPREAD_BELOW_TARGET",
    "ENRICH_PAID_CONFIDENCE_TOO_LOW",
    "ENRICH_PAID_COST_ABOVE_LIMIT",
  ]);
  return {
    allowed: !reasonCodes.some((code) => blockingCodes.has(code)),
    paid,
    reasonCodes,
    averageConfidence: Number(averageConfidence.toFixed(3)),
    expectedAssignmentFee: candidate.expectedAssignmentFee,
    maximumApprovedCostCents,
  };
}
