import { ZodError } from "zod";
import { TrusteeSaleCsvAdapter } from "../../src/adapters/csv/csv-adapter";
import { evaluateOpportunity } from "../../src/services/evaluate-opportunity";
import { persistEvaluation } from "../../src/services/supabase-repository";

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
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  await persistEvaluation({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, evaluation);
  return true;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "gns-success-wholesale-engine", persistence: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) });
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
