import type { County, NormalizedLead, RawLeadInput } from "./types";

const countyAliases: Record<string, County> = {
  MARICOPA: "MARICOPA",
  "MARICOPA COUNTY": "MARICOPA",
  PINAL: "PINAL",
  "PINAL COUNTY": "PINAL",
};

export function normalizeCounty(value: string): County {
  const county = countyAliases[value.trim().toUpperCase()];
  if (!county) throw new Error(`Unsupported Arizona county: ${value}`);
  return county;
}

export function normalizeApn(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeAddress(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeOwnerName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function buildDeduplicationKey(county: County, apn: string): string {
  return `AZ:${county}:${normalizeApn(apn)}`;
}

export function normalizeLead(input: RawLeadInput, now = new Date()): NormalizedLead {
  const county = normalizeCounty(input.county);
  const apn = normalizeApn(input.apn);
  if (apn.length < 3) throw new Error("APN must contain at least three letters or digits");
  return {
    ...input,
    county,
    apn,
    address: normalizeAddress(input.address),
    ownerName: normalizeOwnerName(input.ownerName),
    retrievedAt: input.retrievedAt ?? now.toISOString(),
    deduplicationKey: buildDeduplicationKey(county, apn),
  };
}
