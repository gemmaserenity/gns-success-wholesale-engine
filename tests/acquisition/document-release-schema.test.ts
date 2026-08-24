import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/202608240005_phase3_document_release_governance.sql", import.meta.url),
  "utf8",
);

describe("seller document release database controls", () => {
  it("separates central permission, legal approval, release, signature, and delivery history", () => {
    for (const table of [
      "seller_document_permission_events", "seller_legal_document_versions", "seller_legal_document_approval_events",
      "seller_document_release_packages", "seller_document_release_decisions", "seller_document_release_revocations",
      "seller_document_signature_events", "seller_document_delivery_events",
    ]) expect(migration).toContain(`create table public.${table}`);
    expect(migration).not.toMatch(/grant\s+(update|delete)[^;]*seller_document_/i);
  });

  it("binds exact hashes, approvals, revalidation, retention, and idempotency in PostgreSQL", () => {
    expect(migration).toContain("v_draft.content_sha256 is distinct from p_package ->> 'draftContentSha256'");
    expect(migration).toContain("ARIZONA_WHOLESALE_DISCLOSURE");
    expect(migration).toContain("current_seller_document_permissions");
    expect(migration).toContain("sellerIdentityRevalidated");
    expect(migration).toContain("consentRevalidated");
    expect(migration).toContain("suppressionRevalidated");
    expect(migration).toContain("retention_until");
    expect(migration).toContain("idempotency_key text not null unique");
  });

  it("keeps provider actions unavailable and audit payloads PII-minimized", () => {
    expect(migration).not.toMatch(/grant\s+insert[^;]*(seller_document_signature_events|seller_document_delivery_events)/i);
    expect(migration).toContain("'seller_facing_document_generated', false");
    expect(migration).toContain("'signature_requested', false");
    expect(migration).toContain("'delivery_initiated', false");
    const audits = [...migration.matchAll(/insert into public\.audit_events[\s\S]*?\);/gi)].map((match) => match[0]);
    expect(audits.every((statement) => !/seller_name|property_address|email|phone/i.test(statement))).toBe(true);
  });
});
