import { z } from "zod";

const eventTypeSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  slug: z.string().min(1),
  bookingUrl: z.string().url(),
  hidden: z.boolean().optional(),
});

const eventTypesResponseSchema = z.object({ status: z.literal("success"), data: z.array(eventTypeSchema) });

export async function resolveSellerBookingUrl(
  apiKey: string | undefined,
  options: { configuredUrl?: string; eventTypeId?: number },
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  if (options.configuredUrl) return z.string().url().parse(options.configuredUrl);
  if (!apiKey) return undefined;

  const response = await fetcher("https://api.cal.com/v2/event-types", {
    headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": "2024-06-14" },
  });
  if (!response.ok) throw new Error(`Cal.com event-type lookup failed with status ${response.status}`);
  const events = eventTypesResponseSchema.parse(await response.json()).data.filter((event) => event.hidden !== true);
  if (options.eventTypeId !== undefined) return events.find((event) => event.id === options.eventTypeId)?.bookingUrl;
  if (events.length === 1) return events[0]?.bookingUrl;
  const sellerEvents = events.filter((event) => /seller|property|home|offer|consult/i.test(`${event.title} ${event.slug}`));
  return sellerEvents.length === 1 ? sellerEvents[0]?.bookingUrl : undefined;
}

