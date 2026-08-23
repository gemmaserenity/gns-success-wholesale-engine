import type { PropertyFactInput } from "../../domain/enrichment/types";

export interface PropertyEnrichmentContext {
  county: "MARICOPA" | "PINAL";
  apn: string;
  address: string;
}

export interface PropertyEnrichmentAdapterResult {
  provider: string;
  sourceUrl?: string;
  retrievedAt: string;
  costCents: number;
  facts: PropertyFactInput[];
}

export interface PropertyEnrichmentAdapter {
  readonly provider: string;
  retrieve(context: PropertyEnrichmentContext): Promise<PropertyEnrichmentAdapterResult>;
}
