import { describe, expect, it } from "vitest";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { belowTarget, excellentOpportunity, highProfit, lowConfidenceSpread, noEquity, ownerMismatch, titleComplexity, urgentSale } from "../fixtures/leads";

const now = new Date("2026-08-22T12:00:00Z");

describe("opportunity decisioning", () => {
  it("qualifies a strong $10K+ opportunity", () => {
    const result = evaluateOpportunity(excellentOpportunity, { now, evaluationId: "00000000-0000-4000-8000-000000000001" });
    expect(result.state).toBe("QUALIFIED");
    expect(result.score.total).toBeGreaterThanOrEqual(80);
    expect(result.reasons.map((reason) => reason.code)).toContain("PASS_ASSIGNMENT_TARGET");
  });

  it.each([
    ["no equity", noEquity, "REJECT_LOW_EQUITY"],
    ["below assignment target", belowTarget, "REJECT_ASSIGNMENT_BELOW_TARGET"],
    ["owner mismatch", ownerMismatch, "REJECT_OWNER_MISMATCH"],
    ["urgent sale", urgentSale, "REJECT_TIMELINE_TOO_SHORT"],
  ])("rejects %s with a machine-readable reason", (_name, input, code) => {
    const result = evaluateOpportunity(input, { now });
    expect(result.state).toBe("REJECTED");
    expect(result.reasons.map((reason) => reason.code)).toContain(code);
  });

  it.each([
    ["low confidence", lowConfidenceSpread, "REVIEW_DATA_CONFIDENCE"],
    ["title complexity", titleComplexity, "REVIEW_TITLE_COMPLEXITY"],
  ])("routes %s to human review without losing strong economics", (_name, input, code) => {
    const result = evaluateOpportunity(input, { now });
    expect(result.nextAction).toBe("HUMAN_REVIEW");
    expect(result.reasons.map((reason) => reason.code)).toContain(code);
  });

  it("caps scores at 100 for a high-profit opportunity", () => {
    expect(evaluateOpportunity(highProfit, { now }).score.total).toBeLessThanOrEqual(100);
  });

  it.each([
    ["fractional square footage", { ...excellentOpportunity, squareFeet: 1450.5 }],
    ["impossible construction year", { ...excellentOpportunity, yearBuilt: 1700 }],
  ])("rejects %s before normalized database persistence", (_name, input) => {
    expect(() => evaluateOpportunity(input, { now })).toThrow();
  });
});
