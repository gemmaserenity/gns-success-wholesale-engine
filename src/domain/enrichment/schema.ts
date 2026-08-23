import { z } from "zod";
import { evidenceClassifications, enrichmentSourceTypes, propertyFactFields } from "./types";

const numericFields = new Set([
  "squareFeet",
  "bedrooms",
  "bathrooms",
  "yearBuilt",
  "lotSquareFeet",
  "assessedValue",
  "lastSalePrice",
  "arvLow",
  "arvHigh",
  "repairsLow",
  "repairsHigh",
  "debtLow",
  "debtHigh",
  "liens",
]);
const integerFields = new Set(["squareFeet", "yearBuilt", "lotSquareFeet"]);
const textFields = new Set(["propertyType", "occupancy", "mailingAddress"]);

export const propertyFactSchema = z.object({
  field: z.enum(propertyFactFields),
  value: z.union([z.string().trim().min(1).max(500), z.number().finite().nonnegative(), z.boolean()]),
  classification: z.enum(evidenceClassifications),
  confidence: z.number().min(0).max(1),
}).superRefine((fact, ctx) => {
  if (numericFields.has(fact.field) && typeof fact.value !== "number") {
    ctx.addIssue({ code: "custom", path: ["value"], message: `${fact.field} must be numeric` });
  }
  if (integerFields.has(fact.field) && typeof fact.value === "number" && !Number.isInteger(fact.value)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: `${fact.field} must be a whole number` });
  }
  if (fact.field === "yearBuilt" && typeof fact.value === "number" && (fact.value < 1800 || fact.value > 2200)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "yearBuilt must be between 1800 and 2200" });
  }
  if (fact.field === "lastSaleDate" && (typeof fact.value !== "string" || !z.string().date().safeParse(fact.value).success)) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "lastSaleDate must be an ISO date" });
  }
  if (textFields.has(fact.field) && typeof fact.value !== "string") {
    ctx.addIssue({ code: "custom", path: ["value"], message: `${fact.field} must be text` });
  }
});

export const propertyEnrichmentRequestSchema = z.object({
  evaluationId: z.string().uuid(),
  provider: z.string().trim().min(2).max(120),
  sourceType: z.enum(enrichmentSourceTypes),
  sourceUrl: z.string().url().max(2048).optional().or(z.literal("")),
  retrievedAt: z.string().datetime({ offset: true }).optional(),
  costCents: z.number().int().min(0).max(100_000),
  facts: z.array(propertyFactSchema).min(1).max(25),
}).superRefine((request, ctx) => {
  const fields = new Set<string>();
  request.facts.forEach((fact, index) => {
    if (fields.has(fact.field)) {
      ctx.addIssue({ code: "custom", path: ["facts", index, "field"], message: `Duplicate fact field: ${fact.field}` });
    }
    fields.add(fact.field);
  });
  if (["PUBLIC_RECORD", "PERMITTED_API", "PAID_PROVIDER"].includes(request.sourceType) && !request.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "A source URL is required for external enrichment" });
  }
  if (request.sourceType === "PAID_PROVIDER" && request.costCents === 0) {
    ctx.addIssue({ code: "custom", path: ["costCents"], message: "Paid-provider enrichment must record its cost" });
  }
});
