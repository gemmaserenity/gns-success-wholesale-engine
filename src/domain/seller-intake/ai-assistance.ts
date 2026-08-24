import { z } from "zod";
import type { SellerInquiry } from "./types";

export const sellerAiRiskFlags = [
  "OWNERSHIP_AUTHORITY", "TIMELINE", "PROPERTY_CONDITION", "OCCUPANCY",
  "FINANCIAL_EXPECTATIONS", "TITLE_OR_LIEN", "CONTACT_PERMISSION", "MISSING_EVIDENCE", "NONE",
] as const;
export const sellerAiNextSteps = ["VERIFY_PUBLIC_RECORDS", "REQUEST_CLARIFICATION", "PREPARE_OPERATOR_REVIEW", "NURTURE", "DECLINE_REVIEW"] as const;
export const sellerAiReviewDecisions = ["ACCEPTED_AS_ASSISTANCE", "REJECTED", "NEEDS_REVISION"] as const;

export const sellerAiOutputSchema = z.object({
  summary: z.string().trim().min(20).max(1_000),
  verificationQuestions: z.array(z.string().trim().min(10).max(300)).min(1).max(6),
  riskFlags: z.array(z.enum(sellerAiRiskFlags)).min(1).max(8),
  recommendedNextStep: z.enum(sellerAiNextSteps),
}).strict().superRefine((output, context) => {
  if (output.riskFlags.includes("NONE") && output.riskFlags.length !== 1) {
    context.addIssue({ code: "custom", path: ["riskFlags"], message: "NONE cannot be combined with another risk flag." });
  }
});

export const sellerAiResultInputSchema = z.object({
  packetId: z.string().uuid(),
  provider: z.string().trim().min(2).max(120),
  model: z.string().trim().min(1).max(160),
  output: sellerAiOutputSchema,
  decision: z.enum(sellerAiReviewDecisions),
  rationale: z.string().trim().min(20).max(1_000),
}).strict();

export interface SellerAiMinimizedInput {
  county: SellerInquiry["county"];
  relationship: SellerInquiry["relationship"];
  timeline: SellerInquiry["timeline"];
  motivation: SellerInquiry["motivation"];
  condition: SellerInquiry["condition"];
  occupancy: SellerInquiry["occupancy"];
  askingPriceProvided: boolean;
  mortgageBalanceProvided: boolean;
  currentStatus: SellerInquiry["status"];
  authorizedChannels: Array<"EMAIL" | "CALL" | "TEXT">;
  qualification: SellerInquiry["qualification"];
}

export function buildSellerAiMinimizedInput(inquiry: SellerInquiry): SellerAiMinimizedInput {
  return {
    county: inquiry.county,
    relationship: inquiry.relationship,
    timeline: inquiry.timeline,
    motivation: inquiry.motivation,
    condition: inquiry.condition,
    occupancy: inquiry.occupancy,
    askingPriceProvided: inquiry.askingPrice !== undefined,
    mortgageBalanceProvided: inquiry.mortgageBalance !== undefined,
    currentStatus: inquiry.status,
    authorizedChannels: [inquiry.consentEmail ? "EMAIL" : undefined, inquiry.consentCall ? "CALL" : undefined, inquiry.consentText ? "TEXT" : undefined].filter((value): value is "EMAIL" | "CALL" | "TEXT" => value !== undefined),
    qualification: inquiry.qualification,
  };
}

export function buildSellerAiPrompt(input: SellerAiMinimizedInput): string {
  return [
    "You are assisting a human real-estate acquisitions operator with evidence review.",
    "Use only the supplied minimized facts. Do not infer identity, contact details, consent, value, title condition, legal conclusions, or an offer.",
    "Return JSON only with: summary, verificationQuestions (1-6), riskFlags, and recommendedNextStep.",
    `Allowed riskFlags: ${sellerAiRiskFlags.join(", ")}.`,
    `Allowed recommendedNextStep values: ${sellerAiNextSteps.join(", ")}.`,
    "The result is advisory, requires human review, and must not initiate outreach or change the inquiry record.",
    `MINIMIZED_INPUT=${JSON.stringify(input)}`,
  ].join("\n");
}
