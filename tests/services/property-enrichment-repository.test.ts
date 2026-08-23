import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEnrichmentCandidate,
  getPropertyEnrichmentStatus,
  persistPropertyEnrichment,
} from "../../src/services/property-enrichment-repository";
import { SupabaseFeatureUnavailableError } from "../../src/services/supabase-repository";
import type { EnrichmentGateDecision, PropertyEnrichmentRequest } from "../../src/domain/enrichment/types";
import { excellentOpportunity } from "../fixtures/leads";

afterEach(() => vi.unstubAllGlobals());

const config = {
  url: "https://example.supabase.co",
  secretKey: ["sb", "secret", "test-only-value"].join("_"),
};

const evaluationId = "00000000-0000-4000-8000-000000000201";
const propertyId = "00000000-0000-4000-8000-000000000202";
const runId = "00000000-0000-4000-8000-000000000203";

const request: PropertyEnrichmentRequest = {
  evaluationId,
  provider: "Maricopa County Assessor",
  sourceType: "PUBLIC_RECORD",
  sourceUrl: "https://mcassessor.maricopa.gov/parcel/10582001A",
  costCents: 0,
  facts: [{ field: "squareFeet", value: 1450, classification: "PUBLIC_RECORD", confidence: 0.9 }],
};

const gate: EnrichmentGateDecision = {
  allowed: true,
  paid: false,
  reasonCodes: ["ENRICH_FREE_RESEARCH_ALLOWED"],
  averageConfidence: 0.9,
  expectedAssignmentFee: 45300,
  maximumApprovedCostCents: 500,
};

describe("property enrichment repository", () => {
  it("validates and maps an enrichment candidate from the persisted evaluation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{
      evaluation_id: evaluationId,
      property_id: propertyId,
      state: "QUALIFIED",
      score: 91,
      base_underwriting: { expectedAssignmentFee: 45300 },
      evaluation: { rawInput: excellentOpportunity },
    }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getEnrichmentCandidate(config, evaluationId)).resolves.toMatchObject({
      evaluationId,
      propertyId,
      state: "QUALIFIED",
      expectedAssignmentFee: 45300,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(url)).searchParams.get("id")).toBe(`eq.${evaluationId}`);
    expect(new Headers(init?.headers).get("apikey")).toBe(config.secretKey);
  });

  it("returns current facts, cost, provenance, and confidence", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([{
      property_id: propertyId,
      total_cost_cents: 125,
      last_enriched_at: "2026-08-23T12:00:00.000Z",
      average_confidence: 0.9,
      current_facts: [{
        id: "00000000-0000-4000-8000-000000000204",
        field: "squareFeet",
        value: 1450,
        classification: "PUBLIC_RECORD",
        confidence: 0.9,
        observedAt: "2026-08-23T12:00:00.000Z",
        provider: "Maricopa County Assessor",
        sourceType: "PUBLIC_RECORD",
        sourceUrl: "https://mcassessor.maricopa.gov/parcel/10582001A",
        costCents: 125,
      }],
    }])));

    const status = await getPropertyEnrichmentStatus(config, propertyId);
    expect(status).toMatchObject({ totalCostCents: 125, averageConfidence: 0.9 });
    expect(status.currentFacts[0]).toMatchObject({ field: "squareFeet", value: 1450 });
  });

  it("persists gate, facts, cost, and optional re-evaluation through one RPC", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      runId,
      propertyId,
      revisedEvaluationId: null,
      factsStored: 1,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistPropertyEnrichment(config, {
      runId,
      retrievedAt: "2026-08-23T12:00:00.000Z",
      request,
      gate,
    })).resolves.toMatchObject({ runId, propertyId, factsStored: 1 });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/persist_property_enrichment");
    const body = JSON.parse(String(init?.body));
    expect(body.p_run).toMatchObject({ runId, evaluationId, costCents: 0, facts: request.facts });
    expect(body.p_gate).toEqual(gate);
    expect(body.p_revised_evaluation).toBeNull();
  });

  it("reports an unapplied enrichment migration explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getPropertyEnrichmentStatus(config, propertyId))
      .rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });

  it("rejects malformed database facts before returning them to the Worker", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([{
      property_id: propertyId,
      total_cost_cents: 0,
      last_enriched_at: null,
      average_confidence: null,
      current_facts: [{ field: "squareFeet", value: "unknown" }],
    }])));
    await expect(getPropertyEnrichmentStatus(config, propertyId)).rejects.toThrow();
  });
});
