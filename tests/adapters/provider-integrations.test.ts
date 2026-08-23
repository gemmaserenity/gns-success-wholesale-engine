import { describe, expect, it, vi } from "vitest";
import { resolveSellerBookingUrl } from "../../src/adapters/calcom/calcom-adapter";
import { sendResendEmail } from "../../src/adapters/resend/resend-adapter";
import { deliverSellerNotifications } from "../../src/services/seller-notifications";
import type { SellerIntakeInput } from "../../src/domain/seller-intake/types";

describe("provider integration boundaries", () => {
  it("resolves the sole public Cal.com event without transmitting seller data", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "cal-api-version": "2024-06-14" });
      expect(init?.body).toBeUndefined();
      return new Response(JSON.stringify({ status: "success", data: [{ id: 12, title: "Seller call", slug: "seller-call", bookingUrl: "https://cal.com/gns/seller-call", hidden: false }] }), { status: 200 });
    }) as typeof fetch;
    await expect(resolveSellerBookingUrl("cal_secret", {}, fetcher)).resolves.toBe("https://cal.com/gns/seller-call");
  });

  it("uses Resend idempotency and the documented send endpoint", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("seller-ack/123");
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;
    await expect(sendResendEmail("re_secret", { from: "GNS <offers@gns-success.com>", to: "seller@example.com", subject: "Received", text: "Received", html: "<p>Received</p>" }, "seller-ack/123", fetcher)).resolves.toBe("email_123");
  });

  it("does not email a seller merely because an address exists", async () => {
    const intake: SellerIntakeInput = {
      submissionId: "67b644f2-a066-4390-b1fa-703966020250",
      startedAt: "2026-08-23T18:00:00.000Z",
      name: "Jordan Seller",
      email: "jordan@example.com",
      propertyAddress: "123 Main Street, Phoenix, AZ 85001",
      county: "MARICOPA",
      relationship: "OWNER",
      timeline: "0_30_DAYS",
      motivation: "REPAIRS",
      condition: "MAJOR_REPAIRS",
      occupancy: "VACANT",
      consentEmail: false,
      consentCall: false,
      consentText: false,
      privacyAccepted: true,
    };
    const result = await deliverSellerNotifications({
      inquiryId: intake.submissionId,
      intake,
      qualification: { modelVersion: "seller-intake-v1", score: 95, tier: "PRIORITY", reasonCodes: [], reviewFlags: [], eligibleForBooking: true, summary: "Qualified seller intake evidence summary." },
      resendApiKey: "re_secret",
      fromEmail: "GNS <offers@gns-success.com>",
    });
    expect(result.find((item) => item.kind === "SELLER_ACKNOWLEDGEMENT")).toMatchObject({ status: "SKIPPED", errorCode: "EMAIL_NOT_CONSENTED" });
  });
});
