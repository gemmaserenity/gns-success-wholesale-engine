import { z } from "zod";

const optionalNumber = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().finite().nonnegative().optional(),
);

const optionalPositiveInteger = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().int().positive().optional(),
);

const optionalYear = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().int().min(1800).max(2200).optional(),
);

const requiredNumber = z.preprocess(
  (value) => typeof value === "number" ? value : Number(value),
  z.number().finite().nonnegative(),
);

const confidence = z.preprocess(
  (value) => typeof value === "number" ? value : Number(value),
  z.number().min(0).max(1),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1"].includes(String(value).trim().toLowerCase());
}, z.boolean().optional());

export const rawLeadSchema = z.object({
  source: z.string().trim().min(1).max(120),
  sourceRecordId: z.string().trim().max(160).optional(),
  sourceUrl: z.string().url().max(2048).optional().or(z.literal("")),
  retrievedAt: z.string().datetime({ offset: true }).optional(),
  county: z.string().trim().min(1),
  apn: z.string().trim().min(3).max(40),
  address: z.string().trim().min(5).max(240),
  ownerName: z.string().trim().min(2).max(240),
  trusteeSaleDate: z.string().date().optional().or(z.literal("")),
  recordedDate: z.string().date().optional().or(z.literal("")),
  propertyType: z.string().trim().max(80).optional(),
  squareFeet: optionalPositiveInteger,
  yearBuilt: optionalYear,
  arvLow: requiredNumber,
  arvHigh: requiredNumber,
  repairsLow: requiredNumber,
  repairsHigh: requiredNumber,
  debtLow: requiredNumber,
  debtHigh: requiredNumber,
  liens: optionalNumber,
  proposedContractPrice: optionalNumber,
  ownerConfidence: confidence,
  dataConfidence: confidence,
  buyerDemandScore: optionalNumber,
  propertyDesirabilityScore: optionalNumber,
  contactabilityScore: optionalNumber,
  titleComplexity: optionalBoolean,
  ownerMismatch: optionalBoolean,
}).superRefine((value, ctx) => {
  for (const [low, high] of [["arvLow", "arvHigh"], ["repairsLow", "repairsHigh"], ["debtLow", "debtHigh"]] as const) {
    if (value[low] > value[high]) ctx.addIssue({ code: "custom", path: [high], message: `${high} must be greater than or equal to ${low}` });
  }
});

export type ValidatedRawLead = z.infer<typeof rawLeadSchema>;
