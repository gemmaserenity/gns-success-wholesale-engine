import { z } from "zod";
import { sellerInquiryStatuses, sellerQualificationTiers } from "../domain/seller-intake/types";
import type { SellerInquiry, SellerInquiryStatus, SellerIntakeInput, SellerQualification } from "../domain/seller-intake/types";
import { isModernSupabaseSecretKey, SupabaseFeatureUnavailableError, type SupabaseConfig } from "./supabase-repository";
import type { DeliveryResult } from "./seller-notifications";

const qualificationSchema = z.object({
  modelVersion: z.literal("seller-intake-v1"),
  score: z.number().int().min(0).max(100),
  tier: z.enum(sellerQualificationTiers),
  reasonCodes: z.array(z.string()),
  reviewFlags: z.array(z.string()),
  eligibleForBooking: z.boolean(),
  summary: z.string(),
});

const rowSchema = z.object({
  id: z.string().uuid(),
  submitted_at: z.string().datetime({ offset: true }),
  seller_name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  property_address: z.string(),
  county: z.enum(["MARICOPA", "PINAL", "OTHER_ARIZONA", "OUTSIDE_ARIZONA", "UNKNOWN"]),
  apn: z.string().nullable(),
  relationship: z.enum(["OWNER", "CO_OWNER", "AUTHORIZED_REPRESENTATIVE", "OTHER"]),
  timeline: z.enum(["0_30_DAYS", "31_60_DAYS", "61_90_DAYS", "OVER_90_DAYS", "UNSURE"]),
  motivation: z.enum(["FORECLOSURE", "INHERITED", "VACANT", "REPAIRS", "RELOCATION", "FINANCIAL", "LANDLORD", "OTHER"]),
  property_condition: z.enum(["MAJOR_REPAIRS", "MODERATE_REPAIRS", "LIGHT_REPAIRS", "MOVE_IN_READY", "UNKNOWN"]),
  occupancy: z.enum(["OWNER_OCCUPIED", "TENANT_OCCUPIED", "VACANT", "OTHER", "UNKNOWN"]),
  asking_price: z.coerce.number().nullable(),
  mortgage_balance: z.coerce.number().nullable(),
  notes: z.string().nullable(),
  consent_email: z.boolean(),
  consent_call: z.boolean(),
  consent_text: z.boolean(),
  current_status: z.enum(sellerInquiryStatuses),
  qualification: qualificationSchema,
  booking_url: z.string().url().nullable(),
  delivery_statuses: z.array(z.object({
    kind: z.enum(["SELLER_ACKNOWLEDGEMENT", "OPERATOR_NOTIFICATION"]),
    status: z.enum(["SENT", "SKIPPED", "FAILED"]),
    providerMessageId: z.string().optional(),
  })),
});

const persistSchema = z.object({ inquiryId: z.string().uuid(), created: z.boolean() });

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 2 seller intake");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

function mapRow(row: z.infer<typeof rowSchema>): SellerInquiry {
  return {
    id: row.id,
    submissionId: row.id,
    submittedAt: row.submitted_at,
    name: row.seller_name,
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    propertyAddress: row.property_address,
    county: row.county,
    ...(row.apn ? { apn: row.apn } : {}),
    relationship: row.relationship,
    timeline: row.timeline,
    motivation: row.motivation,
    condition: row.property_condition,
    occupancy: row.occupancy,
    ...(row.asking_price !== null ? { askingPrice: row.asking_price } : {}),
    ...(row.mortgage_balance !== null ? { mortgageBalance: row.mortgage_balance } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    consentEmail: row.consent_email,
    consentCall: row.consent_call,
    consentText: row.consent_text,
    privacyAccepted: true,
    status: row.current_status,
    qualification: row.qualification,
    ...(row.booking_url ? { bookingUrl: row.booking_url } : {}),
    deliveryStatuses: row.delivery_statuses,
  };
}

const select = "id,submitted_at,seller_name,email,phone,property_address,county,apn,relationship,timeline,motivation,property_condition,occupancy,asking_price,mortgage_balance,notes,consent_email,consent_call,consent_text,current_status,qualification,booking_url,delivery_statuses";

export async function getSellerInquiry(config: SupabaseConfig, inquiryId: string): Promise<SellerInquiry> {
  const params = new URLSearchParams({ select, id: `eq.${inquiryId}`, limit: "1" });
  const response = await fetch(`${config.url}/rest/v1/current_seller_inquiries?${params}`, { headers: headers(config) });
  const rows = z.array(rowSchema).parse(await readJson(response, "seller-inquiry lookup"));
  if (!rows[0]) throw new Error("Seller inquiry was not found");
  return mapRow(rows[0]);
}

export async function listSellerInquiries(config: SupabaseConfig, query: { limit?: number; status?: SellerInquiryStatus; tier?: SellerQualification["tier"] } = {}): Promise<SellerInquiry[]> {
  const params = new URLSearchParams({ select, order: "submitted_at.desc", limit: String(Math.min(100, Math.max(1, query.limit ?? 50))) });
  if (query.status) params.set("current_status", `eq.${query.status}`);
  if (query.tier) params.set("qualification_tier", `eq.${query.tier}`);
  const response = await fetch(`${config.url}/rest/v1/current_seller_inquiries?${params}`, { headers: headers(config) });
  return z.array(rowSchema).parse(await readJson(response, "seller-inquiry list")).map(mapRow);
}

export async function persistSellerInquiry(config: SupabaseConfig, input: SellerIntakeInput, qualification: SellerQualification, submittedAt: string, bookingUrl?: string): Promise<{ inquiry: SellerInquiry; created: boolean }> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_seller_inquiry`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ p_inquiry: { ...input, submittedAt, bookingUrl: bookingUrl ?? null }, p_qualification: qualification }),
  });
  const result = persistSchema.parse(await readJson(response, "seller-inquiry persistence"));
  return { inquiry: await getSellerInquiry(config, result.inquiryId), created: result.created };
}

export async function recordSellerDelivery(config: SupabaseConfig, inquiryId: string, delivery: DeliveryResult, attemptedAt: string): Promise<void> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_communication_delivery`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ p_delivery: { deliveryId: crypto.randomUUID(), inquiryId, ...delivery, attemptedAt, idempotencyKey: `${delivery.kind.toLowerCase()}/${inquiryId}` } }),
  });
  await readJson(response, "seller communication-delivery persistence");
}

export async function recordSellerInquiryStatus(config: SupabaseConfig, input: { inquiryId: string; status: SellerInquiryStatus; rationale: string }, recordedAt: string): Promise<SellerInquiry> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_inquiry_status`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ p_event: { eventId: crypto.randomUUID(), ...input, recordedAt } }),
  });
  await readJson(response, "seller-inquiry status persistence");
  return getSellerInquiry(config, input.inquiryId);
}
