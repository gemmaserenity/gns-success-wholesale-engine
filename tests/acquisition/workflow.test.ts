import { describe, expect, it } from "vitest";
import { acquisitionResearchInputSchema, acquisitionDecisionInputSchema } from "../../src/domain/acquisition/schema";
import { buildSellerAcquisitionLead, evaluateAcquisitionDecisionGate } from "../../src/domain/acquisition/workflow";
import type { AcquisitionCaseStatus, AcquisitionResearchInput } from "../../src/domain/acquisition/types";
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
});
