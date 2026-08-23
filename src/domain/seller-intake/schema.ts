import { z } from "zod";
import {
  propertyConditions,
  sellerInquiryStatuses,
  sellerMotivations,
  sellerOccupancies,
  sellerRelationships,
  sellerTimelines,
} from "./types";

const optionalTrimmed = (maximum: number) => z.string().trim().max(maximum).optional().transform((value) => value || undefined);

export const sellerIntakeSchema = z.object({
  submissionId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(160),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional().transform((value) => value || undefined),
  phone: z.union([z.string().trim().min(7).max(40), z.literal("")]).optional().transform((value) => value || undefined),
  propertyAddress: z.string().trim().min(8).max(300),
  county: z.enum(["MARICOPA", "PINAL", "OTHER_ARIZONA", "OUTSIDE_ARIZONA", "UNKNOWN"]),
  apn: optionalTrimmed(80),
  relationship: z.enum(sellerRelationships),
  timeline: z.enum(sellerTimelines),
  motivation: z.enum(sellerMotivations),
  condition: z.enum(propertyConditions),
  occupancy: z.enum(sellerOccupancies),
  askingPrice: z.number().nonnegative().max(100_000_000).optional(),
  mortgageBalance: z.number().nonnegative().max(100_000_000).optional(),
  notes: optionalTrimmed(2_000),
  consentEmail: z.boolean(),
  consentCall: z.boolean(),
  consentText: z.boolean(),
  privacyAccepted: z.literal(true),
  companyWebsite: optionalTrimmed(500),
}).superRefine((input, context) => {
  if (!input.email && !input.phone) context.addIssue({ code: "custom", path: ["email"], message: "Provide an email address or phone number." });
  if (input.consentEmail && !input.email) context.addIssue({ code: "custom", path: ["consentEmail"], message: "Email permission requires an email address." });
  if ((input.consentCall || input.consentText) && !input.phone) context.addIssue({ code: "custom", path: ["consentCall"], message: "Phone permission requires a phone number." });
  if (input.companyWebsite) context.addIssue({ code: "custom", path: ["companyWebsite"], message: "Submission could not be accepted." });
});

export const sellerInquiryStatusInputSchema = z.object({
  inquiryId: z.string().uuid(),
  status: z.enum(sellerInquiryStatuses),
  rationale: z.string().trim().min(10).max(1_000),
});

