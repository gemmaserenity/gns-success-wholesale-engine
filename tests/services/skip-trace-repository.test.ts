import { afterEach, describe, expect, it, vi } from "vitest";
import { getSkipTraceStatus, createSkipTraceCase } from "../../src/services/skip-trace-repository";
import type { SkipTraceCaseRequest, SkipTraceGateDecision } from "../../src/domain/skip-tracing/types";
import { SupabaseFeatureUnavailableError } from "../../src/services/supabase-repository";

afterEach(() => vi.unstubAllGlobals());

const config = { url: "https://example.supabase.co", secretKey: ["sb", "secret", "test-only-value"].join("_") };
const evaluationId = "00000000-0000-4000-8000-000000000601";
const propertyId = "00000000-0000-4000-8000-000000000602";
const caseId = "00000000-0000-4000-8000-000000000603";
const ownerId = "00000000-0000-4000-8000-000000000604";

const statusRow = {
  case_id: caseId,
  source_evaluation_id: evaluationId,
  property_id: propertyId,
  owner_id: ownerId,
  owner_name: "Test Owner",
  status: "READY_FOR_RESEARCH",
  purpose: "OWNER_LOCATION",
  necessity_reason: "This qualified opportunity has no verified owner contact channel.",
  identity_basis: "The current deed and assessor agree on the named owner identity.",
  planned_source_type: "OPERATOR_RESEARCH",
  provider: "GNS operator research",
  source_url: null,
  estimated_cost_cents: 0,
  actual_cost_cents: 0,
  privacy_notes: "Collect only contact evidence needed for this specific opportunity.",
  qualification_snapshot: {
    allowed: true,
    reasonCodes: ["SKIP_TRACE_RESEARCH_APPROVED"],
    expectedAssignmentFee: 45300,
    ownerConfidence: 0.95,
    maximumApprovedCostCents: 1000,
    externalTransmissionAllowed: false,
  },
  outcome: null,
  requested_at: "2026-08-23T12:00:00.000Z",
  completed_at: null,
  contact_standing: "UNKNOWN",
  allowed_channels: [],
  standing_reason: null,
  findings: [],
};

const request: SkipTraceCaseRequest = {
  evaluationId,
  purpose: "OWNER_LOCATION",
  necessityReason: statusRow.necessity_reason,
  identityBasis: statusRow.identity_basis,
  plannedSourceType: "OPERATOR_RESEARCH",
  provider: statusRow.provider,
  estimatedCostCents: 0,
  privacyNotes: statusRow.privacy_notes,
  publicRecordsReviewed: true,
  contactStandingReviewed: true,
};

const gate = statusRow.qualification_snapshot as SkipTraceGateDecision;

describe("skip-trace repository", () => {
  it("runtime-validates status and preserves unknown standing", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([statusRow])));
    await expect(getSkipTraceStatus(config, propertyId)).resolves.toMatchObject({
      caseId,
      contactStanding: "UNKNOWN",
      allowedChannels: [],
      findings: [],
    });
  });

  it("creates a case through the restricted RPC and reloads its validated status", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ caseId, propertyId, created: true }))
      .mockResolvedValueOnce(Response.json([statusRow]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSkipTraceCase(config, {
      caseId,
      requestedAt: "2026-08-23T12:00:00.000Z",
      request,
      gate,
    })).resolves.toMatchObject({ created: true, status: { caseId } });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/create_skip_trace_case");
    const body = JSON.parse(String(init?.body));
    expect(body.p_gate.externalTransmissionAllowed).toBe(false);
    expect(body.p_case).toMatchObject({ evaluationId, publicRecordsReviewed: true, contactStandingReviewed: true });
  });

  it("reports an unapplied migration explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getSkipTraceStatus(config, propertyId)).rejects.toBeInstanceOf(SupabaseFeatureUnavailableError);
  });

  it("rejects malformed database contact standing before returning it", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json([{
      ...statusRow,
      contact_standing: "CONSENTED",
      allowed_channels: ["SMS"],
    }])));
    await expect(getSkipTraceStatus(config, propertyId)).rejects.toThrow();
  });
});
