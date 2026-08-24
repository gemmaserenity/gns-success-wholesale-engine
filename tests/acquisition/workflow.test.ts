import { describe, expect, it } from "vitest";
import { acquisitionResearchInputSchema, acquisitionDecisionInputSchema, acquisitionDiligenceInputSchema, offerAuthorizationInputSchema, offerDraftInputSchema } from "../../src/domain/acquisition/schema";
import { assessAcquisitionDiligence, buildSellerAcquisitionLead, evaluateAcquisitionDecisionGate, evaluateDiligenceEntryGate, evaluateOfferAuthorizationGate, evaluateOfferDraftGate } from "../../src/domain/acquisition/workflow";
import { diligenceItemKinds } from "../../src/domain/acquisition/types";
import type { AcquisitionCaseStatus, AcquisitionDiligenceInput, AcquisitionDiligenceStatus, AcquisitionResearchInput, OfferAuthorizationInput, OfferAuthorizationStatusRecord, OfferDraftInput } from "../../src/domain/acquisition/types";
import type { SellerInquiry } from "../../src/domain/seller-intake/types";

const inquiry: SellerInquiry = {
  id: "00000000-0000-4000-8000-000000000801", submissionId: "00000000-0000-4000-8000-000000000801",
  submittedAt: "2026-08-24T01:00:00.000Z", name: "Seller Example", propertyAddress: "123 Main Street",
  county: "PINAL", relationship: "OWNER", timeline: "0_30_DAYS", motivation: "REPAIRS", condition: "MAJOR_REPAIRS",
  occupancy: "OWNER_OCCUPIED", consentEmail: false, consentCall: false, consentText: false, privacyAccepted: true,
  status: "NEW", qualification: { modelVersion: "seller-intake-v1", score: 90, tier: "PRIORITY", reasonCodes: [], reviewFlags: [], eligibleForBooking: true, summary: "Priority intake requiring verified public-record research." }, deliveryStatuses: [],
};

const research: AcquisitionResearchInput = {
  inquiryId: inquiry.id, sourceName: "Pinal County Assessor", sourceType: "PUBLIC_RECORD",
  sourceUrl: "https://app1.pinal.gov/example", retrievedAt: "2026-08-24T02:00:00.000Z",
  county: "PINAL", apn: "123-45-678", address: "123 Main Street", ownerName: "Seller Example",
  ownerIdentityStatus: "MATCHED", sellerAuthorityStatus: "VERIFIED", propertyIdentityVerified: true,
  verificationNotes: "The assessor parcel and recorded owner were reviewed and matched to the inquiry.", researchCostCents: 0,
  arvLow: 250000, arvHigh: 280000, repairsLow: 25000, repairsHigh: 40000, debtLow: 90000, debtHigh: 100000,
  ownerConfidence: 0.9, dataConfidence: 0.8,
};

const status: AcquisitionCaseStatus = {
  caseId: "00000000-0000-4000-8000-000000000802", inquiryId: inquiry.id,
  propertyId: "00000000-0000-4000-8000-000000000803", openedAt: "2026-08-24T02:00:00.000Z",
  verification: { verificationId: "00000000-0000-4000-8000-000000000804", evaluationId: "00000000-0000-4000-8000-000000000805", sourceName: research.sourceName, sourceType: research.sourceType, sourceUrl: research.sourceUrl, retrievedAt: research.retrievedAt, propertyIdentityVerified: true, ownerIdentityStatus: "MATCHED", sellerAuthorityStatus: "VERIFIED", researchCostCents: 0, verificationNotes: research.verificationNotes },
  evaluation: { evaluationId: "00000000-0000-4000-8000-000000000806", state: "QUALIFIED", score: 91, confidence: "HIGH", nextAction: "CONTACT_READY", evaluatedAt: "2026-08-24T02:00:00.000Z", baseUnderwriting: { name: "BASE", arv: 265000, repairs: 32500, estimatedDebt: 95000, investorPurchaseCeiling: 162200, estimatedContractPrice: 100000, maximumContractForTargetFee: 152200, expectedAssignmentFee: 62200, estimatedEquity: 170000 } },
  buyerDemand: { runId: "00000000-0000-4000-8000-000000000807", sourceEvaluationId: "00000000-0000-4000-8000-000000000805", revisedEvaluationId: "00000000-0000-4000-8000-000000000806", buyerDemandScore: 82, probableBuyerCount: 2, possibleBuyerCount: 1, analyzedAt: "2026-08-24T02:05:00.000Z" },
};

