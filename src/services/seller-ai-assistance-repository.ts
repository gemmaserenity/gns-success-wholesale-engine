import { z } from "zod";
import type { SellerAiMinimizedInput } from "../domain/seller-intake/ai-assistance";
import { sellerAiOutputSchema, sellerAiReviewDecisions } from "../domain/seller-intake/ai-assistance";
import { isModernSupabaseSecretKey, SupabaseFeatureUnavailableError, type SupabaseConfig } from "./supabase-repository";

const packetSchema = z.object({
  packetId: z.string().uuid(),
  inquiryId: z.string().uuid(),
  inputVersion: z.literal("seller-ai-input-v1"),
  promptVersion: z.literal("seller-ai-prompt-v1"),
  minimizedInput: z.custom<SellerAiMinimizedInput>(),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  preparedAt: z.string().datetime({ offset: true }),
});

const resultSchema = z.object({
  resultId: z.string().uuid(),
  packetId: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
  outputSchemaVersion: z.literal("seller-ai-output-v1"),
  output: sellerAiOutputSchema,
  generatedAt: z.string().datetime({ offset: true }),
  decision: z.enum(sellerAiReviewDecisions),
  rationale: z.string(),
  reviewedAt: z.string().datetime({ offset: true }),
});

export type SellerAiPacket = z.infer<typeof packetSchema>;
export type SellerAiReviewedResult = z.infer<typeof resultSchema>;

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 2 AI-assisted seller intake");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

export async function prepareSellerAiPacket(config: SupabaseConfig, packet: SellerAiPacket): Promise<SellerAiPacket> {
  const response = await fetch(`${config.url}/rest/v1/rpc/prepare_seller_ai_review_packet`, {
    method: "POST", headers: headers(config), body: JSON.stringify({ p_packet: packet }),
  });
  return packetSchema.parse(await readJson(response, "seller AI packet persistence"));
}

export async function recordSellerAiResult(config: SupabaseConfig, input: {
  resultId: string; packetId: string; provider: string; model: string;
  output: z.infer<typeof sellerAiOutputSchema>; generatedAt: string;
  decision: typeof sellerAiReviewDecisions[number]; rationale: string; reviewedAt: string;
}): Promise<SellerAiReviewedResult> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_ai_assistance`, {
    method: "POST", headers: headers(config), body: JSON.stringify({
      p_result: { ...input, outputSchemaVersion: "seller-ai-output-v1" },
      p_review: { reviewId: crypto.randomUUID(), resultId: input.resultId, decision: input.decision, rationale: input.rationale, reviewedAt: input.reviewedAt },
    }),
  });
  return resultSchema.parse(await readJson(response, "seller AI assistance persistence"));
}

export async function getSellerAiStatus(config: SupabaseConfig, inquiryId: string): Promise<{ packet?: SellerAiPacket; result?: SellerAiReviewedResult }> {
  const params = new URLSearchParams({ select: "*", inquiry_id: `eq.${inquiryId}`, limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/current_seller_ai_assistance?${params}`, { headers: headers(config) });
  const rows = z.array(z.object({ packet: packetSchema, result: resultSchema.nullable() })).parse(await readJson(response, "seller AI assistance lookup"));
  return rows[0] ? { packet: rows[0].packet, ...(rows[0].result ? { result: rows[0].result } : {}) } : {};
}
