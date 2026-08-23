import { describe, expect, it } from "vitest";
import { evaluateEnrichmentGate } from "../../src/domain/enrichment/gate";
import { buildEnrichedEvaluationInput } from "../../src/domain/enrichment/revise-opportunity";
import { propertyEnrichmentRequestSchema } from "../../src/domain/enrichment/schema";
import type { EnrichmentCandidate, PropertyEnrichmentRequest } from "../../src/domain/enrichment/types";
import { excellentOpportunity } from "../fixtures/leads";

const candidate: EnrichmentCandidate = {
  evaluationId: "00000000-0000-4000-8000-000000000101",
  propertyId: "00000000-0000-4000-8000-000000000102",
  state: "QUALIFIED",
  score: 91,
  expectedAssignmentFee: 45_300,
  rawInput: excellentOpportunity,
};

const publicRequest: PropertyEnrichmentRequest = {
  evaluationId: candidate.evaluationId,
  provider: "Maricopa County Assessor",
  sourceType: "PUBLIC_RECORD",
  sourceUrl: "https://mcassessor.maricopa.gov/parcel/10582001A",
  costCents: 0,
  facts: [
    { field: "squareFeet", value: 1450, classification: "PUBLIC_RECORD", confidence: 0.9 },
    { field: "yearBuilt", value: 1978, classification: "PUBLIC_RECORD", confidence: 0.9 },
  ],
};

describe("property enrichment gate", () => {
  it("allows free public-record research for a surviving opportunity", () => {
    const decision = evaluateEnrichmentGate({ ...candidate, state: "PRELIM_SCREEN", score: 70 }, publicRequest);
    expect(decision.allowed).toBe(true);
    expect(decision.paid).toBe(false);
    expect(decision.reasonCodes).toContain("ENRICH_FREE_RESEARCH_ALLOWED");
  });

  it("rejects any enrichment for an economically rejected opportunity", () => {
    const decision = evaluateEnrichmentGate({ ...candidate, state: "REJECTED" }, publicRequest);
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("ENRICH_REJECTED_OPPORTUNITY");
  });

  it("allows bounded, confident paid enrichment only for a qualified spread", () => {
    const paidRequest: PropertyEnrichmentRequest = {
      ...publicRequest,
      sourceType: "PAID_PROVIDER",
      provider: "Future Permitted Provider",
      costCents: 250,
    };
    const approved = evaluateEnrichmentGate(candidate, paidRequest, { maximumPaidCostCents: 500 });
    expect(approved.allowed).toBe(true);
    expect(approved.reasonCodes).toContain("ENRICH_PAID_APPROVED");

    const overBudget = evaluateEnrichmentGate(candidate, { ...paidRequest, costCents: 501 }, { maximumPaidCostCents: 500 });
    expect(overBudget.allowed).toBe(false);
    expect(overBudget.reasonCodes).toContain("ENRICH_PAID_COST_ABOVE_LIMIT");
  });

  it("blocks paid enrichment when qualification, spread, or confidence is weak", () => {
    const request: PropertyEnrichmentRequest = {
      ...publicRequest,
      sourceType: "PAID_PROVIDER",
      costCents: 100,
      facts: [{ field: "squareFeet", value: 1450, classification: "ESTIMATED", confidence: 0.4 }],
    };
    const decision = evaluateEnrichmentGate(
      { ...candidate, state: "PRELIM_SCREEN", score: 72, expectedAssignmentFee: 9_500 },
      request,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      "ENRICH_PAID_REQUIRES_QUALIFIED",
      "ENRICH_PAID_SCORE_BELOW_80",
      "ENRICH_PAID_SPREAD_BELOW_TARGET",
      "ENRICH_PAID_CONFIDENCE_TOO_LOW",
    ]));
  });
});

describe("property enrichment validation and re-evaluation", () => {
  it("requires provenance URLs for external sources", () => {
    expect(() => propertyEnrichmentRequestSchema.parse({ ...publicRequest, sourceUrl: "" }))
      .toThrow("source URL");
  });

  it("rejects duplicate facts and incorrectly typed fact values", () => {
    expect(() => propertyEnrichmentRequestSchema.parse({
      ...publicRequest,
      facts: [
        publicRequest.facts[0],
        { field: "squareFeet", value: "large", classification: "PUBLIC_RECORD", confidence: 0.8 },
      ],
    })).toThrow();
  });

  it("creates a new provenance input when evidence affects underwriting", () => {
    const revised = buildEnrichedEvaluationInput(
      excellentOpportunity,
      {
        ...publicRequest,
        facts: [
          ...publicRequest.facts,
          { field: "arvLow", value: 405000, classification: "ESTIMATED", confidence: 0.75 },
          { field: "arvHigh", value: 425000, classification: "ESTIMATED", confidence: 0.75 },
        ],
      },
      "00000000-0000-4000-8000-000000000103",
      new Date("2026-08-23T12:00:00Z"),
    );
    expect(revised).toMatchObject({
      source: "ENRICHMENT:PUBLIC_RECORD",
      sourceRecordId: "00000000-0000-4000-8000-000000000103",
      squareFeet: 1450,
      yearBuilt: 1978,
      arvLow: 405000,
      arvHigh: 425000,
    });
  });

  it("does not create noisy evaluation history for non-underwriting facts", () => {
    expect(buildEnrichedEvaluationInput(
      excellentOpportunity,
      { ...publicRequest, facts: [{ field: "bedrooms", value: 3, classification: "PUBLIC_RECORD", confidence: 0.9 }] },
      "00000000-0000-4000-8000-000000000104",
    )).toBeUndefined();
  });
});
