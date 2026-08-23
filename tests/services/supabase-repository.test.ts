import { afterEach, describe, expect, it, vi } from "vitest";
import { persistEvaluation } from "../../src/services/supabase-repository";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { excellentOpportunity } from "../fixtures/leads";

afterEach(() => vi.unstubAllGlobals());

describe("Supabase repository authentication", () => {
  it("uses a modern secret in the apikey header without legacy bearer authentication", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const secretKey = ["sb", "secret", "test-only-value"].join("_");
    const evaluation = evaluateOpportunity(excellentOpportunity, {
      now: new Date("2026-08-22T12:00:00Z"),
      evaluationId: "00000000-0000-4000-8000-000000000010",
    });

    await persistEvaluation({ url: "https://example.supabase.co", secretKey }, evaluation);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(secretKey);
      expect(headers.has("Authorization")).toBe(false);
    }
  });

  it("rejects legacy JWT-shaped values before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const evaluation = evaluateOpportunity(excellentOpportunity);

    await expect(persistEvaluation({ url: "https://example.supabase.co", secretKey: "legacy.jwt.value" }, evaluation))
      .rejects.toThrow("must be a modern Supabase sb_secret_ key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
