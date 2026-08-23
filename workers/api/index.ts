import { z, ZodError } from "zod";
import { TrusteeSaleCsvAdapter } from "../../src/adapters/csv/csv-adapter";
import { buyerProfileInputSchema } from "../../src/domain/buyers/schema";
import { buyerStatuses } from "../../src/domain/buyers/types";
import type { BuyerStatus } from "../../src/domain/buyers/types";
import { evaluateEnrichmentGate } from "../../src/domain/enrichment/gate";
import { buildEnrichedEvaluationInput } from "../../src/domain/enrichment/revise-opportunity";
import { propertyEnrichmentRequestSchema } from "../../src/domain/enrichment/schema";
import { normalizeApn, normalizeCounty } from "../../src/domain/opportunities/normalize";
import { counties, pipelineStates } from "../../src/domain/opportunities/types";
import type { County, PipelineState } from "../../src/domain/opportunities/types";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { listBuyers, persistBuyerProfile } from "../../src/services/buyer-repository";
import {
  getEnrichmentCandidate,
  getPropertyEnrichmentStatus,
  persistPropertyEnrichment,
} from "../../src/services/property-enrichment-repository";
import {
  getOpportunityHistory,
  isModernSupabaseSecretKey,
  listOpportunities,
  persistEvaluation,
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "../../src/services/supabase-repository";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function authorized(request: Request, env: Env): boolean {
  if (env.ENVIRONMENT !== "production") return true;
  if (!request.headers.get("Cf-Access-Jwt-Assertion")) return false;
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

async function parseBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > maxBytes) throw new RangeError(`Request exceeds ${maxBytes} bytes`);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError(`Request exceeds ${maxBytes} bytes`);
  return text;
}

async function maybePersist(env: Env, evaluation: ReturnType<typeof evaluateOpportunity>): Promise<boolean> {
  if (!env.SUPABASE_URL && !env.SUPABASE_SECRET_KEY) return false;
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Supabase persistence configuration is incomplete");
  await persistEvaluation({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY }, evaluation);
  return true;
}

function supabaseConfig(env: Env): SupabaseConfig | undefined {
  if (!env.SUPABASE_URL && !env.SUPABASE_SECRET_KEY) return undefined;
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Supabase persistence configuration is incomplete");
  return { url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY };
}

function parseLimit(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new RangeError("Limit must be a whole number between 1 and 100");
  }
  return parsed;
}

function isPipelineState(value: string): value is PipelineState {
  return pipelineStates.some((state) => state === value);
}

function isCounty(value: string): value is County {
  return counties.some((county) => county === value);
}

