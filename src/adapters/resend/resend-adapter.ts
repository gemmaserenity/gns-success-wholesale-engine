import { z } from "zod";

const resendResponseSchema = z.object({ id: z.string().min(1) });

export interface ResendMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export async function sendResendEmail(
  apiKey: string,
  message: ResendMessage,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(message.tags ? { tags: message.tags } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Resend delivery failed with status ${response.status}`);
  return resendResponseSchema.parse(await response.json()).id;
}

