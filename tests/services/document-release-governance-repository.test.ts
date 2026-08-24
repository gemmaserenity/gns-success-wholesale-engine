import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocumentReleaseGovernance } from "../../src/services/acquisition-repository";

afterEach(() => vi.unstubAllGlobals());
const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const caseId = "00000000-0000-4000-8000-000000000901";
const fingerprint = "a".repeat(64);

describe("document release governance repository", () => {
  it("loads only minimized capability and provenance status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      caseId,
      exactCurrentDraft: true,
      draftId: "00000000-0000-4000-8000-000000000902",
      draftContentSha256: "b".repeat(64),
      currentAuthorization: true,
      approvedLegalTemplateAvailable: false,
      approvedArizonaDisclosureAvailable: false,
      permissions: { prepare: false, approve: false, revoke: false },
      release: null,
      sellerFacingGenerationAvailable: false,
      signatureRequestAvailable: false,
      deliveryAvailable: false,
      providerConfigured: false,
      outreachAvailable: false,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDocumentReleaseGovernance(config, caseId, fingerprint)).resolves.toMatchObject({
      caseId,
      approvedLegalTemplateAvailable: false,
      approvedArizonaDisclosureAvailable: false,
      sellerFacingGenerationAvailable: false,
      signatureRequestAvailable: false,
      deliveryAvailable: false,
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({ p_case_id: caseId, p_actor_fingerprint: fingerprint });
    expect(JSON.stringify(request)).not.toContain("sellerName");
  });
});
