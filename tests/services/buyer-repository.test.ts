import { afterEach, describe, expect, it, vi } from "vitest";
import { listBuyers, persistBuyerProfile } from "../../src/services/buyer-repository";
import { SupabaseFeatureUnavailableError } from "../../src/services/supabase-repository";
import { validBuyerProfile } from "../fixtures/buyers";

afterEach(() => vi.unstubAllGlobals());

const config = {
  url: "https://example.supabase.co",
  secretKey: ["sb", "secret", "test-only-value"].join("_"),
};
const buyerId = "00000000-0000-4000-8000-000000000301";

const buyerRow = {
  id: buyerId,
  display_name: validBuyerProfile.displayName,
  company_name: validBuyerProfile.companyName,
  email: validBuyerProfile.email,
  phone: validBuyerProfile.phone,
  status: validBuyerProfile.status,
  contact_status: validBuyerProfile.contactStatus,
  source: validBuyerProfile.source,
  source_url: null,
  notes: validBuyerProfile.notes,
  verified_purchase_count: validBuyerProfile.verifiedPurchaseCount,
  gns_closing_count: validBuyerProfile.gnsClosingCount,
  retrade_count: validBuyerProfile.retradeCount,
  reliability_score: validBuyerProfile.reliabilityScore,
  criteria: validBuyerProfile.criteria,
  created_at: "2026-08-23T15:00:00.000Z",
  updated_at: "2026-08-23T15:00:00.000Z",
};

describe("buyer repository", () => {
  it("loads and validates buyer profiles with bounded filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([buyerRow]));
    vi.stubGlobal("fetch", fetchMock);

    const buyers = await listBuyers(config, { status: "ACTIVE", county: "MARICOPA", limit: 500 });
    expect(buyers[0]).toMatchObject({
      id: buyerId,
      displayName: validBuyerProfile.displayName,
      criteria: { preferredZips: ["85041", "85251"] },
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/rest/v1/buyer_profiles");
    expect(requestedUrl.searchParams.get("limit")).toBe("100");
    expect(requestedUrl.searchParams.get("status")).toBe("eq.ACTIVE");
    expect(requestedUrl.searchParams.get("preferred_counties")).toBe("cs.{MARICOPA}");
  });

  it("persists a profile transactionally and returns the database record", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ buyerId, created: true }))
      .mockResolvedValueOnce(Response.json([buyerRow]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistBuyerProfile(config, { ...validBuyerProfile, id: buyerId }))
      .resolves.toMatchObject({ created: true, buyer: { id: buyerId } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/persist_buyer_profile");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ p_profile: { ...validBuyerProfile, id: buyerId } });
  });

  it("reports an unapplied buyer migration explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(listBuyers(config)).rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });

  it("rejects malformed database criteria before returning them", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([{
      ...buyerRow,
      criteria: { ...buyerRow.criteria, preferredCounties: ["YAVAPAI"] },
    }])));
    await expect(listBuyers(config)).rejects.toThrow();
  });
});
