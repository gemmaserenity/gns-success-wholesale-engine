import { evaluateDealKillers } from "../domain/underwriting/deal-killers";
import { underwrite } from "../domain/underwriting/engine";
import { normalizeLead } from "../domain/opportunities/normalize";
import { rawLeadSchema } from "../domain/opportunities/schema";
import { scoreOpportunity } from "../domain/scoring/engine";
import type { ConfidenceLevel, NextAction, OpportunityEvaluation } from "../domain/opportunities/types";

export interface EvaluationOptions {
  now?: Date;
  seenKeys?: Set<string>;
  evaluationId?: string;
}

export function evaluateOpportunity(raw: unknown, options: EvaluationOptions = {}): OpportunityEvaluation {
  const now = options.now ?? new Date();
  const input = rawLeadSchema.parse(raw);
  const lead = normalizeLead(input, now);
  const duplicate = options.seenKeys?.has(lead.deduplicationKey) ?? false;
  options.seenKeys?.add(lead.deduplicationKey);
  const scenarios = underwrite(lead);
  const base = scenarios[1];
  if (!base) throw new Error("Base underwriting scenario was not produced");
  const reasons = evaluateDealKillers(lead, base, now);
  if (duplicate) reasons.unshift({ code: "REJECT_DUPLICATE", severity: "REJECT", message: "This county/APN already exists in the current import." });
  const score = scoreOpportunity(lead, base, now);
  const rejected = reasons.some((reason) => reason.severity === "REJECT");
  const review = reasons.some((reason) => reason.severity === "REVIEW");
  const confidence: ConfidenceLevel = lead.dataConfidence >= 0.8 && lead.ownerConfidence >= 0.8 ? "HIGH" : lead.dataConfidence >= 0.55 && lead.ownerConfidence >= 0.55 ? "MEDIUM" : "LOW";
  let nextAction: NextAction = "RESEARCH";
  if (rejected) nextAction = "REJECT";
  else if (review) nextAction = "HUMAN_REVIEW";
  else if (score.total >= 90) nextAction = "CONTACT_READY";
  else if (score.total >= 80) nextAction = "ENRICH";
  const state = rejected ? "REJECTED" : score.total >= 80 ? "QUALIFIED" : "PRELIM_SCREEN";
  return {
    evaluationId: options.evaluationId ?? crypto.randomUUID(),
    evaluatedAt: now.toISOString(),
    parserVersion: "manual-csv-v1",
    rawInput: input,
    lead,
    scenarios,
    reasons,
    score,
    state,
    confidence,
    nextAction,
    duplicate,
  };
}
