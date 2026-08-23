import { z } from "zod";
import { rawLeadSchema } from "../domain/opportunities/schema";
import {
  evidenceClassifications,
  enrichmentSourceTypes,
  propertyFactFields,
} from "../domain/enrichment/types";
import type {
  EnrichmentCandidate,
  EnrichmentGateDecision,
  PropertyEnrichmentRequest,
  PropertyEnrichmentStatus,
} from "../domain/enrichment/types";
import {
  isModernSupabaseSecretKey,
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "./supabase-repository";
import type { OpportunityEvaluation } from "../domain/opportunities/types";

const underwritingSummarySchema = z.object({
  expectedAssignmentFee: z.number(),
});

const candidateRowSchema = z.object({
  evaluation_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  state: z.enum(["DISCOVERED", "NORMALIZED", "PRELIM_SCREEN", "REJECTED", "QUALIFIED"]),
  score: z.number().int().min(0).max(100),
  base_underwriting: underwritingSummarySchema,
  evaluation: z.object({ rawInput: z.unknown() }).passthrough(),
});

const persistedFactSchema = z.object({
  id: z.string().uuid(),
  field: z.enum(propertyFactFields),
  value: z.union([z.string(), z.number(), z.boolean()]),
  classification: z.enum(evidenceClassifications),
  confidence: z.coerce.number().min(0).max(1),
  observedAt: z.string().datetime({ offset: true }),
  provider: z.string(),
  sourceType: z.enum(enrichmentSourceTypes),
  sourceUrl: z.string().url().nullable(),
  costCents: z.number().int().nonnegative(),
});

const enrichmentStatusRowSchema = z.object({
  property_id: z.string().uuid(),
  total_cost_cents: z.coerce.number().int().nonnegative(),
  last_enriched_at: z.string().datetime({ offset: true }).nullable(),
  average_confidence: z.coerce.number().min(0).max(1).nullable(),
  current_facts: z.array(persistedFactSchema),
});

const persistenceResultSchema = z.object({
  runId: z.string().uuid(),
  propertyId: z.string().uuid(),
  revisedEvaluationId: z.string().uuid().nullable(),
  factsStored: z.coerce.number().int().positive(),
});

export interface PropertyEnrichmentPersistenceCommand {
  runId: string;
  retrievedAt: string;
  request: PropertyEnrichmentRequest;
  gate: EnrichmentGateDecision;
  revisedEvaluation?: OpportunityEvaluation;
}

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 2 property enrichment");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

export async function getEnrichmentCandidate(
  config: SupabaseConfig,
  evaluationId: string,
): Promise<EnrichmentCandidate> {
  const params = new URLSearchParams({
    select: "evaluation_id:id,property_id,state,score,base_underwriting,evaluation",
    id: `eq.${evaluationId}`,
    limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/opportunity_evaluations?${params}`, {
    headers: headers(config),
  });
  const rows = z.array(candidateRowSchema).parse(await readJson(response, "enrichment candidate lookup"));
  const row = rows[0];
  if (!row) throw new Error("Opportunity evaluation was not found");
  if (!row.property_id) throw new SupabaseFeatureUnavailableError("the property enrichment backfill");
  return {
    evaluationId: row.evaluation_id,
    propertyId: row.property_id,
    state: row.state,
    score: row.score,
    expectedAssignmentFee: row.base_underwriting.expectedAssignmentFee,
    rawInput: rawLeadSchema.parse(row.evaluation.rawInput),
  };
}

export async function getPropertyEnrichmentStatus(
  config: SupabaseConfig,
  propertyId: string,
): Promise<PropertyEnrichmentStatus> {
  const params = new URLSearchParams({
    select: "property_id,total_cost_cents,last_enriched_at,average_confidence,current_facts",
    property_id: `eq.${propertyId}`,
    limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/property_enrichment_status?${params}`, {
    headers: headers(config),
  });
  const rows = z.array(enrichmentStatusRowSchema).parse(await readJson(response, "property enrichment status"));
  const row = rows[0];
  if (!row) return { propertyId, totalCostCents: 0, currentFacts: [] };
  return {
    propertyId: row.property_id,
    totalCostCents: row.total_cost_cents,
    ...(row.last_enriched_at ? { lastEnrichedAt: row.last_enriched_at } : {}),
    ...(row.average_confidence !== null ? { averageConfidence: row.average_confidence } : {}),
    currentFacts: row.current_facts.map((fact) => ({
      id: fact.id,
      field: fact.field,
      value: fact.value,
      classification: fact.classification,
      confidence: fact.confidence,
      observedAt: fact.observedAt,
      provider: fact.provider,
      sourceType: fact.sourceType,
      ...(fact.sourceUrl ? { sourceUrl: fact.sourceUrl } : {}),
      costCents: fact.costCents,
    })),
  };
}

export async function persistPropertyEnrichment(
  config: SupabaseConfig,
  command: PropertyEnrichmentPersistenceCommand,
): Promise<z.infer<typeof persistenceResultSchema>> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_property_enrichment`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      p_run: {
        runId: command.runId,
        evaluationId: command.request.evaluationId,
        provider: command.request.provider,
        sourceType: command.request.sourceType,
        sourceUrl: command.request.sourceUrl || null,
        retrievedAt: command.retrievedAt,
        costCents: command.request.costCents,
        facts: command.request.facts,
      },
      p_gate: command.gate,
      p_revised_evaluation: command.revisedEvaluation ?? null,
    }),
  });
  return persistenceResultSchema.parse(await readJson(response, "property enrichment persistence"));
}
