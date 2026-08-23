import { describe, expect, it, vi } from "vitest";
import worker from "../../workers/api/index";

function environment(assetFetch = vi.fn(async () => new Response("seller asset"))): Env {
  return {
    ENVIRONMENT: "production",
    SELLER_PORTAL_HOST: "sell.gns-success.com",
    ASSETS: { fetch: assetFetch },
  } as unknown as Env;
}

describe("seller portal routing", () => {
  it("redirects the public hostname root to the seller form", async () => {
    const assetFetch = vi.fn(async () => new Response("operator dashboard"));
    const response = await worker.fetch(
      new Request("https://sell.gns-success.com/"),
      environment(assetFetch),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://sell.gns-success.com/seller/");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it("serves seller assets without a Cloudflare Access assertion", async () => {
    const assetFetch = vi.fn(async () => new Response("seller form"));
    const response = await worker.fetch(
      new Request("https://sell.gns-success.com/seller/"),
      environment(assetFetch),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("seller form");
    expect(assetFetch).toHaveBeenCalledOnce();
  });

  it("does not expose operator assets through the seller hostname", async () => {
    const assetFetch = vi.fn(async () => new Response("operator javascript"));
    const response = await worker.fetch(
      new Request("https://sell.gns-success.com/app.js"),
      environment(assetFetch),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(assetFetch).not.toHaveBeenCalled();
  });
});
