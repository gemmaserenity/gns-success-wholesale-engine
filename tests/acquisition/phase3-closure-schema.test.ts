import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/202608240007_phase3_closure_activation_interlock.sql", import.meta.url), "utf8");

describe("Phase 3 closure and activation interlock", () => {
  it("defaults closed and requires independent administration evidence", () => {
    expect(migration).toContain("'CLOSED_BY_DEFAULT'");
    expect(migration).toContain("primary_actor_fingerprint <> independent_reviewer_fingerprint");
    expect(migration).toContain("provider_authorization_reference is not null");
    expect(migration).toContain("revoke insert, update, delete on public.seller_document_activation_events from service_role");
  });

  it("hashes a canonical PII-minimized evidence manifest", () => {
    expect(migration).toContain("phase3-governance-evidence-v1");
    expect(migration).toContain("digest(convert_to(v_payload::text, 'UTF8'), 'sha256')");
    expect(migration).not.toMatch(/seller_name|property_address|\bemail\b|\bphone\b/i);
  });

  it("enforces activation before signature or delivery", () => {
    expect(migration).toContain("enforce_activation_on_signature");
    expect(migration).toContain("enforce_activation_on_delivery");
    expect(migration).toContain("Phase 3 seller-document activation interlock is closed");
  });
});
