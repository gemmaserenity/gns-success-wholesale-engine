import { z } from "zod";
import {
  buyerContactStatuses,
  buyerFinancingTypes,
  buyerOccupancies,
  buyerPropertyTypes,
  buyerStatuses,
  hoaPreferences,
} from "./types";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().or(z.literal(""));
const optionalMoney = z.number().finite().nonnegative().optional();
const optionalInteger = z.number().int().nonnegative().optional();

export const buyerCriteriaSchema = z.object({
  preferredCounties: z.array(z.enum(["MARICOPA", "PINAL"])).min(1).max(2),
  preferredZips: z.array(z.string().regex(/^\d{5}$/, "ZIP codes must contain five digits")).max(100),
  propertyTypes: z.array(z.enum(buyerPropertyTypes)).min(1).max(buyerPropertyTypes.length),
  purchasePriceMin: optionalMoney,
  purchasePriceMax: optionalMoney,
  arvMin: optionalMoney,
  arvMax: optionalMoney,
  maxRepairs: optionalMoney,
  squareFeetMin: optionalInteger,
  squareFeetMax: optionalInteger,
  yearBuiltMin: z.number().int().min(1800).max(2200).optional(),
  yearBuiltMax: z.number().int().min(1800).max(2200).optional(),
  hoaPreference: z.enum(hoaPreferences),
  occupancies: z.array(z.enum(buyerOccupancies)).min(1).max(buyerOccupancies.length),
  closeSpeedDays: z.number().int().min(1).max(180).optional(),
  financing: z.array(z.enum(buyerFinancingTypes)).min(1).max(buyerFinancingTypes.length),
}).superRefine((criteria, ctx) => {
  for (const [low, high] of [
    ["purchasePriceMin", "purchasePriceMax"],
    ["arvMin", "arvMax"],
    ["squareFeetMin", "squareFeetMax"],
    ["yearBuiltMin", "yearBuiltMax"],
  ] as const) {
    if (criteria[low] !== undefined && criteria[high] !== undefined && criteria[low] > criteria[high]) {
      ctx.addIssue({ code: "custom", path: [high], message: `${high} must be greater than or equal to ${low}` });
    }
  }
  if (criteria.occupancies.includes("ANY") && criteria.occupancies.length > 1) {
    ctx.addIssue({ code: "custom", path: ["occupancies"], message: "ANY occupancy cannot be combined with another occupancy" });
  }
});

export const buyerProfileInputSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().trim().min(2).max(160),
  companyName: optionalText(160),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: optionalText(40),
  status: z.enum(buyerStatuses),
  contactStatus: z.enum(buyerContactStatuses),
  source: z.string().trim().min(2).max(120),
  sourceUrl: z.string().url().max(2048).optional().or(z.literal("")),
  notes: optionalText(2_000),
  verifiedPurchaseCount: z.number().int().nonnegative().max(100_000),
  gnsClosingCount: z.number().int().nonnegative().max(100_000),
  retradeCount: z.number().int().nonnegative().max(100_000),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
  criteria: buyerCriteriaSchema,
}).superRefine((buyer, ctx) => {
  if (!buyer.email && !buyer.phone) {
    ctx.addIssue({ code: "custom", path: ["email"], message: "A buyer email or phone number is required" });
  }
  if (buyer.contactStatus === "DO_NOT_CONTACT" && buyer.status !== "DO_NOT_CONTACT") {
    ctx.addIssue({ code: "custom", path: ["status"], message: "A do-not-contact buyer must also use DO_NOT_CONTACT status" });
  }
  if (buyer.status === "DO_NOT_CONTACT" && buyer.contactStatus !== "DO_NOT_CONTACT") {
    ctx.addIssue({ code: "custom", path: ["contactStatus"], message: "DO_NOT_CONTACT status requires a matching contact status" });
  }
});

export const buyerProfileSchema = z.intersection(
  buyerProfileInputSchema,
  z.object({
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  }),
);
