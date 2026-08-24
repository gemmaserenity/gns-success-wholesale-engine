import { afterEach, describe, expect, it, vi } from "vitest";
import { getPhase3ClosureStatus } from "../../src/services/acquisition-repository";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const counts = { approvedContractVersions: 0, approvedDisclosureVersions: 0, activePermissions: 0, releasePackages: 0,
  signatureEvents: 0, deliveryEvents: 0, separationViolations: 0, invalidSignatureEvents: 0, invalidDeliveryEvents: 0, retentionOverdue: 0 };

describe("Phase 3 closure repository", () => {
  it("maps the closed hashed evidence manifest", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      manifest: { manifestVersion: "phase3-governance-evidence-v1", phase: "PHASE_3",
        integrityModelVersion: "seller-document-governance-integrity-v1", integrityStatus: "HEALTHY",
        centralHoldActive: false, reasonCodes: ["GOVERNANCE_INTEGRITY_HEALTHY"], counts,
        activationDecision: "CLOSED_BY_DEFAULT", activationEventId: null, sellerFacingGenerationAvailable: false,
        signatureRequestAvailable: false, deliveryAvailable: false, providerConfigured: false, outreachAvailable: false },
      manifestSha256: "a".repeat(64), phaseStatus: "COMPLETE_RELEASE_CLOSED", activationAvailable: false,
      sellerFacingGenerationAvailable: false, signatureRequestAvailable: false, deliveryAvailable: false,
      providerConfigured: false, outreachAvailable: false,
    })));
    await expect(getPhase3ClosureStatus(config)).resolves.toMatchObject({ phaseStatus: "COMPLETE_RELEASE_CLOSED", manifestSha256: "a".repeat(64) });
  });
});