function isBuyerStatus(value: string): value is BuyerStatus {
  return buyerStatuses.some((status) => status === value);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    const persistence = Boolean(env.SUPABASE_URL && isModernSupabaseSecretKey(env.SUPABASE_SECRET_KEY));
    return json({ ok: true, service: "gns-success-wholesale-engine", persistence });
  }
  if (url.pathname === "/api/buyers" && request.method === "GET") {
    const config = supabaseConfig(env);
    if (!config) return json({ buyers: [], persistence: false });
    const statusValue = url.searchParams.get("status")?.toUpperCase();
    const countyValue = url.searchParams.get("county")?.toUpperCase();
    let status: BuyerStatus | undefined;
    let county: County | undefined;
    if (statusValue) {
      if (!isBuyerStatus(statusValue)) return json({ error: "Unsupported buyer status filter." }, 422);
      status = statusValue;
    }
    if (countyValue) {
      if (!isCounty(countyValue)) return json({ error: "Unsupported buyer county filter." }, 422);
      county = countyValue;
    }
    try {
      const buyers = await listBuyers(config, {
        limit: parseLimit(url.searchParams.get("limit"), 50),
        ...(status ? { status } : {}),
        ...(county ? { county } : {}),
      });
      return json({ buyers, persistence: true, buyerDatabaseAvailable: true });
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ buyers: [], persistence: true, buyerDatabaseAvailable: false });
      }
      throw error;
    }
  }
  if (url.pathname === "/api/buyers" && request.method === "POST") {
    const config = supabaseConfig(env);
    if (!config) return json({ error: "Supabase persistence is required for buyer profiles." }, 503);
    const requestBody: unknown = JSON.parse(await parseBoundedText(request, 32_768));
    const profile = buyerProfileInputSchema.parse(requestBody);
    try {
      const result = await persistBuyerProfile(config, { ...profile, id: profile.id ?? crypto.randomUUID() });
      return json(result, result.created ? 201 : 200);
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ error: "Apply the Phase 2 buyer-database migration before recording buyers." }, 409);
      }
      throw error;
    }
  }
  if (url.pathname === "/api/opportunities" && request.method === "GET") {
    const config = supabaseConfig(env);
    if (!config) return json({ opportunities: [], persistence: false });
    const stateValue = url.searchParams.get("state")?.toUpperCase();
    const countyValue = url.searchParams.get("county")?.toUpperCase();
    let state: PipelineState | undefined;
    let county: County | undefined;
    if (stateValue) {
      if (!isPipelineState(stateValue)) return json({ error: "Unsupported opportunity state filter." }, 422);
      state = stateValue;
    }
    if (countyValue) {
      if (!isCounty(countyValue)) return json({ error: "Unsupported county filter." }, 422);
      county = countyValue;
    }
    try {
      const opportunities = await listOpportunities(config, {
        limit: parseLimit(url.searchParams.get("limit"), 50),
        ...(state ? { state } : {}),
        ...(county ? { county } : {}),
      });
      return json({ opportunities, persistence: true, historyAvailable: true });
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ opportunities: [], persistence: true, historyAvailable: false });
      }
      throw error;
    }
  }
  if (url.pathname === "/api/opportunities/history" && request.method === "GET") {
    const config = supabaseConfig(env);
    if (!config) return json({ history: [], persistence: false });
    const countyValue = url.searchParams.get("county");
    const apnValue = url.searchParams.get("apn");
    if (!countyValue || !apnValue) return json({ error: "County and APN are required." }, 422);
    const county = normalizeCounty(countyValue);
    const apn = normalizeApn(apnValue);
    if (apn.length < 3) return json({ error: "APN must contain at least three letters or digits." }, 422);
    try {
      const history = await getOpportunityHistory(
        config,
        county,
        apn,
        parseLimit(url.searchParams.get("limit"), 25),
      );
      return json({ history, persistence: true, historyAvailable: true });
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ history: [], persistence: true, historyAvailable: false });
      }
      throw error;
    }
  }
  if (url.pathname === "/api/opportunities/enrichment" && request.method === "GET") {
    const config = supabaseConfig(env);
    if (!config) return json({ enrichment: null, persistence: false });
    const evaluationId = z.string().uuid().parse(url.searchParams.get("evaluationId"));
    try {
      const candidate = await getEnrichmentCandidate(config, evaluationId);
      const enrichment = await getPropertyEnrichmentStatus(config, candidate.propertyId);
      return json({ enrichment, persistence: true, enrichmentAvailable: true });
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ enrichment: null, persistence: true, enrichmentAvailable: false });
      }
      throw error;
    }
  }
  if (url.pathname === "/api/opportunities/enrichment" && request.method === "POST") {
    const config = supabaseConfig(env);
    if (!config) return json({ error: "Supabase persistence is required for property enrichment." }, 503);
    const requestBody: unknown = JSON.parse(await parseBoundedText(request, 32_768));
    const enrichmentRequest = propertyEnrichmentRequestSchema.parse(requestBody);
    try {
      const candidate = await getEnrichmentCandidate(config, enrichmentRequest.evaluationId);
      const maximumPaidCostCents = Number(env.MAX_PAID_ENRICHMENT_CENTS || "500");
      if (!Number.isInteger(maximumPaidCostCents) || maximumPaidCostCents < 0) {
        throw new Error("MAX_PAID_ENRICHMENT_CENTS must be a non-negative whole number");
      }
      const gate = evaluateEnrichmentGate(candidate, enrichmentRequest, { maximumPaidCostCents });
      if (!gate.allowed) {
        return json(
          {
            error: `Property enrichment was denied: ${gate.reasonCodes.join(", ")}.`,
            gate,
          },
          422,
        );
      }
      const now = new Date();
      const runId = crypto.randomUUID();
      const enrichedInput = buildEnrichedEvaluationInput(candidate.rawInput, enrichmentRequest, runId, now);
      const revisedEvaluation = enrichedInput
        ? evaluateOpportunity(enrichedInput, { now, evaluationId: crypto.randomUUID() })
        : undefined;
      const result = await persistPropertyEnrichment(config, {
        runId,
        retrievedAt: enrichmentRequest.retrievedAt ?? now.toISOString(),
        request: enrichmentRequest,
        gate,
        ...(revisedEvaluation ? { revisedEvaluation } : {}),
      });
      return json({ result, gate, revisedEvaluation: revisedEvaluation ?? null }, 201);
    } catch (error) {
      if (error instanceof SupabaseFeatureUnavailableError) {
        return json({ error: "Apply the Phase 2 property-enrichment migration before recording evidence." }, 409);
      }
      throw error;
    }
  }
  if (url.pathname === "/api/evaluate" && request.method === "POST") {
    const raw: unknown = JSON.parse(await parseBoundedText(request, 65_536));
    const evaluation = evaluateOpportunity(raw);
    return json({ evaluation, persisted: await maybePersist(env, evaluation) }, 201);
  }
  if (url.pathname === "/api/import/csv" && request.method === "POST") {
    const maxBytes = Number(env.MAX_CSV_BYTES || "2097152");
    const csv = await parseBoundedText(request, maxBytes);
    const rows = new TrusteeSaleCsvAdapter().parse(csv);
    if (rows.length > 500) return json({ error: "A CSV import is limited to 500 records." }, 413);
    const seenKeys = new Set<string>();
    const evaluations = rows.map((row) => evaluateOpportunity(row.normalized, { seenKeys }));
    let persisted = 0;
    for (const evaluation of evaluations) if (await maybePersist(env, evaluation)) persisted += 1;
    return json({ evaluations, summary: {
      imported: evaluations.length,
      qualified: evaluations.filter((item) => item.state === "QUALIFIED").length,
      rejected: evaluations.filter((item) => item.state === "REJECTED").length,
      duplicates: evaluations.filter((item) => item.duplicate).length,
      persisted,
    } }, 201);
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    if (!authorized(request, env)) return json({ error: "Cloudflare Access authentication required." }, 401);
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_failed", message: error instanceof Error ? error.message : "Unknown error" }));
      if (error instanceof ZodError) return json({ error: "Validation failed", issues: error.issues }, 422);
      if (error instanceof RangeError) return json({ error: error.message }, 413);
      return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
    }
  },
} satisfies ExportedHandler<Env>;
