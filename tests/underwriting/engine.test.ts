import { describe, expect, it } from "vitest";
import { normalizeLead } from "../../src/domain/opportunities/normalize";
import { defaultUnderwritingConfig, underwrite } from "../../src/domain/underwriting/engine";
import { excellentOpportunity } from "../fixtures/leads";

describe("underwriting engine", () => {
  it("calculates three transparent scenarios and the maximum contract", () => {
    const scenarios = underwrite(normalizeLead(excellentOpportunity, new Date("2026-08-22T12:00:00Z")));
    expect(scenarios.map((item) => item.name)).toEqual(["DOWNSIDE", "BASE", "UPSIDE"]);
    const base = scenarios[1];
    expect(base?.investorPurchaseCeiling).toBe(275_300);
    expect(base?.maximumContractForTargetFee).toBe(265_300);
    expect(base?.expectedAssignmentFee).toBe(70_300);
  });

  it("uses configurable factors instead of a hard-coded 70 percent rule", () => {
    const [downside] = underwrite(normalizeLead(excellentOpportunity), { ...defaultUnderwritingConfig, investorPurchaseFactor: 0.65 });
    expect(downside?.investorPurchaseCeiling).toBe(201_500);
  });
});
