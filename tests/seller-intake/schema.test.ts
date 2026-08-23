import { describe, expect, it } from "vitest";
import { sellerIntakeSchema } from "../../src/domain/seller-intake/schema";

const valid = {
  submissionId: "67b644f2-a066-4390-b1fa-703966020250",
  startedAt: "2026-08-23T18:00:00.000Z",
  name: "Jordan Seller",
  email: "jordan@example.com",
  phone: "",
  propertyAddress: "123 Main Street, Phoenix, AZ 85001",
  county: "MARICOPA",
  relationship: "OWNER",
  timeline: "0_30_DAYS",
  motivation: "REPAIRS",
  condition: "MAJOR_REPAIRS",
  occupancy: "VACANT",
  consentEmail: true,
  consentCall: false,
  consentText: false,
  privacyAccepted: true,
};

describe("seller intake schema", () => {
  it("accepts a consented email-only inquiry", () => {
    expect(sellerIntakeSchema.parse(valid).email).toBe("jordan@example.com");
  });

  it("requires a reachable channel", () => {
    expect(() => sellerIntakeSchema.parse({ ...valid, email: "", phone: "", consentEmail: false })).toThrow();
  });

  it("does not infer email permission from an address", () => {
    const parsed = sellerIntakeSchema.parse({ ...valid, consentEmail: false });
    expect(parsed.consentEmail).toBe(false);
  });

  it("rejects the honeypot field", () => {
    expect(() => sellerIntakeSchema.parse({ ...valid, companyWebsite: "https://spam.example" })).toThrow();
  });
});
