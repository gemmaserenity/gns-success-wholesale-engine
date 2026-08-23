export const buyerStatuses = ["ACTIVE", "PAUSED", "DO_NOT_CONTACT", "ARCHIVED"] as const;
export type BuyerStatus = typeof buyerStatuses[number];

export const buyerContactStatuses = ["UNVERIFIED", "RELATIONSHIP", "OPTED_IN", "DO_NOT_CONTACT"] as const;
export type BuyerContactStatus = typeof buyerContactStatuses[number];

export const buyerPropertyTypes = ["SFR", "CONDO", "TOWNHOUSE", "MULTIFAMILY", "MOBILE_HOME", "LAND"] as const;
export type BuyerPropertyType = typeof buyerPropertyTypes[number];

export const buyerFinancingTypes = ["CASH", "HARD_MONEY", "PRIVATE_MONEY", "CONVENTIONAL", "OTHER"] as const;
export type BuyerFinancingType = typeof buyerFinancingTypes[number];

export const buyerOccupancies = ["VACANT", "TENANT_OCCUPIED", "OWNER_OCCUPIED", "ANY"] as const;
export type BuyerOccupancy = typeof buyerOccupancies[number];

export const hoaPreferences = ["ALLOWED", "AVOID", "EITHER"] as const;
export type HoaPreference = typeof hoaPreferences[number];

export interface BuyerCriteria {
  preferredCounties: Array<"MARICOPA" | "PINAL">;
  preferredZips: string[];
  propertyTypes: BuyerPropertyType[];
  purchasePriceMin?: number | undefined;
  purchasePriceMax?: number | undefined;
  arvMin?: number | undefined;
  arvMax?: number | undefined;
  maxRepairs?: number | undefined;
  squareFeetMin?: number | undefined;
  squareFeetMax?: number | undefined;
  yearBuiltMin?: number | undefined;
  yearBuiltMax?: number | undefined;
  hoaPreference: HoaPreference;
  occupancies: BuyerOccupancy[];
  closeSpeedDays?: number | undefined;
  financing: BuyerFinancingType[];
}

export interface BuyerProfile {
  id: string;
  displayName: string;
  companyName?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  status: BuyerStatus;
  contactStatus: BuyerContactStatus;
  source: string;
  sourceUrl?: string | undefined;
  notes?: string | undefined;
  verifiedPurchaseCount: number;
  gnsClosingCount: number;
  retradeCount: number;
  reliabilityScore?: number | undefined;
  criteria: BuyerCriteria;
  createdAt: string;
  updatedAt: string;
}

export type BuyerProfileInput = Omit<BuyerProfile, "id" | "createdAt" | "updatedAt"> & { id?: string | undefined };
