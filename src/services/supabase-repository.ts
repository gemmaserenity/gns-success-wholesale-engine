import type { OpportunityEvaluation } from "../domain/opportunities/types";

export interface SupabaseConfig {
  url: string;
  secretKey: string;
}

export function isModernSupabaseSecretKey(value: string): boolean {
  return value.startsWith("sb_secret_") && value.length > "sb_secret_".length;
}

async function insert(config: SupabaseConfig, table: string, body: Record<string, unknown>, onConflict?: string): Promise<void> {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: {
      apikey: config.secretKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase ${table} write failed with status ${response.status}`);
}

export async function persistEvaluation(config: SupabaseConfig, evaluation: OpportunityEvaluation): Promise<void> {
  const lead = evaluation.lead;
  await insert(config, "source_records", {
    source: lead.source,
    source_record_id: lead.sourceRecordId ?? evaluation.evaluationId,
    retrieved_at: lead.retrievedAt,
    source_url: lead.sourceUrl || null,
    parser_version: evaluation.parserVersion,
    raw_payload: evaluation.rawInput,
    normalized_payload: lead,
    confidence: lead.dataConfidence,
  }, "source,source_record_id");
  await insert(config, "opportunity_evaluations", {
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
    evaluation: evaluation,
    evaluated_at: evaluation.evaluatedAt,
  });
}
