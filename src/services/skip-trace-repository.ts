import { z } from "zod";
import {
  contactChannels,
  sellerContactStandings,
  skipTraceFindingKinds,
  skipTraceIdentityStatuses,
  skipTraceOutcomes,
  skipTracePurposes,
  skipTraceSourceTypes,
} from "../domain/skip-tracing/types";
import type {
  ContactStandingInput,
  SkipTraceCaseRequest,
  SkipTraceGateDecision,
  SkipTraceResultInput,
  SkipTraceStatus,
} from "../domain/skip-tracing/types";
import {
  isModernSupabaseSecretKey,
  SupabaseFeatureUnavailableError,
  type SupabaseConfig,
} from "./supabase-repository";

const gateSchema = z.object({
  allowed: z.boolean(),
  reasonCodes: z.array(z.string().min(1)),
  expectedAssignmentFee: z.number(),
  ownerConfidence: z.number().min(0).max(1),
  maximumApprovedCostCents: z.number().int().nonnegative(),
  externalTransmissionAllowed: z.literal(false),
});

const findingSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(skipTraceFindingKinds),
  value: z.string().min(3),
  subjectName: z.string().min(2),
  identityStatus: z.enum(skipTraceIdentityStatuses),
  provider: z.string().min(2),
  sourceType: z.enum(skipTraceSourceTypes),
  sourceUrl: z.string().url().nullable(),
  sourceRecordId: z.string().nullable(),
  retrievedAt: z.string().datetime({ offset: true }),
  classification: z.enum(["VERIFIED", "PUBLIC_RECORD", "HUMAN_VERIFIED", "ESTIMATED"]),
  confidence: z.coerce.number().min(0).max(1),
  costCents: z.number().int().nonnegative(),
  researchNotes: z.string().min(10),
});

const statusRowSchema = z.object({
  case_id: z.string().uuid(),
  source_evaluation_id: z.string().uuid(),
  property_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  owner_name: z.string().min(1),
  status: z.enum(["READY_FOR_RESEARCH", "COMPLETED", "CANCELLED"]),
  purpose: z.enum(skipTracePurposes),
  necessity_reason: z.string().min(20),
  identity_basis: z.string().min(20),
  planned_source_type: z.enum(skipTraceSourceTypes),
  provider: z.string().min(2),
  source_url: z.string().url().nullable(),
  estimated_cost_cents: z.number().int().nonnegative(),
  actual_cost_cents: z.number().int().nonnegative(),
  privacy_notes: z.string().min(20),
  qualification_snapshot: gateSchema,
  outcome: z.enum(skipTraceOutcomes).nullable(),
  requested_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  contact_standing: z.enum(sellerContactStandings),
  allowed_channels: z.array(z.enum(contactChannels)),
  standing_reason: z.string().nullable(),
  findings: z.array(findingSchema),
});

const casePersistenceSchema = z.object({
  caseId: z.string().uuid(),
  propertyId: z.string().uuid(),
  created: z.boolean(),
});

const resultPersistenceSchema = z.object({
  caseId: z.string().uuid(),
  propertyId: z.string().uuid(),
  findingsStored: z.coerce.number().int().nonnegative(),
});

const standingPersistenceSchema = z.object({
  eventId: z.string().uuid(),
  caseId: z.string().uuid(),
  standing: z.enum(sellerContactStandings),
});

