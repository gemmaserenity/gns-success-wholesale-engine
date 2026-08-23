import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBuyerDemand, buildBuyerMatchProperty } from "../../src/domain/buyers/matching";
import type { BuyerProfile } from "../../src/domain/buyers/types";
import { getBuyerMatchStatus, persistBuyerMatchRun } from "../../src/services/buyer-match-repository";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { SupabaseFeatureUnavailableError } from "../../src/services/supabase-repository";
import { validBuyerProfile } from "../fixtures/buyers";
import { excellentOpportunity } from "../fixtures/leads";

afterEach(() => vi.unstubAllGlobals());

const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const buyer: BuyerProfile = {
  ...validBuyerProfile,
  id: "00000000-0000-4000-8000-000000000301",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};
const property = buildBuyerMatchProperty({
  rawInput: { ...excellentOpportunity, propertyType: "SFR", squareFeet: 1_500, yearBuilt: 2000, occupancy: "VACANT" },
  now: new Date("2026-08-22T12:00:00Z"),
});
const analysis = analyzeBuyerDemand(property, [buyer]);
const statusRow = {
  run_id: "00000000-0000-4000-8000-000000000401",
  source_evaluation_id: "00000000-0000-4000-8000-000000000402",
  revised_evaluation_id: "00000000-0000-4000-8000-000000000403",
  property_id: "00000000-0000-4000-8000-000000000404",
  model_version: analysis.modelVersion,
  buyer_demand_score: analysis.buyerDemandScore,
  probable_buyer_count: analysis.probableBuyerCount,
  possible_buyer_count: analysis.possibleBuyerCount,
  eligible_buyer_count: analysis.eligibleBuyerCount,
  evaluated_buyer_count: analysis.evaluatedBuyerCount,
  buyer_pool_truncated: analysis.buyerPoolTruncated,
  reason_codes: analysis.reasonCodes,
  property_snapshot: analysis.property,
  matches: analysis.matches,
  analyzed_at: "2026-08-22T12:00:00.000Z",
};

describe("buyer-match repository", () => {
  it("loads and runtime-validates the latest property match", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([statusRow]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getBuyerMatchStatus(config, statusRow.property_id)).resolves.toMatchObject({
      runId: statusRow.run_id,
      buyerDemandScore: 55,
      probableBuyerCount: 1,
    });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe("/rest/v1/latest_buyer_match_status");
  });

  it("persists a run transactionally and returns its validated status", async () => {
    const revisedEvaluation = evaluateOpportunity(
      { ...excellentOpportunity, buyerDemandScore: analysis.buyerDemandScore },
      { now: new Date("2026-08-22T12:00:00Z"), evaluationId: statusRow.revised_evaluation_id },
    );
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        runId: statusRow.run_id,
        propertyId: statusRow.property_id,
        revisedEvaluationId: statusRow.revised_evaluation_id,
      }))
      .mockResolvedValueOnce(Response.json([statusRow]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistBuyerMatchRun(config, {
      runId: statusRow.run_id,
      sourceEvaluationId: statusRow.source_evaluation_id,
      propertyId: statusRow.property_id,
      analyzedAt: statusRow.analyzed_at,
      analysis,
      revisedEvaluation,
    })).resolves.toMatchObject({ runId: statusRow.run_id, probableBuyerCount: 1 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/persist_buyer_match_run");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("reports an unapplied matching migration", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getBuyerMatchStatus(config, statusRow.property_id)).rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });
});
