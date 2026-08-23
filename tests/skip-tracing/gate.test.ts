import { describe, expect, it } from "vitest";
import { evaluateSkipTraceGate } from "../../src/domain/skip-tracing/gate";
import {
  contactStandingSchema,
  skipTraceCaseRequestSchema,
  skipTraceResultSchema,
} from "../../src/domain/skip-tracing/schema";
import type { SkipTraceCandidate, SkipTraceCaseRequest } from "../../src/domain/skip-tracing/types";
import { excellentOpportunity } from "../fixtures/leads";

const candidate: SkipTraceCandidate = {
  evaluationId: "00000000-0000-4000-8000-000000000501",
  propertyId: "00000000-0000-4000-8000-000000000502",
  state: "QUALIFIED",
  score: 91,
  expectedAssignmentFee: 45_300,
  ownerConfidence: 0.95,
  rawInput: excellentOpportunity,
};

const request: SkipTraceCaseRequest = {
  evaluationId: candidate.evaluationId,
  purpose: "OWNER_LOCATION",
  necessityReason: "The qualified trustee-sale opportunity has no verified owner contact channel.",
  identityBasis: "The current recorded deed and county assessor identify the same named owner.",
  plannedSourceType: "OPERATOR_RESEARCH",
  provider: "GNS operator research",
  estimatedCostCents: 0,
  privacyNotes: "Collect only a contact channel and identity evidence needed for this opportunity.",
  publicRecordsReviewed: true,
  contactStandingReviewed: true,
};

describe("selective skip-trace gate", () => {
  it("approves one bounded, qualified research case without external transmission", () => {
    const gate = evaluateSkipTraceGate(candidate, request, { maximumCostCents: 1_000 });
    expect(gate).toMatchObject({
      allowed: true,
      externalTransmissionAllowed: false,
      maximumApprovedCostCents: 1_000,
    });
    expect(gate.reasonCodes).toEqual(["SKIP_TRACE_RESEARCH_APPROVED"]);
  });

  it("denies weak qualification, identity, economics, cost, and suppression", () => {
    const gate = evaluateSkipTraceGate(
      { ...candidate, state: "PRELIM_SCREEN", score: 79, expectedAssignmentFee: 9_999, ownerConfidence: 0.64 },
      { ...request, estimatedCostCents: 10_000 },
      { maximumCostCents: 1_000, suppressed: true },
    );
    expect(gate.allowed).toBe(false);
    expect(gate.reasonCodes).toEqual(expect.arrayContaining([
      "SKIP_TRACE_REQUIRES_QUALIFIED",
      "SKIP_TRACE_SCORE_BELOW_80",
      "SKIP_TRACE_SPREAD_BELOW_TARGET",
      "SKIP_TRACE_OWNER_CONFIDENCE_TOO_LOW",
      "SKIP_TRACE_COST_ABOVE_LIMIT",
      "SKIP_TRACE_DO_NOT_CONTACT_SUPPRESSION",
    ]));
  });

  it("uses the lower of the configured cap and one percent of expected assignment", () => {
    const lowSpreadCandidate = { ...candidate, expectedAssignmentFee: 12_000 };
    expect(evaluateSkipTraceGate(lowSpreadCandidate, { ...request, estimatedCostCents: 12_000 }, { maximumCostCents: 20_000 }).allowed).toBe(true);
    expect(evaluateSkipTraceGate(lowSpreadCandidate, { ...request, estimatedCostCents: 12_001 }, { maximumCostCents: 20_000 }).allowed).toBe(false);
  });
});

describe("selective skip-trace validation", () => {
  it("requires purpose, identity, privacy, review attestations, and external provenance", () => {
    expect(skipTraceCaseRequestSchema.safeParse(request).success).toBe(true);
    expect(skipTraceCaseRequestSchema.safeParse({
      ...request,
      plannedSourceType: "PAID_PROVIDER",
      estimatedCostCents: 0,
      sourceUrl: "",
      publicRecordsReviewed: false,
    }).success).toBe(false);
  });

  it("keeps no-match results free of invented contacts and validates allocated cost", () => {
    expect(skipTraceResultSchema.safeParse({
      caseId: "00000000-0000-4000-8000-000000000503",
      outcome: "NO_MATCH",
      actualCostCents: 0,
      completionNotes: "The authorized sources returned no supportable owner contact result.",
      findings: [],
    }).success).toBe(true);
    expect(skipTraceResultSchema.safeParse({
      caseId: "00000000-0000-4000-8000-000000000503",
      outcome: "CONTACT_FOUND",
      actualCostCents: 0,
      completionNotes: "A finding was claimed without any evidence record.",
      findings: [],
    }).success).toBe(false);
  });

  it("allows channels only with evidence-based contact-eligible standing", () => {
    const base = {
      caseId: "00000000-0000-4000-8000-000000000503",
      reason: "The owner has not provided consent or another supported contact basis.",
      evidenceSource: "Operator review",
    };
    expect(contactStandingSchema.safeParse({ ...base, standing: "UNKNOWN", allowedChannels: [] }).success).toBe(true);
    expect(contactStandingSchema.safeParse({ ...base, standing: "UNKNOWN", allowedChannels: ["CALL"] }).success).toBe(false);
    expect(contactStandingSchema.safeParse({ ...base, standing: "CONSENTED", allowedChannels: [] }).success).toBe(false);
    expect(contactStandingSchema.safeParse({ ...base, standing: "CONSENTED", allowedChannels: ["CALL"] }).success).toBe(true);
  });
});
