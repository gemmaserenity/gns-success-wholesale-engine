import { describe, expect, it, vi } from "vitest";
import wholesaleWorker from "../../workers/api/index";
import sellerWorker from "../../workers/seller/index";
import type { SellerPortalEnv } from "../../workers/seller/intake-handler";

function sellerEnvironment(assetFetch = vi.fn(async () => new Response("seller portal"))): SellerPortalEnv {
  return {
    ASSETS: { fetch: assetFetch } as unknown as Fetcher,
    SELLER_INTAKE_RATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit,
  };
}

function sellerRequest(url: string, init?: RequestInit): Parameters<typeof sellerWorker.fetch>[0] {
  return new Request(url, init) as Parameters<typeof sellerWorker.fetch>[0];
}

function wholesaleRequest(url: string): Parameters<typeof wholesaleWorker.fetch>[0] {
  return new Request(url) as Parameters<typeof wholesaleWorker.fetch>[0];
}

describe("separate seller portal Worker", () => {
  it("serves its isolated public assets without Cloudflare Access", async () => {
    const assetFetch = vi.fn(async () => new Response("seller form"));
    const response = await sellerWorker.fetch(
      sellerRequest("https://sell.gns-success.com/"),
      sellerEnvironment(assetFetch),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("seller form");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it("publishes only a minimal health response", async () => {
    const response = await sellerWorker.fetch(
      sellerRequest("https://sell.gns-success.com/api/health"),
      sellerEnvironment(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "gns-success-seller-portal" });
  });

  it("does not expose the public intake route on the wholesale Worker", async () => {
    const response = await wholesaleWorker.fetch(
      wholesaleRequest("https://wholesale.gns-success.com/api/seller/intake"),
      { ENVIRONMENT: "production" } as Env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Cloudflare Access authentication required." });
  });

  it("keeps the wholesale dashboard behind Cloudflare Access", async () => {
    const response = await wholesaleWorker.fetch(
      wholesaleRequest("https://wholesale.gns-success.com/"),
      { ENVIRONMENT: "production" } as Env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Cloudflare Access authentication required." });
  });
});
