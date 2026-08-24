import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSellerAiMinimizedInput, buildSellerAiPrompt, sellerAiOutputSchema, sellerAiResultInputSchema } from "../../src/domain/seller-intake/ai-assistance";
import type { SellerInquiry } from "../../src/domain/seller-intake/types";

const inquiry: SellerInquiry = {
  id: "00000000-0000-4000-8000-000000000701", submissionId: "00000000-0000-4000-8000-000000000701",
  submittedAt: "2026-08-23T20:00:00.000Z", name: "Private Seller", email: "private@example.com", phone: "+15555550123",
  propertyAddress: "123 Private Street", county: "PINAL", apn: "private-apn", relationship: "OWNER",
  timeline: "0_30_DAYS", motivation: "REPAIRS", condition: "MAJOR_REPAIRS", occupancy: "OWNER_OCCUPIED",
  askingPrice: 250000, mortgageBalance: 100000, notes: "Highly identifying private narrative", consentEmail: true,
  consentCall: false, consentText: false, privacyAccepted: true, status: "NEW",
  qualification: { modelVersion: "seller-intake-v1", score: 92, tier: "PRIORITY", reasonCodes: ["FAST_TIMELINE"], reviewFlags: [], eligibleForBooking: true, summary: "Strong evidence-based intake requiring operator verification." },
  deliveryStatuses: [],
};

describe("AI-assisted seller intake", () => {
  it("constructs a minimized packet without identity, contact values, address, APN, or free text", () => {
    const minimized = buildSellerAiMinimizedInput(inquiry);
    const serialized = JSON.stringify(minimized);
    expect(Object.keys(minimized).sort()).toEqual(["askingPriceProvided", "authorizedChannels", "condition", "county", "currentStatus", "mortgageBalanceProvided", "motivation", "occupancy", "qualification", "relationship", "timeline"]);
    for (const privateValue of [inquiry.name, inquiry.email, inquiry.phone, inquiry.propertyAddress, inquiry.apn, inquiry.notes]) expect(serialized).not.toContain(privateValue);
    expect(minimized.authorizedChannels).toEqual(["EMAIL"]);
    expect(minimized).not.toHaveProperty("askingPrice");
    expect(minimized).not.toHaveProperty("mortgageBalance");
  });

  it("builds an advisory prompt and strictly validates bounded output", () => {
    const prompt = buildSellerAiPrompt(buildSellerAiMinimizedInput(inquiry));
    expect(prompt).toContain("requires human review");
    expect(prompt).toContain("must not initiate outreach");
    expect(prompt).not.toContain(inquiry.email);
    const valid = { summary: "The coded evidence supports a focused operator review.", verificationQuestions: ["Does the recorded owner evidence support the stated relationship?"], riskFlags: ["OWNERSHIP_AUTHORITY"], recommendedNextStep: "VERIFY_PUBLIC_RECORDS" };
    expect(sellerAiOutputSchema.safeParse(valid).success).toBe(true);
    expect(sellerAiOutputSchema.safeParse({ ...valid, riskFlags: ["NONE", "TIMELINE"] }).success).toBe(false);
    expect(sellerAiOutputSchema.safeParse({ ...valid, contactSellerBy: "PHONE" }).success).toBe(false);
    expect(sellerAiResultInputSchema.safeParse({ packetId: inquiry.id, provider: "Authorized provider", model: "documented-model", output: valid, decision: "ACCEPTED_AS_ASSISTANCE", rationale: "I verified the output against the source evidence." }).success).toBe(true);
  });

  it("defines immutable, service-role-only persistence and PII-minimized auditing", () => {
    const migration = readFileSync("supabase/migrations/202608230007_phase2_ai_assisted_seller_intake.sql", "utf8");
    expect(migration).toContain("create table public.seller_ai_review_packets");
    expect(migration).toContain("external_transmission_by_application', false");
    expect(migration).toContain("revoke update, delete");
    expect(migration).toContain("revoke execute on function public.record_seller_ai_assistance(jsonb, jsonb) from public, anon, authenticated");
  });
});
