import type { SkipTraceCandidate, SkipTraceCaseRequest, SkipTraceGateDecision } from "./types";

export interface SkipTraceGateOptions {
  maximumCostCents?: number;
  minimumScore?: number;
  minimumAssignmentFee?: number;
  minimumOwnerConfidence?: number;
  suppressed?: boolean;
}

export function evaluateSkipTraceGate(
  candidate: SkipTraceCandidate,
  request: SkipTraceCaseRequest,
  options: SkipTraceGateOptions = {},
): SkipTraceGateDecision {
  const configuredMaximum = options.maximumCostCents ?? 1_000;
  const minimumScore = options.minimumScore ?? 80;
  const minimumAssignmentFee = options.minimumAssignmentFee ?? 10_000;
  const minimumOwnerConfidence = options.minimumOwnerConfidence ?? 0.65;
  const economicCostCeiling = Math.max(0, Math.floor(candidate.expectedAssignmentFee));
  const maximumApprovedCostCents = Math.min(configuredMaximum, economicCostCeiling);
  const reasonCodes: string[] = [];

  if (candidate.state !== "QUALIFIED") reasonCodes.push("SKIP_TRACE_REQUIRES_QUALIFIED");
  if (candidate.score < minimumScore) reasonCodes.push("SKIP_TRACE_SCORE_BELOW_80");
  if (candidate.expectedAssignmentFee < minimumAssignmentFee) reasonCodes.push("SKIP_TRACE_SPREAD_BELOW_TARGET");
  if (candidate.ownerConfidence < minimumOwnerConfidence) reasonCodes.push("SKIP_TRACE_OWNER_CONFIDENCE_TOO_LOW");
  if (request.estimatedCostCents > maximumApprovedCostCents) reasonCodes.push("SKIP_TRACE_COST_ABOVE_LIMIT");
  if (!request.publicRecordsReviewed) reasonCodes.push("SKIP_TRACE_PUBLIC_RECORD_REVIEW_REQUIRED");
  if (!request.contactStandingReviewed) reasonCodes.push("SKIP_TRACE_CONTACT_STANDING_REVIEW_REQUIRED");
  if (options.suppressed) reasonCodes.push("SKIP_TRACE_DO_NOT_CONTACT_SUPPRESSION");
  if (reasonCodes.length === 0) reasonCodes.push("SKIP_TRACE_RESEARCH_APPROVED");

  return {
    allowed: reasonCodes.length === 1 && reasonCodes[0] === "SKIP_TRACE_RESEARCH_APPROVED",
    reasonCodes,
    expectedAssignmentFee: candidate.expectedAssignmentFee,
    ownerConfidence: candidate.ownerConfidence,
    maximumApprovedCostCents,
    externalTransmissionAllowed: false,
  };
}
