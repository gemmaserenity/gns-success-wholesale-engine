import type { RawLeadInput } from "../../src/domain/opportunities/types";

export const excellentOpportunity: RawLeadInput = {
  source: "TEST_FIXTURE", sourceRecordId: "excellent-1", county: "Maricopa", apn: "105-82-001-A",
  address: "3744 W Chipman Rd, Phoenix, AZ 85041", ownerName: "Carmen Santellano",
  trusteeSaleDate: "2026-11-20", arvLow: 390_000, arvHigh: 430_000, repairsLow: 25_000,
  repairsHigh: 40_000, debtLow: 190_000, debtHigh: 210_000, liens: 0,
  ownerConfidence: 0.95, dataConfidence: 0.9, buyerDemandScore: 90,
  propertyDesirabilityScore: 85, contactabilityScore: 60,
};

export const noEquity: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "no-equity", apn: "200-00-002", debtLow: 420_000, debtHigh: 450_000 };
export const belowTarget: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "below-target", apn: "200-00-003", proposedContractPrice: 265_000, arvLow: 390_000, arvHigh: 390_000, repairsLow: 20_000, repairsHigh: 20_000 };
export const lowConfidenceSpread: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "low-confidence", apn: "200-00-004", dataConfidence: 0.4 };
export const titleComplexity: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "title", apn: "200-00-005", titleComplexity: true };
export const urgentSale: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "urgent", apn: "200-00-006", trusteeSaleDate: "2026-08-25" };
export const ownerMismatch: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "owner-mismatch", apn: "200-00-007", ownerMismatch: true };
export const highProfit: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "high-profit", apn: "200-00-008", arvLow: 500_000, arvHigh: 540_000, debtLow: 150_000, debtHigh: 170_000 };
export const manualReview: RawLeadInput = { ...excellentOpportunity, sourceRecordId: "manual-review", apn: "200-00-009", titleComplexity: true, dataConfidence: 0.65 };
