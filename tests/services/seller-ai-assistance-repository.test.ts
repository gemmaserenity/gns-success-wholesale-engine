import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSellerAiPacket, recordSellerAiResult } from "../../src/services/seller-ai-assistance-repository";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const packet = {
  packetId: "00000000-0000-4000-8000-000000000711", inquiryId: "00000000-0000-4000-8000-000000000712",
  inputVersion: "seller-ai-input-v1" as const, promptVersion: "seller-ai-prompt-v1" as const,
  minimizedInput: { county: "PINAL" as const, relationship: "OWNER" as const, timeline: "0_30_DAYS" as const, motivation: "REPAIRS" as const, condition: "MAJOR_REPAIRS" as const, occupancy: "OWNER_OCCUPIED" as const, askingPriceProvided: true, mortgageBalanceProvided: true, currentStatus: "NEW" as const, authorizedChannels: ["EMAIL" as const], qualification: { modelVersion: "seller-intake-v1" as const, score: 92, tier: "PRIORITY" as const, reasonCodes: [], reviewFlags: [], eligibleForBooking: true, summary: "Strong evidence-based intake requiring operator verification." } },
  payloadSha256: "a".repeat(64), preparedAt: "2026-08-23T20:00:00.000Z",
};
const output = { summary: "The coded evidence supports a focused operator review.", verificationQuestions: ["Does recorded ownership support the stated relationship?"], riskFlags: ["OWNERSHIP_AUTHORITY" as const], recommendedNextStep: "VERIFY_PUBLIC_RECORDS" as const };

describe("seller AI assistance repository", () => {
  it("persists the minimized packet through the restricted RPC", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(packet));
    vi.stubGlobal("fetch", fetchMock);
    await expect(prepareSellerAiPacket(config, packet)).resolves.toEqual(packet);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://example.supabase.co/rest/v1/rpc/prepare_seller_ai_review_packet");
  });

  it("records provider/model provenance together with the human review", async () => {
    const result = { resultId: "00000000-0000-4000-8000-000000000713", packetId: packet.packetId, provider: "Authorized provider", model: "model-v1", outputSchemaVersion: "seller-ai-output-v1", output, generatedAt: "2026-08-23T20:01:00.000Z", decision: "ACCEPTED_AS_ASSISTANCE" as const, rationale: "The operator verified every statement against the coded intake evidence.", reviewedAt: "2026-08-23T20:01:00.000Z" };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(result));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recordSellerAiResult(config, result)).resolves.toEqual(result);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.p_result).toMatchObject({ provider: "Authorized provider", model: "model-v1", outputSchemaVersion: "seller-ai-output-v1" });
    expect(request.p_review).toMatchObject({ decision: "ACCEPTED_AS_ASSISTANCE" });
  });
});