const advancedStatus: AcquisitionCaseStatus = {
  ...status,
  decision: { decisionId: "00000000-0000-4000-8000-000000000808", decision: "ADVANCE_TO_ACQUISITION_REVIEW", sourceEvaluationId: status.evaluation.evaluationId, buyerMatchRunId: status.buyerDemand?.runId, rationale: "Verified evidence supports moving into a controlled diligence review.", decidedAt: "2026-08-24T02:10:00.000Z" },
};

const diligenceInput: AcquisitionDiligenceInput = {
  caseId: status.caseId, inquiryId: status.inquiryId, sourceEvaluationId: status.evaluation.evaluationId,
  buyerMatchRunId: status.buyerDemand?.runId ?? "", acquisitionDecisionId: advancedStatus.decision?.decisionId ?? "",
  summary: "All required diligence items were reviewed against current zero-cost evidence.",
  materialFactsCurrent: true, noOfferGenerated: true, noOutreachInitiated: true,
  items: diligenceItemKinds.map((kind) => ({ kind, status: "SATISFIED", sourceName: "Operator review", sourceType: "OPERATOR_REVIEW", reviewedAt: "2026-08-24T03:00:00.000Z", confidence: 0.9, notes: `Current evidence was reviewed for ${kind}.`, costCents: 0 })),
};

const diligenceStatus: AcquisitionDiligenceStatus = {
  ...assessAcquisitionDiligence(diligenceInput), reviewId: "00000000-0000-4000-8000-000000000809",
  caseId: diligenceInput.caseId, sourceEvaluationId: diligenceInput.sourceEvaluationId,
  buyerMatchRunId: diligenceInput.buyerMatchRunId, acquisitionDecisionId: diligenceInput.acquisitionDecisionId,
  summary: diligenceInput.summary, materialFactsCurrent: true, reviewedAt: "2026-08-24T03:00:00.000Z", items: diligenceInput.items,
};

const offerAuthorizationInput: OfferAuthorizationInput = {
  caseId: status.caseId, inquiryId: status.inquiryId, diligenceReviewId: diligenceStatus.reviewId,
  sourceEvaluationId: status.evaluation.evaluationId, buyerMatchRunId: status.buyerDemand?.runId ?? "",
  acquisitionDecisionId: advancedStatus.decision?.decisionId ?? "", decision: "AUTHORIZE_INTERNAL_TERMS",
  authorizerRole: "ACQUISITIONS_MANAGER", rationale: "Current diligence and bounded economics support this internal authorization decision.",
  validForHours: 24, terms: { purchasePriceCents: 14_000_000, assignmentFeeTargetCents: 1_000_000, earnestMoneyCents: 100_000, inspectionPeriodDays: 10, closingPeriodDays: 21 },
  materialFactsReconfirmed: true, disclosureReviewed: true, internalAuthorizationOnly: true,
  noOfferGenerated: true, noOutreachInitiated: true,
};

const offerAuthorizationStatus: OfferAuthorizationStatusRecord = {
  authorizationId: "00000000-0000-4000-8000-000000000810", caseId: status.caseId,
  diligenceReviewId: diligenceStatus.reviewId, sourceEvaluationId: status.evaluation.evaluationId,
  buyerMatchRunId: status.buyerDemand?.runId ?? "", acquisitionDecisionId: advancedStatus.decision?.decisionId ?? "",
  decision: "AUTHORIZE_INTERNAL_TERMS", effectiveStatus: "AUTHORIZED", authorizerFingerprint: "a".repeat(64),
  authorizerRole: "PRINCIPAL", rationale: "Current evidence supports controlled internal draft preparation.",
  terms: offerAuthorizationInput.terms!, authorizedAt: "2026-08-24T03:15:00.000Z", expiresAt: "2026-08-25T03:15:00.000Z",
};

