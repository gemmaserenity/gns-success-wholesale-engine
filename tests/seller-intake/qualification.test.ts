import { describe, expect, it } from "vitest";
import { qualifySellerIntake } from "../../src/domain/seller-intake/qualification";
import type { SellerIntakeInput } from "../../src/domain/seller-intake/types";

const intake: SellerIntakeInput = {
  submissionId: "67b644f2-a066-4390-b1fa-703966020250",
  startedAt: "2026-08-23T18:00:00.000Z",
  name: "Jordan Seller",
  email: "jordan@example.com",
  propertyAddress: "123 Main Street, Phoenix, AZ 85001",
  county: "MARICOPA",
  relationship: "OWNER",
  timeline: "0_30_DAYS",
  motivation: "REPAIRS",
  condition: "MAJOR_REPAIRS",
  occupancy: "VACANT",
  askingPrice: 200000,
  mortgageBalance: 100000,
  consentEmail: true,
  consentCall: false,
  consentText: false,
  privacyAccepted: true,
};

describe("seller intake qualification", () => {
  it("prioritizes a strong in-market inbound inquiry", () => {
    const result = qualifySellerIntake(intake);
    expect(result.tier).toBe("PRIORITY");
    expect(result.eligibleForBooking).toBe(true);
    expect(result.modelVersion).toBe("seller-intake-v1");
  });

  it("makes outside-Arizona inquiries ineligible", () => {
    const result = qualifySellerIntake({ ...intake, county: "OUTSIDE_ARIZONA" });
    expect(result.tier).toBe("INELIGIBLE");
    expect(result.eligibleForBooking).toBe(false);
  });

  it("flags representative authority for human verification", () => {
    const result = qualifySellerIntake({ ...intake, relationship: "AUTHORIZED_REPRESENTATIVE" });
    expect(result.reviewFlags).toContain("REPRESENTATIVE_AUTHORITY_REQUIRES_VERIFICATION");
  });
});
