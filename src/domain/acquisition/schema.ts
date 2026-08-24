import { z } from "zod";
import { acquisitionDecisions, diligenceItemKinds, diligenceItemStatuses, offerAuthorizationDecisions, offerAuthorizationRoles, offerDraftTemplateVersions, ownerIdentityStatuses, sellerAuthorityStatuses } from "./types";

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

const diligenceItemSchema = z.object({
  kind: z.enum(diligenceItemKinds),
  status: z.enum(diligenceItemStatuses),
  sourceName: z.string().trim().min(3).max(160),
  sourceType: z.enum(["PUBLIC_RECORD", "HUMAN_VERIFIED", "PROFESSIONAL_REVIEW", "OPERATOR_REVIEW"]),
  sourceUrl: z.string().url().max(2_048).optional().or(z.literal("")).transform((value) => value || undefined),
  reviewedAt: z.string().datetime({ offset: true }),
  confidence,
  notes: z.string().trim().min(10).max(2_000),
  costCents: z.literal(0),
}).strict().superRefine((value, context) => {
  if (["PUBLIC_RECORD", "HUMAN_VERIFIED", "PROFESSIONAL_REVIEW"].includes(value.sourceType) && !value.sourceUrl) {
    context.addIssue({ code: "custom", path: ["sourceUrl"], message: "This evidence type requires an exact source URL." });
  }
});

export const acquisitionDiligenceInputSchema = z.object({
  caseId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  sourceEvaluationId: z.string().uuid(),
  buyerMatchRunId: z.string().uuid(),
  acquisitionDecisionId: z.string().uuid(),
  summary: z.string().trim().min(20).max(2_000),
  materialFactsCurrent: z.boolean(),
  noOfferGenerated: z.literal(true),
  noOutreachInitiated: z.literal(true),
  items: z.array(diligenceItemSchema).length(diligenceItemKinds.length),
}).strict().superRefine((value, context) => {
  const kinds = new Set(value.items.map((item) => item.kind));
  for (const kind of diligenceItemKinds) {
    if (!kinds.has(kind)) context.addIssue({ code: "custom", path: ["items"], message: `Missing diligence item: ${kind}` });
  }
  if (kinds.size !== value.items.length) context.addIssue({ code: "custom", path: ["items"], message: "Diligence item kinds must be unique." });
});

const offerTermLimitsSchema = z.object({
  purchasePriceCents: z.number().int().positive().max(100_000_000_00),
  assignmentFeeTargetCents: z.number().int().min(1_000_000).max(10_000_000),
  earnestMoneyCents: z.number().int().nonnegative().max(1_000_000),
  inspectionPeriodDays: z.number().int().min(1).max(30),
  closingPeriodDays: z.number().int().min(1).max(60),
}).strict();

export const offerAuthorizationInputSchema = z.object({
  caseId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  diligenceReviewId: z.string().uuid(),
  sourceEvaluationId: z.string().uuid(),
  buyerMatchRunId: z.string().uuid(),
  acquisitionDecisionId: z.string().uuid(),
  decision: z.enum(offerAuthorizationDecisions),
  authorizerRole: z.enum(offerAuthorizationRoles),
  rationale: z.string().trim().min(30).max(2_000),
  validForHours: z.union([z.literal(24), z.literal(48), z.literal(72)]).optional(),
  terms: offerTermLimitsSchema.optional(),
  materialFactsReconfirmed: z.literal(true),
  disclosureReviewed: z.literal(true),
  internalAuthorizationOnly: z.literal(true),
  noOfferGenerated: z.literal(true),
  noOutreachInitiated: z.literal(true),
}).strict().superRefine((value, context) => {
  if (value.decision === "AUTHORIZE_INTERNAL_TERMS" && (!value.terms || !value.validForHours)) {
    context.addIssue({ code: "custom", path: ["terms"], message: "Internal term authorization requires exact terms and a validity period." });
  }
  if (value.decision === "DECLINE_AUTHORIZATION" && (value.terms || value.validForHours)) {
    context.addIssue({ code: "custom", path: ["terms"], message: "A declined authorization must not contain terms or a validity period." });
  }
  if (value.terms && value.terms.closingPeriodDays < value.terms.inspectionPeriodDays) {
    context.addIssue({ code: "custom", path: ["terms", "closingPeriodDays"], message: "Closing period cannot end before the inspection period." });
  }
});

export const offerAuthorizationRevocationInputSchema = z.object({
  caseId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  reason: z.string().trim().min(20).max(1_000),
  internalAuthorizationOnly: z.literal(true),
  noOfferGenerated: z.literal(true),
  noOutreachInitiated: z.literal(true),
}).strict();

export const offerDraftInputSchema = z.object({
  caseId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  templateVersion: z.enum(offerDraftTemplateVersions),
  preparerRole: z.enum(offerAuthorizationRoles),
  preparationNotes: z.string().trim().min(30).max(2_000),
  exactAuthorizationReconfirmed: z.literal(true),
  internalDraftOnly: z.literal(true),
  legalReviewRequired: z.literal(true),
  sellerFacingApproved: z.literal(false),
  noSignatureRequested: z.literal(true),
  noDeliveryInitiated: z.literal(true),
  noOutreachInitiated: z.literal(true),
}).strict();
