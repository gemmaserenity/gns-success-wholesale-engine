import { afterEach, describe, expect, it, vi } from "vitest";
import { getOfferDraft, persistOfferDraft } from "../../src/services/acquisition-repository";
import type { OfferDraftInput } from "../../src/domain/acquisition/types";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const caseId = "00000000-0000-4000-8000-000000000841";
const inquiryId = "00000000-0000-4000-8000-000000000842";
const authorizationId = "00000000-0000-4000-8000-000000000843";
const draftId = "00000000-0000-4000-8000-000000000844";
const fingerprint = "b".repeat(64);
const terms = { purchasePriceCents: 14_000_000, assignmentFeeTargetCents: 1_000_000, earnestMoneyCents: 100_000, inspectionPeriodDays: 10, closingPeriodDays: 21 };
const content = {
  templateVersion: "internal-offer-terms-v1", classification: "INTERNAL_DRAFT_NOT_FOR_DELIVERY",
  title: "Internal Offer Terms Draft", sellerName: "Seller Example", propertyAddress: "123 Main Street",
  terms, authorizationExpiresAt: "2026-08-25T04:00:00.000Z",
  notice: "Not an offer, contract, disclosure, signature instrument, or permission to contact the seller.",
  requiredNextReview: ["APPROVED_LEGAL_TEMPLATE", "APPROVED_WHOLESALE_DISCLOSURE", "FINAL_HUMAN_RELEASE"],
};
const row = {
  draft_id: draftId, case_id: caseId, authorization_id: authorizationId, revision_number: 1,
  template_version: "internal-offer-terms-v1", effective_status: "CURRENT", preparer_fingerprint: fingerprint,
  preparer_role: "PRINCIPAL", preparation_notes: "Prepared for internal legal and compliance review against current authority.",
  content_sha256: "c".repeat(64), content, prepared_at: "2026-08-24T04:00:00.000Z",
};
const input: OfferDraftInput = {
  caseId, inquiryId, authorizationId, templateVersion: "internal-offer-terms-v1", preparerRole: "PRINCIPAL",
  preparationNotes: row.preparation_notes, exactAuthorizationReconfirmed: true, internalDraftOnly: true,
  legalReviewRequired: true, sellerFacingApproved: false, noSignatureRequested: true,
  noDeliveryInitiated: true, noOutreachInitiated: true,
};

describe("offer draft repository", () => {
  it("maps the current immutable draft and its database hash", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([row])));
    await expect(getOfferDraft(config, caseId)).resolves.toMatchObject({ draftId, effectiveStatus: "CURRENT", contentSha256: "c".repeat(64), content });
  });

  it("persists only control metadata while PostgreSQL assembles the content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ draftId, created: true })).mockResolvedValueOnce(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(persistOfferDraft(config, draftId, input, { allowed: true, reasonCodes: ["INTERNAL_DRAFT_PREPARATION_ALLOWED"] }, fingerprint, row.prepared_at))
      .resolves.toMatchObject({ draftId, revisionNumber: 1 });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_draft).toMatchObject({ preparerFingerprint: fingerprint, sellerFacingApproved: false, noSignatureRequested: true, noDeliveryInitiated: true, noOutreachInitiated: true });
    expect(request.p_draft).not.toHaveProperty("content");
  });
});
