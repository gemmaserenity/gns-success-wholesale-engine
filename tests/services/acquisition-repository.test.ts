import { afterEach, describe, expect, it, vi } from "vitest";
import { getAcquisitionCase, persistAcquisitionCase } from "../../src/services/acquisition-repository";
import { SupabaseFeatureUnavailableError } from "../../src/services/supabase-repository";
import type { AcquisitionCaseCommand } from "../../src/domain/acquisition/types";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { excellentOpportunity } from "../fixtures/leads";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const inquiryId = "00000000-0000-4000-8000-000000000811";
const row = {
  case_id: "00000000-0000-4000-8000-000000000812", inquiry_id: inquiryId, property_id: "00000000-0000-4000-8000-000000000813", opened_at: "2026-08-24T02:00:00.000Z",
  verification: { verificationId: "00000000-0000-4000-8000-000000000814", evaluationId: "00000000-0000-4000-8000-000000000815", sourceName: "Pinal County Assessor", sourceType: "PUBLIC_RECORD", sourceUrl: "https://app1.pinal.gov/example", retrievedAt: "2026-08-24T02:00:00.000Z", propertyIdentityVerified: true, ownerIdentityStatus: "MATCHED", sellerAuthorityStatus: "VERIFIED", researchCostCents: 0, verificationNotes: "Public parcel and owner evidence was reviewed and matched." },
  evaluation: { evaluationId: "00000000-0000-4000-8000-000000000815", state: "QUALIFIED", score: 91, confidence: "HIGH", nextAction: "CONTACT_READY", baseUnderwriting: { name: "BASE", arv: 250000, repairs: 20000, estimatedDebt: 100000, investorPurchaseCeiling: 163000, estimatedContractPrice: 105000, maximumContractForTargetFee: 153000, expectedAssignmentFee: 58000, estimatedEquity: 150000 }, evaluatedAt: "2026-08-24T02:00:00.000Z" },
  buyer_demand: null, decision: null,
};

describe("acquisition repository", () => {
  it("maps the private current-case view", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAcquisitionCase(config, inquiryId)).resolves.toMatchObject({ caseId: row.case_id, inquiryId, verification: { researchCostCents: 0 } });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("inquiry_id")).toBe(`eq.${inquiryId}`);
  });

  it("persists evaluation and verification through one restricted transaction", async () => {
    const evaluation = evaluateOpportunity({ ...excellentOpportunity, source: "SELLER_INQUIRY_RESEARCH", sourceRecordId: inquiryId }, { evaluationId: row.evaluation.evaluationId, now: new Date(row.opened_at) });
    const command = { caseId: row.case_id, verificationId: row.verification.verificationId, openedAt: row.opened_at,
      inquiry: { id: inquiryId, submissionId: inquiryId, submittedAt: row.opened_at, name: "Seller Example", propertyAddress: "123 Main St", county: "PINAL", relationship: "OWNER", timeline: "0_30_DAYS", motivation: "REPAIRS", condition: "MAJOR_REPAIRS", occupancy: "OWNER_OCCUPIED", consentEmail: false, consentCall: false, consentText: false, privacyAccepted: true, status: "NEW", qualification: { modelVersion: "seller-intake-v1", score: 90, tier: "PRIORITY", reasonCodes: [], reviewFlags: [], eligibleForBooking: true, summary: "Priority seller inquiry requiring verified evidence review." }, deliveryStatuses: [] },
      research: { inquiryId, sourceName: row.verification.sourceName, sourceType: "PUBLIC_RECORD", sourceUrl: row.verification.sourceUrl, retrievedAt: row.verification.retrievedAt, county: "PINAL", apn: excellentOpportunity.apn, address: excellentOpportunity.address, ownerName: excellentOpportunity.ownerName, ownerIdentityStatus: "MATCHED", sellerAuthorityStatus: "VERIFIED", propertyIdentityVerified: true, verificationNotes: row.verification.verificationNotes, researchCostCents: 0, arvLow: excellentOpportunity.arvLow, arvHigh: excellentOpportunity.arvHigh, repairsLow: excellentOpportunity.repairsLow, repairsHigh: excellentOpportunity.repairsHigh, debtLow: excellentOpportunity.debtLow, debtHigh: excellentOpportunity.debtHigh, ownerConfidence: excellentOpportunity.ownerConfidence, dataConfidence: excellentOpportunity.dataConfidence }, evaluation,
    } satisfies AcquisitionCaseCommand;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ caseId: row.case_id, inquiryId, created: true })).mockResolvedValueOnce(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(persistAcquisitionCase(config, command)).resolves.toMatchObject({ caseId: row.case_id });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_evaluation.rawInput).toMatchObject({ source: "SELLER_INQUIRY_RESEARCH", sourceRecordId: inquiryId });
    expect(request.p_verification).toMatchObject({ researchCostCents: 0, propertyIdentityVerified: true });
  });

  it("reports a missing Phase 3 migration", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getAcquisitionCase(config, inquiryId)).rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });
});
