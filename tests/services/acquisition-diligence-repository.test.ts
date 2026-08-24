import { afterEach, describe, expect, it, vi } from "vitest";
import { getAcquisitionDiligence, persistAcquisitionDiligence } from "../../src/services/acquisition-repository";
import { diligenceItemKinds } from "../../src/domain/acquisition/types";
import type { AcquisitionDiligenceAssessment, AcquisitionDiligenceInput } from "../../src/domain/acquisition/types";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const caseId = "00000000-0000-4000-8000-000000000821";
const inquiryId = "00000000-0000-4000-8000-000000000822";
const evaluationId = "00000000-0000-4000-8000-000000000823";
const buyerRunId = "00000000-0000-4000-8000-000000000824";
const decisionId = "00000000-0000-4000-8000-000000000825";
const reviewId = "00000000-0000-4000-8000-000000000826";
const reviewedAt = "2026-08-24T03:00:00.000Z";
const items = diligenceItemKinds.map((kind) => ({ kind, status: "SATISFIED" as const, sourceName: "Operator review", sourceType: "OPERATOR_REVIEW" as const, sourceUrl: null, reviewedAt, confidence: 0.9, notes: `Current evidence was reviewed for ${kind}.`, costCents: 0 as const }));
const row = { review_id: reviewId, case_id: caseId, source_evaluation_id: evaluationId, buyer_match_run_id: buyerRunId, acquisition_decision_id: decisionId, model_version: "acquisition-diligence-v1", readiness: "READY_FOR_HUMAN_OFFER_AUTHORIZATION", reason_codes: ["READY_FOR_HUMAN_OFFER_AUTHORIZATION"], open_item_kinds: [], blocked_item_kinds: [], summary: "All required diligence evidence is current and reviewed.", material_facts_current: true, reviewed_at: reviewedAt, items };

describe("acquisition diligence repository", () => {
  it("maps the latest immutable diligence review", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAcquisitionDiligence(config, caseId)).resolves.toMatchObject({ reviewId, readiness: "READY_FOR_HUMAN_OFFER_AUTHORIZATION", items: expect.arrayContaining([expect.objectContaining({ kind: "TITLE", costCents: 0 })]) });
  });

  it("persists the computed assessment and boundaries through the restricted RPC", async () => {
    const input: AcquisitionDiligenceInput = { caseId, inquiryId, sourceEvaluationId: evaluationId, buyerMatchRunId: buyerRunId, acquisitionDecisionId: decisionId, summary: row.summary, materialFactsCurrent: true, noOfferGenerated: true, noOutreachInitiated: true, items: items.map(({ sourceUrl: _sourceUrl, ...item }) => item) };
    const assessment: AcquisitionDiligenceAssessment = { modelVersion: "acquisition-diligence-v1", readiness: "READY_FOR_HUMAN_OFFER_AUTHORIZATION", reasonCodes: ["READY_FOR_HUMAN_OFFER_AUTHORIZATION"], openItemKinds: [], blockedItemKinds: [] };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ reviewId, caseId, created: true })).mockResolvedValueOnce(Response.json([row]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(persistAcquisitionDiligence(config, reviewId, input, assessment, { allowed: true, reasonCodes: ["DILIGENCE_REVIEW_ALLOWED"] }, reviewedAt)).resolves.toMatchObject({ reviewId });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_review).toMatchObject({ modelVersion: "acquisition-diligence-v1", noOfferGenerated: true, noOutreachInitiated: true, readiness: "READY_FOR_HUMAN_OFFER_AUTHORIZATION" });
  });
});
