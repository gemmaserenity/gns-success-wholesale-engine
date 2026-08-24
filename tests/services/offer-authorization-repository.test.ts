import { afterEach, describe, expect, it, vi } from "vitest";
import { getOfferAuthorization, persistOfferAuthorization, revokeOfferAuthorization } from "../../src/services/acquisition-repository";
import type { OfferAuthorizationInput } from "../../src/domain/acquisition/types";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const caseId = "00000000-0000-4000-8000-000000000831";
const inquiryId = "00000000-0000-4000-8000-000000000832";
const authorizationId = "00000000-0000-4000-8000-000000000833";
const reviewId = "00000000-0000-4000-8000-000000000834";
const evaluationId = "00000000-0000-4000-8000-000000000835";
const buyerRunId = "00000000-0000-4000-8000-000000000836";
const decisionId = "00000000-0000-4000-8000-000000000837";
const authorizedAt = "2026-08-24T04:00:00.000Z";
const fingerprint = "a".repeat(64);
const terms = { purchasePriceCents: 14_000_000, assignmentFeeTargetCents: 1_000_000, earnestMoneyCents: 100_000, inspectionPeriodDays: 10, closingPeriodDays: 21 };
const row = { authorization_id: authorizationId, case_id: caseId, diligence_review_id: reviewId, source_evaluation_id: evaluationId, buyer_match_run_id: buyerRunId, acquisition_decision_id: decisionId, decision: "AUTHORIZE_INTERNAL_TERMS", effective_status: "AUTHORIZED", authorizer_fingerprint: fingerprint, authorizer_role: "PRINCIPAL", rationale: "The current evidence and economics support bounded internal terms.", terms, authorized_at: authorizedAt, expires_at: "2026-08-25T04:00:00.000Z", revoked_at: null, revocation_reason: null };
const input: OfferAuthorizationInput = { caseId, inquiryId, diligenceReviewId: reviewId, sourceEvaluationId: evaluationId, buyerMatchRunId: buyerRunId, acquisitionDecisionId: decisionId, decision: "AUTHORIZE_INTERNAL_TERMS", authorizerRole: "PRINCIPAL", rationale: row.rationale, validForHours: 24, terms, materialFactsReconfirmed: true, disclosureReviewed: true, internalAuthorizationOnly: true, noOfferGenerated: true, noOutreachInitiated: true };

describe("offer authorization repository", () => {
  it("maps the current effective authorization", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([row])));
    await expect(getOfferAuthorization(config, caseId)).resolves.toMatchObject({ authorizationId, effectiveStatus: "AUTHORIZED", terms });
  });

  it("persists an expiring authorization with a server-supplied actor fingerprint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ authorizationId, created: true })).mockResolvedValueOnce(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(persistOfferAuthorization(config, authorizationId, input, { allowed: true, reasonCodes: ["INTERNAL_TERMS_READY_FOR_AUTHORIZATION"], maximumPurchasePriceCents: 15_220_000 }, fingerprint, authorizedAt)).resolves.toMatchObject({ authorizationId });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_authorization).toMatchObject({ authorizerFingerprint: fingerprint, expiresAt: "2026-08-25T04:00:00.000Z", noOfferGenerated: true, noOutreachInitiated: true });
  });

  it("appends a revocation without generating or sending an offer", async () => {
    const revoked = { ...row, effective_status: "REVOKED", revoked_at: "2026-08-24T05:00:00.000Z", revocation_reason: "The material facts require another diligence review." };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ authorizationId, created: true })).mockResolvedValueOnce(Response.json([revoked]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeOfferAuthorization(config, "00000000-0000-4000-8000-000000000838", { caseId, authorizationId, reason: revoked.revocation_reason, internalAuthorizationOnly: true, noOfferGenerated: true, noOutreachInitiated: true }, fingerprint, revoked.revoked_at)).resolves.toMatchObject({ effectiveStatus: "REVOKED" });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_revocation).toMatchObject({ actorFingerprint: fingerprint, noOfferGenerated: true, noOutreachInitiated: true });
  });
});
