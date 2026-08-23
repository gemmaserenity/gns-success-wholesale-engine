import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOpportunityHistory,
  listOpportunities,
  persistEvaluation,
  SupabaseFeatureUnavailableError,
} from "../../src/services/supabase-repository";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { excellentOpportunity } from "../fixtures/leads";

afterEach(() => vi.unstubAllGlobals());

describe("Supabase repository authentication", () => {
  it("uses one transactional RPC with a modern secret and no legacy bearer authentication", async () => {
    const persistenceResult = {
      evaluationId: "00000000-0000-4000-8000-000000000010",
      propertyId: "00000000-0000-4000-8000-000000000011",
      sourceRecordId: "00000000-0000-4000-8000-000000000012",
      distressEventId: "00000000-0000-4000-8000-000000000013",
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(persistenceResult));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");
    const evaluation = evaluateOpportunity(excellentOpportunity, {
      now: new Date("2026-08-22T12:00:00Z"),
      evaluationId: "00000000-0000-4000-8000-000000000010",
    });

    await expect(persistEvaluation({ url: "https://example.supabase.co", secretKey }, evaluation))
      .resolves.toEqual(persistenceResult);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/persist_opportunity_evaluation");
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(secretKey);
    expect(headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ p_evaluation: evaluation });
  });

  it("rejects legacy JWT-shaped values before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const evaluation = evaluateOpportunity(excellentOpportunity);

    await expect(persistEvaluation({ url: "https://example.supabase.co", secretKey: "legacy.jwt.value" }, evaluation))
      .rejects.toThrow("must be a modern Supabase sb_secret_ key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps Phase 1 persistence available during a migration-first rolling release", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");
    const evaluation = evaluateOpportunity(excellentOpportunity, {
      evaluationId: "00000000-0000-4000-8000-000000000020",
    });

    await expect(persistEvaluation({ url: "https://example.supabase.co", secretKey }, evaluation))
      .resolves.toEqual({ evaluationId: evaluation.evaluationId });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/rest/v1/source_records");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/rest/v1/opportunity_evaluations");
  });
});

const baseUnderwriting = {
  name: "BASE",
  arv: 410000,
  repairs: 37500,
  estimatedDebt: 220000,
  investorPurchaseCeiling: 270300,
  estimatedContractPrice: 225000,
  maximumContractForTargetFee: 260300,
  expectedAssignmentFee: 45300,
  estimatedEquity: 190000,
};

const persistedRow = {
  evaluation_id: "00000000-0000-4000-8000-000000000010",
  property_id: "00000000-0000-4000-8000-000000000011",
  deduplication_key: "AZ:MARICOPA:10582001A",
  county: "MARICOPA",
  apn: "10582001A",
  canonical_address: "3744 W CHIPMAN RD, PHOENIX, AZ 85041",
  owner_name: "CARMEN SANTELLANO",
  trustee_sale_date: "2026-09-30",
  state: "QUALIFIED",
  score: 91,
  confidence: "HIGH",
  next_action: "CONTACT_READY",
  base_underwriting: baseUnderwriting,
  evaluated_at: "2026-08-23T12:00:00.000Z",
};

describe("Supabase opportunity history queries", () => {
  it("loads the latest persisted opportunity per property with bounded filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ ...persistedRow, history_count: 3 }]));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");

    const opportunities = await listOpportunities(
      { url: "https://example.supabase.co", secretKey },
      { county: "MARICOPA", state: "QUALIFIED", limit: 500 },
    );

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({ score: 91, historyCount: 3, county: "MARICOPA" });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/rest/v1/current_opportunities");
    expect(requestedUrl.searchParams.get("limit")).toBe("100");
    expect(requestedUrl.searchParams.get("state")).toBe("eq.QUALIFIED");
    expect(requestedUrl.searchParams.get("county")).toBe("eq.MARICOPA");
  });

  it("normalizes county and APN into the durable history key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([persistedRow, {
      ...persistedRow,
      evaluation_id: "00000000-0000-4000-8000-000000000014",
      evaluated_at: "2026-08-22T12:00:00.000Z",
      score: 86,
    }]));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");

    const history = await getOpportunityHistory(
      { url: "https://example.supabase.co", secretKey },
      "MARICOPA",
      "105-82-001-A",
    );

    expect(history.map((item) => item.score)).toEqual([91, 86]);
    expect(history.every((item) => item.historyCount === 2)).toBe(true);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("deduplication_key")).toBe("eq.AZ:MARICOPA:10582001A");
  });

  it("rejects malformed database records instead of trusting external JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ ...persistedRow, score: 120, history_count: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");

    await expect(listOpportunities({ url: "https://example.supabase.co", secretKey }))
      .rejects.toThrow();
  });

  it("reports a missing Phase 2 view without masking database connectivity", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");

    await expect(listOpportunities({ url: "https://example.supabase.co", secretKey }))
      .rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });
});