const offerDraftInput: OfferDraftInput = {
  caseId: status.caseId, inquiryId: status.inquiryId, authorizationId: offerAuthorizationStatus.authorizationId,
  templateVersion: "internal-offer-terms-v1", preparerRole: "ACQUISITIONS_MANAGER",
  preparationNotes: "Prepared for internal legal and compliance review against the exact current authorization.",
  exactAuthorizationReconfirmed: true, internalDraftOnly: true, legalReviewRequired: true,
  sellerFacingApproved: false, noSignatureRequested: true, noDeliveryInitiated: true, noOutreachInitiated: true,
};

describe("seller acquisition workflow", () => {
  it("builds underwriting input with inquiry provenance and no external-provider action", () => {
    const lead = buildSellerAcquisitionLead(inquiry, research);
    expect(lead).toMatchObject({ source: "SELLER_INQUIRY_RESEARCH", sourceRecordId: inquiry.id, county: "PINAL", ownerMismatch: false, arvLow: 250000 });
    expect(lead).not.toHaveProperty("email");
    expect(lead).not.toHaveProperty("phone");
  });

  it("restricts the first milestone to zero-cost evidence", () => {
    expect(acquisitionResearchInputSchema.safeParse({ ...research, researchCostCents: 1 }).success).toBe(false);
    expect(acquisitionResearchInputSchema.safeParse({ ...research, sourceType: "PAID_PROVIDER" }).success).toBe(false);
  });

  it("allows advance only with current buyer evidence and all human controls", () => {
    const input = acquisitionDecisionInputSchema.parse({ caseId: status.caseId, inquiryId: status.inquiryId, sourceEvaluationId: status.evaluation.evaluationId, buyerMatchRunId: status.buyerDemand?.runId, decision: "ADVANCE_TO_ACQUISITION_REVIEW", rationale: "All material evidence was reviewed and supports further human acquisition review.", materialFactsReviewed: true, consentBoundaryReviewed: true, noOfferAuthorized: true });
    expect(evaluateAcquisitionDecisionGate(status, input)).toEqual({ allowed: true, reasonCodes: ["HUMAN_DECISION_READY"] });
    expect(evaluateAcquisitionDecisionGate({ ...status, buyerDemand: undefined }, { ...input, buyerMatchRunId: undefined })).toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["BUYER_DEMAND_REQUIRED"]) });
  });

  it("permits a human hold without pretending missing buyer evidence exists", () => {
    const input = acquisitionDecisionInputSchema.parse({ caseId: status.caseId, inquiryId: status.inquiryId, sourceEvaluationId: status.evaluation.evaluationId, decision: "HOLD_FOR_RESEARCH", rationale: "Additional title evidence is required before this inquiry can advance.", materialFactsReviewed: false, consentBoundaryReviewed: false, noOfferAuthorized: true });
    expect(evaluateAcquisitionDecisionGate({ ...status, buyerDemand: undefined }, input).allowed).toBe(true);
  });

  it("requires every zero-cost diligence item exactly once", () => {
    expect(acquisitionDiligenceInputSchema.safeParse(diligenceInput).success).toBe(true);
    expect(acquisitionDiligenceInputSchema.safeParse({ ...diligenceInput, items: diligenceInput.items.slice(1) }).success).toBe(false);
    expect(acquisitionDiligenceInputSchema.safeParse({ ...diligenceInput, items: diligenceInput.items.map((item, index) => index === 0 ? { ...item, costCents: 1 } : item) }).success).toBe(false);
  });

  it("calculates readiness from open and blocked evidence without authorizing an offer", () => {
    expect(assessAcquisitionDiligence(diligenceInput)).toMatchObject({ readiness: "READY_FOR_HUMAN_OFFER_AUTHORIZATION", reasonCodes: ["READY_FOR_HUMAN_OFFER_AUTHORIZATION"] });
    const open = { ...diligenceInput, items: diligenceInput.items.map((item) => item.kind === "TITLE" ? { ...item, status: "OPEN" as const } : item) };
    expect(assessAcquisitionDiligence(open)).toMatchObject({ readiness: "NEEDS_RESEARCH", openItemKinds: ["TITLE"] });
    const blocked = { ...diligenceInput, items: diligenceInput.items.map((item) => item.kind === "LIENS_PAYOFFS" ? { ...item, status: "BLOCKED" as const } : item) };
    expect(assessAcquisitionDiligence(blocked)).toMatchObject({ readiness: "BLOCKED", blockedItemKinds: ["LIENS_PAYOFFS"] });
  });

  it("opens diligence only from the current advanced acquisition evidence", () => {
    expect(evaluateDiligenceEntryGate(advancedStatus, diligenceInput)).toEqual({ allowed: true, reasonCodes: ["DILIGENCE_REVIEW_ALLOWED"] });
    expect(evaluateDiligenceEntryGate(status, diligenceInput)).toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["ACQUISITION_ADVANCE_REQUIRED"]) });
    expect(evaluateDiligenceEntryGate({ ...advancedStatus, decision: { ...advancedStatus.decision!, sourceEvaluationId: "00000000-0000-4000-8000-000000000809" } }, diligenceInput)).toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["ACQUISITION_DECISION_STALE"]) });
  });

  it("requires explicit bounded internal terms or a term-free decline", () => {
    expect(offerAuthorizationInputSchema.safeParse(offerAuthorizationInput).success).toBe(true);
    expect(offerAuthorizationInputSchema.safeParse({ ...offerAuthorizationInput, terms: undefined }).success).toBe(false);
    expect(offerAuthorizationInputSchema.safeParse({ ...offerAuthorizationInput, decision: "DECLINE_AUTHORIZATION" }).success).toBe(false);
    expect(offerAuthorizationInputSchema.safeParse({ ...offerAuthorizationInput, decision: "DECLINE_AUTHORIZATION", terms: undefined, validForHours: undefined }).success).toBe(true);
  });

  it("authorizes only against current ready diligence and economic ceilings", () => {
    expect(evaluateOfferAuthorizationGate(advancedStatus, diligenceStatus, offerAuthorizationInput)).toMatchObject({ allowed: true, reasonCodes: ["INTERNAL_TERMS_READY_FOR_AUTHORIZATION"], maximumPurchasePriceCents: 15_220_000 });
    expect(evaluateOfferAuthorizationGate(advancedStatus, { ...diligenceStatus, readiness: "NEEDS_RESEARCH" }, offerAuthorizationInput)).toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["CURRENT_READY_DILIGENCE_REQUIRED"]) });
    const excessive = { ...offerAuthorizationInput, terms: { ...offerAuthorizationInput.terms!, purchasePriceCents: 15_300_000 } };
    expect(evaluateOfferAuthorizationGate(advancedStatus, diligenceStatus, excessive)).toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["PURCHASE_PRICE_EXCEEDS_TARGET_FEE_CEILING"]) });
  });

  it("accepts only draft-only preparation controls", () => {
    expect(offerDraftInputSchema.safeParse(offerDraftInput).success).toBe(true);
    expect(offerDraftInputSchema.safeParse({ ...offerDraftInput, sellerFacingApproved: true }).success).toBe(false);
    expect(offerDraftInputSchema.safeParse({ ...offerDraftInput, noDeliveryInitiated: false }).success).toBe(false);
  });

  it("prepares a draft only from the exact active authorization", () => {
    const now = new Date("2026-08-24T04:00:00.000Z");
    expect(evaluateOfferDraftGate(advancedStatus, diligenceStatus, offerAuthorizationStatus, offerDraftInput, now))
      .toEqual({ allowed: true, reasonCodes: ["INTERNAL_DRAFT_PREPARATION_ALLOWED"] });
    expect(evaluateOfferDraftGate(advancedStatus, diligenceStatus, { ...offerAuthorizationStatus, effectiveStatus: "REVOKED" }, offerDraftInput, now))
      .toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["AUTHORIZATION_NOT_ACTIVE"]) });
    expect(evaluateOfferDraftGate(advancedStatus, diligenceStatus, offerAuthorizationStatus, { ...offerDraftInput, authorizationId: "00000000-0000-4000-8000-000000000899" }, now))
      .toMatchObject({ allowed: false, reasonCodes: expect.arrayContaining(["CURRENT_AUTHORIZATION_REQUIRED"]) });
  });
});
