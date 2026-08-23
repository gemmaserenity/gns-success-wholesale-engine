import { z } from "zod";
import { buyerProfileSchema } from "../domain/buyers/schema";
import { buyerMatchClassifications, buyerMatchOutcomes } from "../domain/buyers/matching-types";
import type { BuyerMatchRunCommand, BuyerMatchStatus } from "../domain/buyers/matching-types";
import {
  isModernSupabaseSecretKey,
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "./supabase-repository";

const criterionSchema = z.object({
  criterion: z.string().min(1),
  outcome: z.enum(buyerMatchOutcomes),
  weight: z.number().nonnegative(),
  reasonCode: z.string().min(1),
  detail: z.string().min(1),
});

const matchSchema = z.object({
  buyerId: z.string().uuid(),
  buyerName: z.string().min(2),
  classification: z.enum(buyerMatchClassifications),
  fitScore: z.number().int().min(0).max(100),
  credibilityScore: z.number().int().min(0).max(100),
  reasonCodes: z.array(z.string().min(1)),
  criteria: z.array(criterionSchema),
  buyerSnapshot: buyerProfileSchema,
});

const propertySchema = z.object({
  county: z.enum(["MARICOPA", "PINAL"]),
  zip: z.string().regex(/^\d{5}$/).optional(),
  propertyType: z.enum(["SFR", "CONDO", "TOWNHOUSE", "MULTIFAMILY", "MOBILE_HOME", "LAND"]).optional(),
  buyerAcquisitionPrice: z.number().nonnegative(),
  arv: z.number().nonnegative(),
  repairs: z.number().nonnegative(),
  squareFeet: z.number().positive().optional(),
  yearBuilt: z.number().int().min(1800).max(2200).optional(),
  occupancy: z.enum(["VACANT", "TENANT_OCCUPIED", "OWNER_OCCUPIED"]).optional(),
  hasHoa: z.boolean().optional(),
  daysToDeadline: z.number().int().optional(),
});

const statusRowSchema = z.object({
  run_id: z.string().uuid(),
  source_evaluation_id: z.string().uuid(),
  revised_evaluation_id: z.string().uuid(),
  property_id: z.string().uuid(),
  model_version: z.literal("buyer-demand-v1"),
  buyer_demand_score: z.number().int().min(0).max(100),
  probable_buyer_count: z.number().int().nonnegative(),
  possible_buyer_count: z.number().int().nonnegative(),
  eligible_buyer_count: z.number().int().nonnegative(),
  evaluated_buyer_count: z.number().int().nonnegative(),
  buyer_pool_truncated: z.boolean(),
  reason_codes: z.array(z.string()),
  property_snapshot: propertySchema,
  matches: z.array(matchSchema),
  analyzed_at: z.string().datetime({ offset: true }),
});

const persistenceResultSchema = z.object({
  runId: z.string().uuid(),
  propertyId: z.string().uuid(),
  revisedEvaluationId: z.string().uuid(),
});

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 2 buyer-demand matching");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

function mapStatus(row: z.infer<typeof statusRowSchema>): BuyerMatchStatus {
  return {
    runId: row.run_id,
    sourceEvaluationId: row.source_evaluation_id,
    revisedEvaluationId: row.revised_evaluation_id,
    propertyId: row.property_id,
    modelVersion: row.model_version,
    buyerDemandScore: row.buyer_demand_score,
    probableBuyerCount: row.probable_buyer_count,
    possibleBuyerCount: row.possible_buyer_count,
    eligibleBuyerCount: row.eligible_buyer_count,
    evaluatedBuyerCount: row.evaluated_buyer_count,
    buyerPoolTruncated: row.buyer_pool_truncated,
    reasonCodes: row.reason_codes,
    property: row.property_snapshot,
    matches: row.matches,
    analyzedAt: row.analyzed_at,
  };
}

export async function getBuyerMatchStatus(
  config: SupabaseConfig,
  propertyId: string,
): Promise<BuyerMatchStatus | undefined> {
  const params = new URLSearchParams({
    select: "run_id,source_evaluation_id,revised_evaluation_id,property_id,model_version,buyer_demand_score,probable_buyer_count,possible_buyer_count,eligible_buyer_count,evaluated_buyer_count,buyer_pool_truncated,reason_codes,property_snapshot,matches,analyzed_at",
    property_id: `eq.${propertyId}`,
    limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/latest_buyer_match_status?${params}`, { headers: headers(config) });
  const rows = z.array(statusRowSchema).parse(await readJson(response, "buyer-match status"));
  return rows[0] ? mapStatus(rows[0]) : undefined;
}

export async function persistBuyerMatchRun(
  config: SupabaseConfig,
  command: BuyerMatchRunCommand,
): Promise<BuyerMatchStatus> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_buyer_match_run`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      p_run: {
        runId: command.runId,
        sourceEvaluationId: command.sourceEvaluationId,
        propertyId: command.propertyId,
        analyzedAt: command.analyzedAt,
        ...command.analysis,
      },
      p_revised_evaluation: command.revisedEvaluation,
    }),
  });
  const result = persistenceResultSchema.parse(await readJson(response, "buyer-match persistence"));
  const status = await getBuyerMatchStatus(config, result.propertyId);
  if (!status) throw new Error("Persisted buyer-match run was not found");
  return status;
}
