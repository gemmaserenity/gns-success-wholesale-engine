export const sellerRelationships = ["OWNER", "CO_OWNER", "AUTHORIZED_REPRESENTATIVE", "OTHER"] as const;
export const sellerTimelines = ["0_30_DAYS", "31_60_DAYS", "61_90_DAYS", "OVER_90_DAYS", "UNSURE"] as const;
export const sellerMotivations = ["FORECLOSURE", "INHERITED", "VACANT", "REPAIRS", "RELOCATION", "FINANCIAL", "LANDLORD", "OTHER"] as const;
export const propertyConditions = ["MAJOR_REPAIRS", "MODERATE_REPAIRS", "LIGHT_REPAIRS", "MOVE_IN_READY", "UNKNOWN"] as const;
export const sellerOccupancies = ["OWNER_OCCUPIED", "TENANT_OCCUPIED", "VACANT", "OTHER", "UNKNOWN"] as const;
export const sellerQualificationTiers = ["PRIORITY", "REVIEW", "NURTURE", "INELIGIBLE"] as const;
export const sellerInquiryStatuses = ["NEW", "REVIEWING", "CONTACTED", "APPOINTMENT_SET", "CLOSED"] as const;

export type SellerRelationship = typeof sellerRelationships[number];
export type SellerTimeline = typeof sellerTimelines[number];
export type SellerMotivation = typeof sellerMotivations[number];
export type PropertyCondition = typeof propertyConditions[number];
export type SellerOccupancy = typeof sellerOccupancies[number];
export type SellerQualificationTier = typeof sellerQualificationTiers[number];
export type SellerInquiryStatus = typeof sellerInquiryStatuses[number];

export interface SellerIntakeInput {
  submissionId: string;
  startedAt: string;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  propertyAddress: string;
  county: "MARICOPA" | "PINAL" | "OTHER_ARIZONA" | "OUTSIDE_ARIZONA" | "UNKNOWN";
  apn?: string | undefined;
  relationship: SellerRelationship;
  timeline: SellerTimeline;
  motivation: SellerMotivation;
  condition: PropertyCondition;
  occupancy: SellerOccupancy;
  askingPrice?: number | undefined;
  mortgageBalance?: number | undefined;
  notes?: string | undefined;
  consentEmail: boolean;
  consentCall: boolean;
  consentText: boolean;
  privacyAccepted: true;
  companyWebsite?: string | undefined;
}

export interface SellerQualification {
  modelVersion: "seller-intake-v1";
  score: number;
  tier: SellerQualificationTier;
  reasonCodes: string[];
  reviewFlags: string[];
  eligibleForBooking: boolean;
  summary: string;
}

export interface SellerInquiry extends Omit<SellerIntakeInput, "startedAt" | "companyWebsite"> {
  id: string;
  submittedAt: string;
  status: SellerInquiryStatus;
  qualification: SellerQualification;
  bookingUrl?: string;
  deliveryStatuses: Array<{ kind: "SELLER_ACKNOWLEDGEMENT" | "OPERATOR_NOTIFICATION"; status: "SENT" | "SKIPPED" | "FAILED"; providerMessageId?: string | undefined }>;
}
