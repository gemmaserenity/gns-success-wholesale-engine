import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocumentGovernanceIntegrity } from "../../src/services/acquisition-repository";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };

describe("document governance integrity repository", () => {
  it("maps the minimized read-only integrity assessment", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      modelVersion: "seller-document-governance-integrity-v1", assessedAt: "2026-08-24T08:00:00.000Z",
      status: "HEALTHY", reasonCodes: ["GOVERNANCE_INTEGRITY_HEALTHY"], centralHoldActive: false,
      counts: { approvedContractVersions: 0, approvedDisclosureVersions: 0, activePermissions: 0, releasePackages: 0,
        signatureEvents: 0, deliveryEvents: 0, separationViolations: 0, invalidSignatureEvents: 0,
        invalidDeliveryEvents: 0, retentionOverdue: 0 }, sellerFacingGenerationAvailable: false,
      signatureRequestAvailable: false, deliveryAvailable: false, providerConfigured: false, outreachAvailable: false,
    })));
    await expect(getDocumentGovernanceIntegrity(config)).resolves.toMatchObject({ status: "HEALTHY", centralHoldActive: false });
  });
});
