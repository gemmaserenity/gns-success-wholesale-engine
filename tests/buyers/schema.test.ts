import { describe, expect, it } from "vitest";
import { buyerProfileInputSchema } from "../../src/domain/buyers/schema";
import { validBuyerProfile } from "../fixtures/buyers";

describe("buyer profile validation", () => {
  it("accepts an evidence-backed buyer and buy box", () => {
    expect(buyerProfileInputSchema.parse(validBuyerProfile)).toMatchObject({
      displayName: "Desert Key Investments",
      reliabilityScore: 92,
      criteria: { preferredCounties: ["MARICOPA"], propertyTypes: ["SFR", "TOWNHOUSE"] },
    });
  });

  it("requires at least one buyer contact method", () => {
    expect(() => buyerProfileInputSchema.parse({ ...validBuyerProfile, email: "", phone: "" }))
      .toThrow("email or phone");
  });

  it("rejects inverted criteria ranges and ambiguous ANY occupancy", () => {
    expect(() => buyerProfileInputSchema.parse({
      ...validBuyerProfile,
      criteria: {
        ...validBuyerProfile.criteria,
        purchasePriceMin: 400000,
        purchasePriceMax: 300000,
        occupancies: ["ANY", "VACANT"],
      },
    })).toThrow();
  });

  it("keeps operational and contact do-not-contact states synchronized", () => {
    expect(() => buyerProfileInputSchema.parse({
      ...validBuyerProfile,
      status: "ACTIVE",
      contactStatus: "DO_NOT_CONTACT",
    })).toThrow("do-not-contact");
  });
});
