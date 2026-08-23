import { sendResendEmail } from "../adapters/resend/resend-adapter";
import type { SellerIntakeInput, SellerQualification } from "../domain/seller-intake/types";

export type DeliveryResult = { kind: "SELLER_ACKNOWLEDGEMENT" | "OPERATOR_NOTIFICATION"; status: "SENT" | "SKIPPED" | "FAILED"; providerMessageId?: string; errorCode?: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export async function deliverSellerNotifications(input: {
  inquiryId: string;
  intake: SellerIntakeInput;
  qualification: SellerQualification;
  bookingUrl?: string;
  resendApiKey?: string;
  fromEmail?: string;
  operatorEmail?: string;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  const ready = Boolean(input.resendApiKey && input.fromEmail);

  if (!input.intake.email || !input.intake.consentEmail) {
    results.push({ kind: "SELLER_ACKNOWLEDGEMENT", status: "SKIPPED", errorCode: "EMAIL_NOT_CONSENTED" });
  } else if (!ready) {
    results.push({ kind: "SELLER_ACKNOWLEDGEMENT", status: "SKIPPED", errorCode: "RESEND_NOT_CONFIGURED" });
  } else {
    const bookingText = input.bookingUrl ? `\n\nYou can choose a call time here: ${input.bookingUrl}` : "\n\nOur team will review the information and follow up using only the contact methods you authorized.";
    try {
      const providerMessageId = await sendResendEmail(input.resendApiKey!, {
        from: input.fromEmail!,
        to: input.intake.email,
        subject: "We received your property information",
        text: `Hi ${input.intake.name},\n\nThank you for sharing information about ${input.intake.propertyAddress}. Your reference is ${input.inquiryId}.${bookingText}\n\nGNS Success`,
        html: `<p>Hi ${escapeHtml(input.intake.name)},</p><p>Thank you for sharing information about <strong>${escapeHtml(input.intake.propertyAddress)}</strong>. Your reference is <code>${escapeHtml(input.inquiryId)}</code>.</p>${input.bookingUrl ? `<p><a href="${escapeHtml(input.bookingUrl)}">Choose a call time</a></p>` : "<p>Our team will review the information and follow up using only the contact methods you authorized.</p>"}<p>GNS Success</p>`,
        tags: [{ name: "message_type", value: "seller_ack" }],
      }, `seller-ack/${input.inquiryId}`);
      results.push({ kind: "SELLER_ACKNOWLEDGEMENT", status: "SENT", providerMessageId });
    } catch {
      results.push({ kind: "SELLER_ACKNOWLEDGEMENT", status: "FAILED", errorCode: "PROVIDER_ERROR" });
    }
  }

  if (!input.operatorEmail) {
    results.push({ kind: "OPERATOR_NOTIFICATION", status: "SKIPPED", errorCode: "OPERATOR_EMAIL_NOT_CONFIGURED" });
  } else if (!ready) {
    results.push({ kind: "OPERATOR_NOTIFICATION", status: "SKIPPED", errorCode: "RESEND_NOT_CONFIGURED" });
  } else {
    try {
      const providerMessageId = await sendResendEmail(input.resendApiKey!, {
        from: input.fromEmail!,
        to: input.operatorEmail,
        subject: `New ${input.qualification.tier.toLowerCase()} seller inquiry`,
        text: `A new seller inquiry is ready in the private Opportunity Desk. Reference: ${input.inquiryId}. County: ${input.intake.county}. Qualification: ${input.qualification.score}/100 ${input.qualification.tier}.`,
        html: `<p>A new seller inquiry is ready in the private Opportunity Desk.</p><p><strong>Reference:</strong> ${escapeHtml(input.inquiryId)}<br><strong>County:</strong> ${escapeHtml(input.intake.county)}<br><strong>Qualification:</strong> ${input.qualification.score}/100 ${escapeHtml(input.qualification.tier)}</p><p>Open the private dashboard to review contact details and consent evidence.</p>`,
        tags: [{ name: "message_type", value: "operator_notice" }],
      }, `operator-intake/${input.inquiryId}`);
      results.push({ kind: "OPERATOR_NOTIFICATION", status: "SENT", providerMessageId });
    } catch {
      results.push({ kind: "OPERATOR_NOTIFICATION", status: "FAILED", errorCode: "PROVIDER_ERROR" });
    }
  }

  return results;
}

