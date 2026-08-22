import type { NormalizedLead, OpportunityScore, UnderwritingScenario } from "../opportunities/types";

export interface ScoringWeights {
  economics: number;
  equityConfidence: number;
  distress: number;
  buyerDemand: number;
  timeline: number;
  propertyDesirability: number;
  contactability: number;
  dataConfidence: number;
}

export const defaultScoringWeights: ScoringWeights = {
  economics: 25,
  equityConfidence: 15,
  distress: 15,
  buyerDemand: 15,
  timeline: 10,
  propertyDesirability: 10,
  contactability: 5,
  dataConfidence: 5,
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

function daysUntil(date: string | undefined, now: Date): number | undefined {
  if (!date) return undefined;
  return Math.ceil((new Date(`${date}T12:00:00Z`).getTime() - now.getTime()) / 86_400_000);
}

export function scoreOpportunity(
  lead: NormalizedLead,
  base: UnderwritingScenario,
  now = new Date(),
  weights: ScoringWeights = defaultScoringWeights,
): OpportunityScore {
  const days = daysUntil(lead.trusteeSaleDate, now);
  const equityRatio = base.arv <= 0 ? 0 : base.estimatedEquity / base.arv;
  const factors = {
    economics: clamp(base.expectedAssignmentFee / 30_000),
    equityConfidence: clamp(equityRatio / 0.45) * lead.dataConfidence,
    distress: lead.trusteeSaleDate ? 1 : 0.55,
    buyerDemand: clamp((lead.buyerDemandScore ?? 60) / 100),
    timeline: days === undefined ? 0.45 : days < 7 ? 0.15 : days <= 90 ? 1 : days <= 180 ? 0.65 : 0.4,
    propertyDesirability: clamp((lead.propertyDesirabilityScore ?? 60) / 100),
    contactability: clamp((lead.contactabilityScore ?? 20) / 100),
    dataConfidence: lead.dataConfidence,
  };
  const components = Object.fromEntries(
    Object.entries(factors).map(([key, factor]) => [key, Math.round(factor * weights[key as keyof ScoringWeights] * 10) / 10]),
  );
  const total = Math.round(Object.values(components).reduce((sum, value) => sum + value, 0));
  const band = total >= 90 ? "IMMEDIATE_PRIORITY" : total >= 80 ? "HIGH_PRIORITY" : total >= 70 ? "RESEARCH_NURTURE" : "ARCHIVE";
  return { total, band, components };
}
