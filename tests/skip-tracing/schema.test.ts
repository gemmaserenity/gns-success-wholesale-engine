import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608230005_phase2_selective_skip_tracing.sql", import.meta.url),
  "utf8",
);

describe("selective skip-tracing database controls", () => {
  it("keeps cases single-opportunity and findings immutable through the application boundary", () => {
    expect(migration).toContain("source_evaluation_id uuid not null unique");
    expect(migration).toContain("create table public.skip_trace_findings");
    expect(migration).not.toMatch(/grant\s+(delete|update)[^;]*skip_trace_findings/i);
  });

  it("rechecks qualification, cost, and do-not-contact suppression in PostgreSQL", () => {
    expect(migration).toContain("v_state <> 'QUALIFIED'");
    expect(migration).toContain("v_score < 80");
    expect(migration).toContain("v_assignment_fee < 10000");
    expect(migration).toContain("v_owner_confidence < 0.65");
    expect(migration).toContain("v_current_standing = 'DO_NOT_CONTACT'");
    expect(migration).toContain("externalTransmissionAllowed");
  });

  it("separates contact standing and avoids copying PII into audit details", () => {
    expect(migration).toContain("create table public.seller_contact_standing_events");
    expect(migration).toContain("'contact_standing', v_contact_standing");
    expect(migration).not.toMatch(/policy[^;]+skip trace[^;]+authenticated/i);
    expect(migration).toContain("v_current_standing = 'DO_NOT_CONTACT' and v_standing not in ('DO_NOT_CONTACT', 'CONSENTED')");
    const auditStatements = [...migration.matchAll(/insert into public\.audit_events[\s\S]*?\);/gi)].map((match) => match[0]);
    expect(auditStatements.length).toBeGreaterThanOrEqual(3);
    expect(auditStatements.every((statement) => !statement.includes("finding_value"))).toBe(true);
  });
});
