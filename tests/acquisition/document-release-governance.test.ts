import { describe, expect, it } from "vitest";
import { evaluateDocumentReleasePreparationGate } from "../../src/domain/acquisition/workflow";
import type { DocumentReleaseGovernanceStatus } from "../../src/domain/acquisition/types";

const status: DocumentReleaseGovernanceStatus = {
  caseId: "00000000-0000-4000-8000-000000000901",
  exactCurrentDraft: true,
  currentAuthorization: true,
  approvedLegalTemplateAvailable: true,
  approvedArizonaDisclosureAvailable: true,
  permissions: { prepare: true, approve: false, revoke: false },
  sellerFacingGenerationAvailable: false,
  signatureRequestAvailable: false,
  deliveryAvailable: false,
  providerConfigured: false,
  outreachAvailable: false,
};

describe("document release governance", () => {
  it("allows only the provider-neutral control-package preparation boundary", () => {
    expect(evaluateDocumentReleasePreparationGate(status)).toEqual({
      allowed: true,
      reasonCodes: ["RELEASE_CONTROL_PACKAGE_PREPARATION_ALLOWED"],
    });
  });

  it("deterministically reports every absent approval and central permission", () => {
    const gate = evaluateDocumentReleasePreparationGate({
      ...status,
      exactCurrentDraft: false,
      currentAuthorization: false,
      approvedLegalTemplateAvailable: false,
      approvedArizonaDisclosureAvailable: false,
      permissions: { prepare: false, approve: false, revoke: false },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasonCodes).toEqual([
      "EXACT_CURRENT_DRAFT_REQUIRED",
      "CURRENT_AUTHORIZATION_REQUIRED",
      "APPROVED_LEGAL_TEMPLATE_REQUIRED",
      "APPROVED_ARIZONA_DISCLOSURE_REQUIRED",
      "CENTRAL_RELEASE_PREPARATION_PERMISSION_REQUIRED",
    ]);
  });

  it("rejects any premature provider, generation, signature, or delivery capability", () => {
    expect(evaluateDocumentReleasePreparationGate({
      ...status,
      providerConfigured: true,
    } as unknown as DocumentReleaseGovernanceStatus).reasonCodes).toContain("PROVIDER_BOUNDARY_VIOLATION");
  });
});
