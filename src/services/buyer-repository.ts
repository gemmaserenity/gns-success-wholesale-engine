import { z } from "zod";
import { buyerCriteriaSchema } from "../domain/buyers/schema";
import { buyerContactStatuses, buyerStatuses } from "../domain/buyers/types";
import type { BuyerProfile, BuyerProfileInput, BuyerStatus } from "../domain/buyers/types";
import {
  isModernSupabaseSecretKey,
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "./supabase-repository";

const buyerRowSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(2),
  company_name: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  status: z.enum(buyerStatuses),
  contact_status: z.enum(buyerContactStatuses),
  source: z.string().min(2),
  source_url: z.string().url().nullable(),
  notes: z.string().nullable(),
  verified_purchase_count: z.number().int().nonnegative(),
  gns_closing_count: z.number().int().nonnegative(),
  retrade_count: z.number().int().nonnegative(),
  reliability_score: z.number().int().min(0).max(100).nullable(),
  criteria: buyerCriteriaSchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const persistedBuyerSchema = z.object({ buyerId: z.string().uuid(), created: z.boolean() });

export interface BuyerQuery {
  limit?: number;
  status?: BuyerStatus;
  county?: "MARICOPA" | "PINAL";
}

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("the Phase 2 buyer database");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

function mapBuyer(row: z.infer<typeof buyerRowSchema>): BuyerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    ...(row.company_name ? { companyName: row.company_name } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    status: row.status,
    contactStatus: row.contact_status,
    source: row.source,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    verifiedPurchaseCount: row.verified_purchase_count,
    gnsClosingCount: row.gns_closing_count,
    retradeCount: row.retrade_count,
    ...(row.reliability_score !== null ? { reliabilityScore: row.reliability_score } : {}),
    criteria: row.criteria,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buyerSelect(): string {
  return "id,display_name,company_name,email,phone,status,contact_status,source,source_url,notes,verified_purchase_count,gns_closing_count,retrade_count,reliability_score,criteria,created_at,updated_at";
}

export async function listBuyers(config: SupabaseConfig, query: BuyerQuery = {}): Promise<BuyerProfile[]> {
  const params = new URLSearchParams({
    select: buyerSelect(),
    order: "status.asc,reliability_score.desc.nullslast,updated_at.desc",
    limit: String(Math.min(100, Math.max(1, query.limit ?? 50))),
  });
  if (query.status) params.set("status", `eq.${query.status}`);
  if (query.county) params.set("preferred_counties", `cs.{${query.county}}`);
  const response = await fetch(`${config.url}/rest/v1/buyer_profiles?${params}`, { headers: headers(config) });
  const rows = z.array(buyerRowSchema).parse(await readJson(response, "buyer list"));
  return rows.map(mapBuyer);
}

export async function getBuyer(config: SupabaseConfig, buyerId: string): Promise<BuyerProfile> {
  const params = new URLSearchParams({ select: buyerSelect(), id: `eq.${buyerId}`, limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/buyer_profiles?${params}`, { headers: headers(config) });
  const rows = z.array(buyerRowSchema).parse(await readJson(response, "buyer lookup"));
  const buyer = rows[0];
  if (!buyer) throw new Error("Buyer profile was not found");
  return mapBuyer(buyer);
}

export async function persistBuyerProfile(
  config: SupabaseConfig,
  profile: BuyerProfileInput & { id: string },
): Promise<{ buyer: BuyerProfile; created: boolean }> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_buyer_profile`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ p_profile: profile }),
  });
  const result = persistedBuyerSchema.parse(await readJson(response, "buyer persistence"));
  return { buyer: await getBuyer(config, result.buyerId), created: result.created };
}
