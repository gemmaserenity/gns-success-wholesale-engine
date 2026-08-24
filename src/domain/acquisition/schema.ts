import { z } from "zod";
import { acquisitionDecisions, ownerIdentityStatuses, sellerAuthorityStatuses } from "./types";

const optionalMoney = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().finite().nonnegative().max(100_000_000).optional(),
);
const requiredMoney = z.preprocess(
  (value) => typeof value === "number" ? value : Number(value),
  z.number().finite().nonnegative().max(100_000_000),
);
const confidence = z.preprocess(
  (value) => typeof value === "number" ? value : Number(value),
  z.number().min(0).max(1),
);

export const acquisitionResearchInputSchema = z.object({
  inquiryId: z.string().uuid(),
  sourceName: z.string().trim().min(3).max(160),
  sourceType: z.enum(["PUBLIC_RECORD", "HUMAN_VERIFIED"]),
  sourceUrl: z.string().url().max(2_048),
  retrievedAt: z.string().datetime({ offset: true }),
  county: z.enum(["MARICOPA", "PINAL"]),
  apn: z.string().trim().min(3).max(40),
  address: z.string().trim().min(5).max(240),
  ownerName: z.string().trim().min(2).max(240),
  ownerIdentityStatus: z.enum(ownerIdentityStatuses),
  sellerAuthorityStatus: z.enum(sellerAuthorityStatuses),
  propertyIdentityVerified: z.literal(true),
  verificationNotes: z.string().trim().min(20).max(2_000),
  researchCostCents: z.literal(0),
  trusteeSaleDate: z.string().date().optional().or(z.literal("")).transform((value) => value || undefined),
  recordedDate: z.string().date().optional().or(z.literal("")).transform((value) => value || undefined),
  propertyType: z.string().trim().max(80).optional().transform((value) => value || undefined),
  squareFeet: z.preprocess((value) => value === "" || value === undefined ? undefined : Number(value), z.number().int().positive().optional()),
  yearBuilt: z.preprocess((value) => value === "" || value === undefined ? undefined : Number(value), z.number().int().min(1800).max(2200).optional()),
  occupancy: z.string().trim().max(80).optional().transform((value) => value || undefined),
  arvLow: requiredMoney,
  arvHigh: requiredMoney,
  repairsLow: requiredMoney,
  repairsHigh: requiredMoney,
  debtLow: requiredMoney,
  debtHigh: requiredMoney,
  liens: optionalMoney,
  workingContractPrice: optionalMoney,
  ownerConfidence: confidence,
  dataConfidence: confidence,
  titleComplexity: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  for (const [low, high] of [["arvLow", "arvHigh"], ["repairsLow", "repairsHigh"], ["debtLow", "debtHigh"]] as const) {
    if (value[low] > value[high]) context.addIssue({ code: "custom", path: [high], message: `${high} must be at least ${low}` });
  }
  if (value.ownerIdentityStatus === "MATCHED" && value.ownerConfidence < 0.65) {
    context.addIssue({ code: "custom", path: ["ownerConfidence"], message: "A matched owner requires at least 65% confidence." });
  }
});

export const acquisitionDecisionInputSchema = z.object({
  caseId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  sourceEvaluationId: z.string().uuid(),
  buyerMatchRunId: z.string().uuid().optional(),
  decision: z.enum(acquisitionDecisions),
  rationale: z.string().trim().min(20).max(2_000),
  materialFactsReviewed: z.boolean(),
  consentBoundaryReviewed: z.boolean(),
  noOfferAuthorized: z.literal(true),
}).strict();
