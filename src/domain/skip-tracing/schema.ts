import { z } from "zod";
import {
  contactChannels,
  sellerContactStandings,
  skipTraceFindingKinds,
  skipTraceIdentityStatuses,
  skipTraceOutcomes,
  skipTracePurposes,
  skipTraceSourceTypes,
} from "./types";

const externalSourceTypes = new Set(["PUBLIC_RECORD", "PERMITTED_PROVIDER", "PAID_PROVIDER"]);

export const skipTraceCaseRequestSchema = z.object({
  evaluationId: z.string().uuid(),
  purpose: z.enum(skipTracePurposes),
  necessityReason: z.string().trim().min(20).max(1_000),
  identityBasis: z.string().trim().min(20).max(1_000),
  plannedSourceType: z.enum(skipTraceSourceTypes),
  provider: z.string().trim().min(2).max(120),
  sourceUrl: z.string().url().max(2_048).optional().or(z.literal("")),
  estimatedCostCents: z.number().int().min(0).max(100_000),
  privacyNotes: z.string().trim().min(20).max(1_000),
  publicRecordsReviewed: z.literal(true),
  contactStandingReviewed: z.literal(true),
}).superRefine((request, ctx) => {
  if (externalSourceTypes.has(request.plannedSourceType) && !request.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "A source URL is required for an external research source" });
  }
  if (request.plannedSourceType === "PAID_PROVIDER" && request.estimatedCostCents === 0) {
    ctx.addIssue({ code: "custom", path: ["estimatedCostCents"], message: "Paid-provider research must record an estimated cost" });
  }
});

export const skipTraceFindingSchema = z.object({
  kind: z.enum(skipTraceFindingKinds),
  value: z.string().trim().min(3).max(500),
  subjectName: z.string().trim().min(2).max(200),
  identityStatus: z.enum(skipTraceIdentityStatuses),
  provider: z.string().trim().min(2).max(120),
  sourceType: z.enum(skipTraceSourceTypes),
  sourceUrl: z.string().url().max(2_048).optional().or(z.literal("")),
  sourceRecordId: z.string().trim().max(200).optional().or(z.literal("")),
  retrievedAt: z.string().datetime({ offset: true }).optional(),
  classification: z.enum(["VERIFIED", "PUBLIC_RECORD", "HUMAN_VERIFIED", "ESTIMATED"]),
  confidence: z.number().min(0).max(1),
  costCents: z.number().int().min(0).max(100_000),
  researchNotes: z.string().trim().min(10).max(1_000),
}).superRefine((finding, ctx) => {
  if (externalSourceTypes.has(finding.sourceType) && !finding.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "A source URL is required for an external finding" });
  }
  if (finding.sourceType === "PAID_PROVIDER" && finding.costCents === 0) {
    ctx.addIssue({ code: "custom", path: ["costCents"], message: "Paid-provider evidence must record its cost" });
  }
});

export const skipTraceResultSchema = z.object({
  caseId: z.string().uuid(),
  outcome: z.enum(skipTraceOutcomes),
  actualCostCents: z.number().int().min(0).max(100_000),
  completionNotes: z.string().trim().min(10).max(1_000),
  findings: z.array(skipTraceFindingSchema).max(10),
}).superRefine((result, ctx) => {
  if (result.outcome === "CONTACT_FOUND" && result.findings.length === 0) {
    ctx.addIssue({ code: "custom", path: ["findings"], message: "A contact-found result requires at least one evidence finding" });
  }
  if (result.outcome === "NO_MATCH" && result.findings.length > 0) {
    ctx.addIssue({ code: "custom", path: ["findings"], message: "A no-match result cannot include contact findings" });
  }
  const allocated = result.findings.reduce((total, finding) => total + finding.costCents, 0);
  if (allocated > result.actualCostCents) {
    ctx.addIssue({ code: "custom", path: ["actualCostCents"], message: "Finding costs cannot exceed the total actual cost" });
  }
});

export const contactStandingSchema = z.object({
  caseId: z.string().uuid(),
  standing: z.enum(sellerContactStandings),
  allowedChannels: z.array(z.enum(contactChannels)).max(contactChannels.length),
  reason: z.string().trim().min(10).max(1_000),
  evidenceSource: z.string().trim().min(2).max(200),
  evidenceUrl: z.string().url().max(2_048).optional().or(z.literal("")),
  observedAt: z.string().datetime({ offset: true }).optional(),
}).superRefine((event, ctx) => {
  if (["CONSENTED", "EXISTING_RELATIONSHIP"].includes(event.standing) && event.allowedChannels.length === 0) {
    ctx.addIssue({ code: "custom", path: ["allowedChannels"], message: "Contact-eligible standing requires at least one explicitly supported channel" });
  }
  if (!["CONSENTED", "EXISTING_RELATIONSHIP"].includes(event.standing) && event.allowedChannels.length > 0) {
    ctx.addIssue({ code: "custom", path: ["allowedChannels"], message: "Unknown or suppressed standing cannot allow outreach channels" });
  }
  if (new Set(event.allowedChannels).size !== event.allowedChannels.length) {
    ctx.addIssue({ code: "custom", path: ["allowedChannels"], message: "Allowed channels must be unique" });
  }
});
