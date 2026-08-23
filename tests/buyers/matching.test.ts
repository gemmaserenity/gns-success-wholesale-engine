import { describe, expect, it } from "vitest";
import {
  analyzeBuyerDemand,
  buildBuyerDemandEvaluation,
  buildBuyerMatchProperty,
  matchBuyer,
  normalizeBuyerPropertyType,
} from "../../src/domain/buyers/matching";
import type { BuyerProfile } from "../../src/domain/buyers/types";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { validBuyerProfile } from "../fixtures/buyers";
import { excellentOpportunity } from "../fixtures/leads";

const now = new Date("2026-08-22T12:00:00Z");
const buyer: BuyerProfile = {
  ...validBuyerProfile,
  id: "00000000-0000-4000-8000-000000000301",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

const property = buildBuyerMatchProperty({
  rawInput: { ...excellentOpportunity, propertyType: "Single Family Residence", squareFeet: 1_500, yearBuilt: 2000 },
  propertyFacts: [
    { field: "occupancy", value: "Vacant" },
    { field: "hoaStatus", value: false },
  ],
  now,
});

describe("buyer-demand matching", () => {
  it("normalizes supported public-record property labels", () => {
    expect(normalizeBuyerPropertyType("Single Family Residence")).toBe("SFR");
    expect(normalizeBuyerPropertyType("manufactured home")).toBe("MOBILE_HOME");
    expect(normalizeBuyerPropertyType("office")).toBeUndefined();
  });

  it("classifies a complete, credible buy-box fit as probable", () => {
    const result = matchBuyer(property, buyer);
    expect(result).toMatchObject({ classification: "PROBABLE", fitScore: 100, credibilityScore: 87 });
    expect(result.reasonCodes).toContain("MATCH_PROBABLE");
  });

  it("excludes a buyer when a hard criterion mismatches", () => {
    const result = matchBuyer({ ...property, buyerAcquisitionPrice: 500_000 }, buyer);
    expect(result.classification).toBe("EXCLUDED");
    expect(result.reasonCodes).toContain("MISMATCH_PURCHASE_PRICE");
  });

  it("keeps missing constrained property evidence visible as a possible match", () => {
    const result = matchBuyer({
      county: "MARICOPA",
      zip: "85041",
      buyerAcquisitionPrice: 215_000,
      arv: 410_000,
      repairs: 32_500,
      daysToDeadline: 90,
    }, buyer);
    expect(result.classification).toBe("POSSIBLE");
    expect(result.reasonCodes).toContain("UNKNOWN_PROPERTY_TYPE");
    expect(result.reasonCodes).toContain("UNKNOWN_OCCUPANCY");
  });

  it("does not count unverified contacts as probable demand", () => {
    const result = matchBuyer(property, { ...buyer, contactStatus: "UNVERIFIED" });
    expect(result.classification).toBe("INELIGIBLE");
    expect(result.credibilityScore).toBe(0);
  });

  it("calculates demand from probable breadth and quality only", () => {
    const analysis = analyzeBuyerDemand(property, [buyer]);
    expect(analysis).toMatchObject({
      buyerDemandScore: 55,
      probableBuyerCount: 1,
      possibleBuyerCount: 0,
      eligibleBuyerCount: 1,
      reasonCodes: ["PROBABLE_BUYERS_FOUND"],
    });
  });

  it("creates a new immutable evaluation with modeled demand and explanation", () => {
    const analysis = analyzeBuyerDemand(property, [buyer]);
    const revised = buildBuyerDemandEvaluation(
      excellentOpportunity,
      analysis,
      "00000000-0000-4000-8000-000000000401",
      now,
      (raw, evaluationId) => evaluateOpportunity(raw, { now, evaluationId }),
      "00000000-0000-4000-8000-000000000402",
    );
    expect(revised.evaluationId).toBe("00000000-0000-4000-8000-000000000402");
    expect(revised.rawInput.buyerDemandScore).toBe(55);
    expect(revised.parserVersion).toBe("buyer-demand-v1");
    expect(revised.reasons.map((reason) => reason.code)).toContain("PASS_BUYER_DEMAND_SUPPORTED");
  });
});