function headers(config: SupabaseConfig): HeadersInit {
  if (!isModernSupabaseSecretKey(config.secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY must be a modern Supabase sb_secret_ key");
  }
  return { apikey: config.secretKey, "Content-Type": "application/json" };
}

async function readJson(response: Response, operation: string): Promise<unknown> {
  if (response.status === 404) throw new SupabaseFeatureUnavailableError("Phase 2 selective skip tracing");
  if (!response.ok) throw new Error(`Supabase ${operation} failed with status ${response.status}`);
  return response.json();
}

function mapStatus(row: z.infer<typeof statusRowSchema>): SkipTraceStatus {
  return {
    caseId: row.case_id,
    evaluationId: row.source_evaluation_id,
    propertyId: row.property_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    status: row.status,
    purpose: row.purpose,
    necessityReason: row.necessity_reason,
    identityBasis: row.identity_basis,
    plannedSourceType: row.planned_source_type,
    provider: row.provider,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    estimatedCostCents: row.estimated_cost_cents,
    actualCostCents: row.actual_cost_cents,
    privacyNotes: row.privacy_notes,
    gate: row.qualification_snapshot,
    ...(row.outcome ? { outcome: row.outcome } : {}),
    requestedAt: row.requested_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    contactStanding: row.contact_standing,
    allowedChannels: row.allowed_channels,
    ...(row.standing_reason ? { standingReason: row.standing_reason } : {}),
    findings: row.findings.map((finding) => ({
      id: finding.id,
      kind: finding.kind,
      value: finding.value,
      subjectName: finding.subjectName,
      identityStatus: finding.identityStatus,
      provider: finding.provider,
      sourceType: finding.sourceType,
      ...(finding.sourceUrl ? { sourceUrl: finding.sourceUrl } : {}),
      ...(finding.sourceRecordId ? { sourceRecordId: finding.sourceRecordId } : {}),
      retrievedAt: finding.retrievedAt,
      classification: finding.classification,
      confidence: finding.confidence,
      costCents: finding.costCents,
      researchNotes: finding.researchNotes,
    })),
  };
}

export async function getSkipTraceStatus(
  config: SupabaseConfig,
  propertyId: string,
): Promise<SkipTraceStatus | undefined> {
  const params = new URLSearchParams({
    select: "case_id,source_evaluation_id,property_id,owner_id,owner_name,status,purpose,necessity_reason,identity_basis,planned_source_type,provider,source_url,estimated_cost_cents,actual_cost_cents,privacy_notes,qualification_snapshot,outcome,requested_at,completed_at,contact_standing,allowed_channels,standing_reason,findings",
    property_id: `eq.${propertyId}`,
    limit: "1",
  });
  const response = await fetch(`${config.url}/rest/v1/latest_skip_trace_status?${params}`, { headers: headers(config) });
  const rows = z.array(statusRowSchema).parse(await readJson(response, "skip-trace status"));
  return rows[0] ? mapStatus(rows[0]) : undefined;
}

export async function createSkipTraceCase(
  config: SupabaseConfig,
  command: { caseId: string; requestedAt: string; request: SkipTraceCaseRequest; gate: SkipTraceGateDecision },
): Promise<{ status: SkipTraceStatus; created: boolean }> {
  const response = await fetch(`${config.url}/rest/v1/rpc/create_skip_trace_case`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      p_case: { caseId: command.caseId, requestedAt: command.requestedAt, ...command.request },
      p_gate: command.gate,
    }),
  });
  const result = casePersistenceSchema.parse(await readJson(response, "skip-trace case creation"));
  const status = await getSkipTraceStatus(config, result.propertyId);
  if (!status) throw new Error("Persisted skip-trace case was not found");
  return { status, created: result.created };
}

export async function persistSkipTraceResult(
  config: SupabaseConfig,
  result: SkipTraceResultInput,
  completedAt: string,
): Promise<{ status: SkipTraceStatus; findingsStored: number }> {
  const response = await fetch(`${config.url}/rest/v1/rpc/persist_skip_trace_result`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      p_result: {
        ...result,
        completedAt,
        findings: result.findings.map((finding) => ({
          id: crypto.randomUUID(),
          ...finding,
          retrievedAt: finding.retrievedAt ?? completedAt,
        })),
      },
    }),
  });
  const persisted = resultPersistenceSchema.parse(await readJson(response, "skip-trace result persistence"));
  const status = await getSkipTraceStatus(config, persisted.propertyId);
  if (!status) throw new Error("Persisted skip-trace result was not found");
  return { status, findingsStored: persisted.findingsStored };
}

export async function recordContactStanding(
  config: SupabaseConfig,
  input: ContactStandingInput,
  observedAt: string,
): Promise<z.infer<typeof standingPersistenceSchema>> {
  const response = await fetch(`${config.url}/rest/v1/rpc/record_seller_contact_standing`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      p_event: {
        eventId: crypto.randomUUID(),
        ...input,
        observedAt: input.observedAt ?? observedAt,
      },
    }),
  });
  return standingPersistenceSchema.parse(await readJson(response, "seller contact-standing persistence"));
}
