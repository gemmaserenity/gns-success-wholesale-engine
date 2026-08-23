import { z } from "zod";
import { buildDeduplicationKey } from "../domain/opportunities/normalize";
import type {
  County,
  OpportunityEvaluation,
  PersistedOpportunity,
  PipelineState,
} from "../domain/opportunities/types";

export interface SupabaseConfig {
  url: string;
  secretKey: string;
}

export class SupabaseFeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(`Supabase schema does not yet provide ${feature}`);
    this.name = "SupabaseFeatureUnavailableError";
  }
}

export function isModernSupabaseSecretKey(value: string): boolean {
  return value.startsWith("sb_secret_") && value.length > "sb_secret_".length;
}

const persistenceResultSchema = z.object({
  evaluationId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  sourceRecordId: z.string().uuid().optional(),
  distressEventId: z.string().uuid().optional(),
});

const underwritingScenarioSchema = z.object({
  name: z.enum(["DOWNSIDE", "BASE", "UPSIDE"]),
  arv: z.number(),
  repairs: z.number(),
  estimatedDebt: z.number(),
  investorPurchaseCeiling: z.number(),
  estimatedContractPrice: z.number(),
  maximumContractForTargetFee: z.number(),
  expectedAssignmentFee: z.number(),
  estimatedEquity: z.number(),
});

const opportunityRowSchema = z.object({
  evaluation_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  deduplication_key: z.string().min(1),
  county: z.enum(["MARICOPA", "PINAL"]),
  apn: z.string().min(1),
  canonical_address: z.string().min(1),
  owner_name: z.string().min(1),
  trustee_sale_date: z.string().date().nullable(),
  state: z.enum(["DISCOVERED", "NORMALIZED", "PRELIM_SCREEN", "REJECTED", "QUALIFIED"]),
  score: z.number().int().min(0).max(100),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  next_action: z.enum(["REJECT", "RESEARCH", "ENRICH", "HUMAN_REVIEW", "CONTACT_READY"]),
  base_underwriting: underwritingScenarioSchema,
  evaluated_at: z.string().datetime({ offset: true }),
  history_count: z.coerce.number().int().positive(),
});
const opportunityHistoryRowSchema = opportunityRowSchema.omit({ history_count: true });

export interface OpportunityQuery {
  limit?: number;
  state?: PipelineState;
  county?: County;
}

function headers(config: SupabaseConfig, prefer?: string): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  return {
    apikey: config.secretKey,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

async function legacyInsert(
  config: SupabaseConfig,
  table: string,
  body: Record<string, unknown>,
  onConflict?: string,
): Promise<void> {
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: headers(config, "return=minimal,resolution=merge-duplicates"),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase ${table} write failed with status ${response.status}`);
}

async function persistLegacyEvaluation(config: SupabaseConfig, evaluation: OpportunityEvaluation): Promise<void> {
  const lead = evaluation.lead;
  await legacyInsert(config, "source_records", {
    source: lead.source,
    source_record_id: lead.sourceRecordId ?? evaluation.evaluationId,
    retrieved_at: lead.retrievedAt,
    source_url: lead.sourceUrl || null,
    parser_version: evaluation.parserVersion,
    raw_payload: evaluation.rawInput,
    normalized_payload: lead,
    confidence: lead.dataConfidence,
  }, "source,source_record_id");
  await legacyInsert(config, "opportunity_evaluations", {
    id: evaluation.evaluationId,
    deduplication_key: lead.deduplicationKey,
    county: lead.county,
    apn: lead.apn,
    canonical_address: lead.address,
    owner_name: lead.ownerName,
    trustee_sale_date: lead.trusteeSaleDate || null,
    state: evaluation.state,
    score: evaluation.score.total,
    confidence: evaluation.confidence,
    next_action: evaluation.nextAction,
    base_underwriting: evaluation.scenarios[1],
    evaluation,
    evaluated_at: evaluation.evaluatedAt,
  });
}

function mapOpportunity(row: z.infer<typeof opportunityRowSchema>): PersistedOpportunity {
  return {
    evaluationId: row.evaluation_id,
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    deduplicationKey: row.deduplication_key,
    county: row.county,
    apn: row.apn,
    address: row.canonical_address,
    ownerName: row.owner_name,
    ...(row.trustee_sale_date ? { trusteeSaleDate: row.trustee_sale_date } : {}),
    state: row.state,
    score: row.score,
    confidence: row.confidence,
    nextAction: row.next_action,
    baseUnderwriting: row.base_underwriting,
    evaluatedAt: row.evaluated_at,
    historyCount: row.history_count,
  };
}

export async function persistEvaluation(
  config: SupabaseConfig,
  evaluation: OpportunityEvaluation,
): Promise<z.infer<typeof persistenceResultSchema>> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_opportunity_evaluation`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ p_evaluation: evaluation }),
  });
  if (response.status === 404) {
    await persistLegacyEvaluation(config, evaluation);
    return { evaluationId: evaluation.evaluationId };
  }
  return persistenceResultSchema.parse(await readJson(response, "opportunity persistence"));
}

export async function listOpportunities(
  config: SupabaseConfig,
  query: OpportunityQuery = {},
): Promise<PersistedOpportunity[]> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const params = new URLSearchParams({
    select: "evaluation_id,property_id,deduplication_key,county,apn,canonical_address,owner_name,trustee_sale_date,state,score,confidence,next_action,base_underwriting,evaluated_at,history_count",
    order: "score.desc,evaluated_at.desc",
    limit: String(limit),
  });
  if (query.state) params.set("state", `eq.${query.state}`);
  if (query.county) params.set("county", `eq.${query.county}`);
  const response = await fetch(`${config.url}/rest/v1/current_opportunities?${params}`, {
    headers: headers(config),
  });
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("the Phase 2 opportunity queue");
  const rows = z.array(opportunityRowSchema).parse(await readJson(response, "opportunity list"));
  return rows.map(mapOpportunity);
}

export async function getOpportunityHistory(
  config: SupabaseConfig,
  county: County,
  apn: string,
  limit = 25,
): Promise<PersistedOpportunity[]> {
  const deduplicationKey = buildDeduplicationKey(county, apn);
  const boundedLimit = Math.min(100, Math.max(1, limit));
  const params = new URLSearchParams({
    select: "evaluation_id:id,property_id,deduplication_key,county,apn,canonical_address,owner_name,trustee_sale_date,state,score,confidence,next_action,base_underwriting,evaluated_at",
    deduplication_key: `eq.${deduplicationKey}`,
    order: "evaluated_at.desc",
    limit: String(boundedLimit),
  });
  const response = await fetch(`${config.url}/rest/v1/opportunity_evaluations?${params}`, {
    headers: headers(config),
  });
  const rows = z.array(opportunityHistoryRowSchema).parse(await readJson(response, "opportunity history"));
  const historyCount = rows.length;
  return rows.map((row) => mapOpportunity({ ...row, history_count: historyCount }));
}
