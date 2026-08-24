import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/202608240006_phase3_document_governance_integrity.sql", import.meta.url), "utf8");

describe("document governance integrity database controls", () => {
  it("adds an append-only centrally administered global hold", () => {
    expect(migration).toContain("create table public.seller_document_governance_hold_events");
    expect(migration).toContain("decision text not null check (decision in ('HOLD', 'RELEASE'))");
    expect(migration).toContain("revoke insert, update, delete on public.seller_document_governance_hold_events from service_role");
  });

  it("enforces the hold before every downstream release phase", () => {
    for (const target of ["release_package", "release_decision", "signature_event", "delivery_event"]) {
      expect(migration).toContain(`enforce_governance_hold_on_${target}`);
    }
  });

  it("reports separation, validity, and retention violations without PII", () => {
    expect(migration).toContain("SEPARATION_OF_DUTIES_VIOLATION");
    expect(migration).toContain("SIGNATURE_WITHOUT_VALID_RELEASE");
    expect(migration).toContain("DELIVERY_WITHOUT_VALID_RELEASE");
    expect(migration).toContain("RETENTION_REVIEW_OVERDUE");
    expect(migration).not.toMatch(/seller_name|property_address|\bemail\b|\bphone\b/i);
  });
});
