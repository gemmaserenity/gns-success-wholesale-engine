import { ZodError } from "zod";
import { resolveSellerBookingUrl } from "../../src/adapters/calcom/calcom-adapter";
import { qualifySellerIntake } from "../../src/domain/seller-intake/qualification";
import { sellerIntakeSchema } from "../../src/domain/seller-intake/schema";
import {
  persistSellerInquiry,
  recordSellerDelivery,
} from "../../src/services/seller-intake-repository";
import { deliverSellerNotifications } from "../../src/services/seller-notifications";
import {
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "../../src/services/supabase-repository";

export interface SellerPortalEnv {
  ASSETS: Fetcher;
  SELLER_INTAKE_RATE_LIMIT: RateLimit;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  CALCOM_API_KEY?: string;
  CALCOM_EVENT_TYPE_ID?: string;
  CALCOM_SELLER_BOOKING_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  OPERATOR_NOTIFICATION_EMAIL?: string;
}

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

export function sellerJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function supabaseConfig(env: SellerPortalEnv): SupabaseConfig | undefined {
  if (!env.SUPABASE_URL && !env.SUPABASE_SECRET_KEY) return undefined;
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Supabase persistence configuration is incomplete");
  return { url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY };
}

async function parseBoundedText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > maxBytes) throw new RangeError(`Request exceeds ${maxBytes} bytes`);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError(`Request exceeds ${maxBytes} bytes`);
  return text;
}

export async function handleSellerApi(request: Request, env: SellerPortalEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return sellerJson({ ok: true, service: "gns-success-seller-portal" });
  }
  if (url.pathname !== "/api/seller/intake" || request.method !== "POST") {
    return sellerJson({ error: "Not found" }, 404);
  }
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return sellerJson({ error: "Content-Type must be application/json." }, 415);
  }
  const rateKey = request.headers.get("cf-connecting-ip") ?? "unknown-client";
  const rateLimit = await env.SELLER_INTAKE_RATE_LIMIT.limit({ key: rateKey });
  if (!rateLimit.success) return sellerJson({ error: "Too many submissions. Please wait a minute and try again." }, 429);
  const config = supabaseConfig(env);
  if (!config) return sellerJson({ error: "Seller intake is temporarily unavailable." }, 503);

  try {
    const requestBody: unknown = JSON.parse(await parseBoundedText(request, 32_768));
    const intake = sellerIntakeSchema.parse(requestBody);
    const submittedAt = new Date();
    const startedAt = new Date(intake.startedAt);
    if (submittedAt.getTime() - startedAt.getTime() < 2_000 || submittedAt.getTime() - startedAt.getTime() > 86_400_000) {
      return sellerJson({ error: "Please reload the form and try again." }, 422);
    }
    const qualification = qualifySellerIntake(intake);
    let bookingUrl: string | undefined;
    if (qualification.eligibleForBooking) {
      const configuredEventTypeId = env.CALCOM_EVENT_TYPE_ID ? Number(env.CALCOM_EVENT_TYPE_ID) : undefined;
      if (configuredEventTypeId !== undefined && (!Number.isInteger(configuredEventTypeId) || configuredEventTypeId < 1)) {
        throw new Error("CALCOM_EVENT_TYPE_ID must be a positive whole number");
      }
      try {
        bookingUrl = await resolveSellerBookingUrl(env.CALCOM_API_KEY, {
          ...(env.CALCOM_SELLER_BOOKING_URL ? { configuredUrl: env.CALCOM_SELLER_BOOKING_URL } : {}),
          ...(configuredEventTypeId !== undefined ? { eventTypeId: configuredEventTypeId } : {}),
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "calcom_booking_link_failed", inquiryId: intake.submissionId, message: error instanceof Error ? error.message : "Unknown error" }));
      }
    }

    const persisted = await persistSellerInquiry(config, intake, qualification, submittedAt.toISOString(), bookingUrl);
    let deliveries = persisted.inquiry.deliveryStatuses;
    if (persisted.created) {
      const attemptedAt = new Date().toISOString();
      const notificationResults = await deliverSellerNotifications({
        inquiryId: persisted.inquiry.id,
        intake,
        qualification,
        ...(bookingUrl ? { bookingUrl } : {}),
        ...(env.RESEND_API_KEY ? { resendApiKey: env.RESEND_API_KEY } : {}),
        ...(env.RESEND_FROM_EMAIL ? { fromEmail: env.RESEND_FROM_EMAIL } : {}),
        ...(env.OPERATOR_NOTIFICATION_EMAIL ? { operatorEmail: env.OPERATOR_NOTIFICATION_EMAIL } : {}),
      });
      await Promise.all(notificationResults.map(async (delivery) => {
        try {
          await recordSellerDelivery(config, persisted.inquiry.id, delivery, attemptedAt);
        } catch (error) {
          console.error(JSON.stringify({ event: "seller_delivery_audit_failed", inquiryId: persisted.inquiry.id, kind: delivery.kind, message: error instanceof Error ? error.message : "Unknown error" }));
        }
      }));
      deliveries = notificationResults;
    }
    return sellerJson({
      inquiryId: persisted.inquiry.id,
      created: persisted.created,
      qualification: { tier: qualification.tier, eligibleForBooking: qualification.eligibleForBooking },
      bookingUrl: bookingUrl ?? persisted.inquiry.bookingUrl ?? null,
      acknowledgement: deliveries.find((delivery) => delivery.kind === "SELLER_ACKNOWLEDGEMENT")?.status ?? "SKIPPED",
      callInitiated: false,
      textInitiated: false,
    }, persisted.created ? 201 : 200);
  } catch (error) {
    console.error(JSON.stringify({ event: "seller_request_failed", message: error instanceof Error ? error.message : "Unknown error" }));
    if (error instanceof ZodError) return sellerJson({ error: "Validation failed", issues: error.issues }, 422);
    if (error instanceof RangeError) return sellerJson({ error: error.message }, 413);
    if (error instanceof SupabaseFeatureUnavailableError) return sellerJson({ error: "Seller intake is being prepared. Please try again shortly." }, 503);
    return sellerJson({ error: "The inquiry could not be processed. Please try again." }, 400);
  }
}
