import { normalizeLead } from "../opportunities/normalize";
import type { OpportunityEvaluation, RawLeadInput } from "../opportunities/types";
import { defaultUnderwritingConfig, underwrite } from "../underwriting/engine";
import type { BuyerProfile, BuyerPropertyType } from "./types";
import type {
  BuyerCriterionResult,
  BuyerDemandAnalysis,
  BuyerMatchBuildInput,
  BuyerMatchClassification,
  BuyerMatchProperty,
  BuyerMatchResult,
} from "./matching-types";

const criterionWeights = {
  county: 15,
  zip: 10,
  propertyType: 15,
  purchasePrice: 15,
  arv: 10,
  repairs: 10,
  squareFeet: 7,
  yearBuilt: 6,
  occupancy: 5,
  hoa: 3,
  timeline: 4,
} as const;

const clamp = (value: number, minimum = 0, maximum = 100): number => Math.min(maximum, Math.max(minimum, value));

function normalizedToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeBuyerPropertyType(value: string | undefined): BuyerPropertyType | undefined {
  if (!value) return undefined;
  const token = normalizedToken(value);
  if (["SFR", "SINGLEFAMILY", "SINGLEFAMILYRESIDENCE", "SINGLEFAMILYHOME"].includes(token)) return "SFR";
  if (["CONDO", "CONDOMINIUM"].includes(token)) return "CONDO";
  if (["TOWNHOUSE", "TOWNHOME"].includes(token)) return "TOWNHOUSE";
  if (["MULTIFAMILY", "DUPLEX", "TRIPLEX", "FOURPLEX", "APARTMENT"].includes(token)) return "MULTIFAMILY";
  if (["MOBILEHOME", "MANUFACTUREDHOME", "MANUFACTUREDHOUSING"].includes(token)) return "MOBILE_HOME";
  if (["LAND", "VACANTLAND", "LOT"].includes(token)) return "LAND";
  return undefined;
}

function normalizeOccupancy(value: string | undefined): BuyerMatchProperty["occupancy"] {
  if (!value) return undefined;
  const token = normalizedToken(value);
  if (["VACANT", "UNOCCUPIED"].includes(token)) return "VACANT";
  if (["TENANTOCCUPIED", "TENANT", "RENTED", "RENTAL"].includes(token)) return "TENANT_OCCUPIED";
  if (["OWNEROCCUPIED", "OWNER"].includes(token)) return "OWNER_OCCUPIED";
  return undefined;
}

function normalizeHoa(value: string | boolean | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (!value) return undefined;
  const token = normalizedToken(value);
  if (["YES", "TRUE", "HAS", "HAS HOA", "HOA"].map(normalizedToken).includes(token)) return true;
  if (["NO", "FALSE", "NONE", "NO HOA"].map(normalizedToken).includes(token)) return false;
  return undefined;
}

function factValue(input: BuyerMatchBuildInput, field: string): string | number | boolean | undefined {
  return input.propertyFacts?.find((fact) => fact.field === field)?.value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function daysUntil(date: string | undefined, now: Date): number | undefined {
  if (!date) return undefined;
  return Math.ceil((new Date(`${date}T12:00:00Z`).getTime() - now.getTime()) / 86_400_000);
}

export function buildBuyerMatchProperty(input: BuyerMatchBuildInput): BuyerMatchProperty {
  const now = input.now ?? new Date();
  const lead = normalizeLead(input.rawInput, now);
  const base = underwrite(lead)[1];
  if (!base) throw new Error("Base underwriting scenario was not produced");
  const addressZip = lead.address.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  const propertyTypeValue = factValue(input, "propertyType") ?? lead.propertyType;
  const squareFeetValue = factValue(input, "squareFeet") ?? lead.squareFeet;
  const yearBuiltValue = factValue(input, "yearBuilt") ?? lead.yearBuilt;
  const occupancyValue = factValue(input, "occupancy") ?? lead.occupancy;
  const hoaValue = factValue(input, "hoaStatus") ?? lead.hoaStatus;
  const normalizedPropertyType = normalizeBuyerPropertyType(typeof propertyTypeValue === "string" ? propertyTypeValue : undefined);
  const normalizedOccupancy = normalizeOccupancy(typeof occupancyValue === "string" ? occupancyValue : undefined);
  const normalizedHoa = normalizeHoa(typeof hoaValue === "string" || typeof hoaValue === "boolean" ? hoaValue : undefined);
  const deadlineDays = daysUntil(lead.trusteeSaleDate, now);
  return {
    county: lead.county,
    ...(addressZip ? { zip: addressZip } : {}),
    ...(normalizedPropertyType ? { propertyType: normalizedPropertyType } : {}),
    buyerAcquisitionPrice: base.estimatedContractPrice + defaultUnderwritingConfig.desiredAssignmentFee,
    arv: base.arv,
    repairs: base.repairs,
    ...(optionalNumber(squareFeetValue) !== undefined ? { squareFeet: Number(squareFeetValue) } : {}),
    ...(optionalNumber(yearBuiltValue) !== undefined ? { yearBuilt: Number(yearBuiltValue) } : {}),
    ...(normalizedOccupancy ? { occupancy: normalizedOccupancy } : {}),
    ...(normalizedHoa !== undefined ? { hasHoa: normalizedHoa } : {}),
    ...(deadlineDays !== undefined ? { daysToDeadline: deadlineDays } : {}),
  };
}

function criterion(
  name: keyof typeof criterionWeights,
  outcome: BuyerCriterionResult["outcome"],
  reasonCode: string,
  detail: string,
): BuyerCriterionResult {
  return { criterion: name, outcome, weight: criterionWeights[name], reasonCode, detail };
}

function rangeCriterion(
  name: "purchasePrice" | "arv" | "squareFeet" | "yearBuilt",
  value: number | undefined,
  minimum: number | undefined,
  maximum: number | undefined,
): BuyerCriterionResult {
  const reasonToken = name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
  if (minimum === undefined && maximum === undefined) {
    return criterion(name, "NOT_APPLICABLE", `MATCH_${reasonToken}_UNRESTRICTED`, `${name} is unrestricted.`);
  }
  if (value === undefined) return criterion(name, "UNKNOWN", `UNKNOWN_${reasonToken}`, `${name} evidence is missing.`);
  if ((minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) {
    return criterion(name, "MISMATCH", `MISMATCH_${reasonToken}`, `${name} ${value} is outside the buyer range.`);
  }
  return criterion(name, "MATCH", `MATCH_${reasonToken}`, `${name} ${value} is within the buyer range.`);
}

export function buyerCredibilityScore(buyer: BuyerProfile): number {
  if (buyer.status !== "ACTIVE" || !["RELATIONSHIP", "OPTED_IN"].includes(buyer.contactStatus)) return 0;
  const contactEvidence = buyer.contactStatus === "RELATIONSHIP" ? 25 : 20;
  const observed = clamp(
    contactEvidence
    + Math.min(30, buyer.verifiedPurchaseCount * 3)
    + Math.min(35, buyer.gnsClosingCount * 12)
    - Math.min(40, buyer.retradeCount * 15),
  );
  return buyer.reliabilityScore === undefined
    ? Math.round(observed)
    : Math.round((buyer.reliabilityScore * 0.6) + (observed * 0.4));
}

export function matchBuyer(property: BuyerMatchProperty, buyer: BuyerProfile): BuyerMatchResult {
  const criteria: BuyerCriterionResult[] = [];
  criteria.push(buyer.criteria.preferredCounties.includes(property.county)
    ? criterion("county", "MATCH", "MATCH_COUNTY", `${property.county} is in the buyer's markets.`)
    : criterion("county", "MISMATCH", "MISMATCH_COUNTY", `${property.county} is outside the buyer's markets.`));

  if (buyer.criteria.preferredZips.length === 0) {
    criteria.push(criterion("zip", "NOT_APPLICABLE", "MATCH_ZIP_UNRESTRICTED", "ZIP is unrestricted inside the selected counties."));
  } else if (!property.zip) {
    criteria.push(criterion("zip", "UNKNOWN", "UNKNOWN_ZIP", "A five-digit property ZIP is unavailable."));
  } else {
    criteria.push(buyer.criteria.preferredZips.includes(property.zip)
      ? criterion("zip", "MATCH", "MATCH_ZIP", `${property.zip} is in the preferred ZIP list.`)
      : criterion("zip", "MISMATCH", "MISMATCH_ZIP", `${property.zip} is outside the preferred ZIP list.`));
  }

  if (!property.propertyType) {
    criteria.push(criterion("propertyType", "UNKNOWN", "UNKNOWN_PROPERTY_TYPE", "Property type evidence is missing or unsupported."));
  } else {
    criteria.push(buyer.criteria.propertyTypes.includes(property.propertyType)
      ? criterion("propertyType", "MATCH", "MATCH_PROPERTY_TYPE", `${property.propertyType} is accepted.`)
      : criterion("propertyType", "MISMATCH", "MISMATCH_PROPERTY_TYPE", `${property.propertyType} is not accepted.`));
  }

  criteria.push(rangeCriterion("purchasePrice", property.buyerAcquisitionPrice, buyer.criteria.purchasePriceMin, buyer.criteria.purchasePriceMax));
  criteria.push(rangeCriterion("arv", property.arv, buyer.criteria.arvMin, buyer.criteria.arvMax));
  criteria.push(property.repairs <= (buyer.criteria.maxRepairs ?? Number.POSITIVE_INFINITY)
    ? criterion("repairs", buyer.criteria.maxRepairs === undefined ? "NOT_APPLICABLE" : "MATCH", buyer.criteria.maxRepairs === undefined ? "MATCH_REPAIRS_UNRESTRICTED" : "MATCH_REPAIRS", `Repairs are ${buyer.criteria.maxRepairs === undefined ? "unrestricted" : "within tolerance"}.`)
    : criterion("repairs", "MISMATCH", "MISMATCH_REPAIRS", `Estimated repairs ${property.repairs} exceed the buyer's maximum.`));
  criteria.push(rangeCriterion("squareFeet", property.squareFeet, buyer.criteria.squareFeetMin, buyer.criteria.squareFeetMax));
  criteria.push(rangeCriterion("yearBuilt", property.yearBuilt, buyer.criteria.yearBuiltMin, buyer.criteria.yearBuiltMax));

  if (buyer.criteria.occupancies.includes("ANY")) {
    criteria.push(criterion("occupancy", "NOT_APPLICABLE", "MATCH_OCCUPANCY_ANY", "The buyer accepts any occupancy."));
  } else if (!property.occupancy) {
    criteria.push(criterion("occupancy", "UNKNOWN", "UNKNOWN_OCCUPANCY", "Occupancy evidence is missing."));
  } else {
    criteria.push(buyer.criteria.occupancies.includes(property.occupancy)
      ? criterion("occupancy", "MATCH", "MATCH_OCCUPANCY", `${property.occupancy} is accepted.`)
      : criterion("occupancy", "MISMATCH", "MISMATCH_OCCUPANCY", `${property.occupancy} is not accepted.`));
  }

  if (buyer.criteria.hoaPreference !== "AVOID") {
    criteria.push(criterion("hoa", "NOT_APPLICABLE", "MATCH_HOA_ALLOWED", "The buyer does not exclude HOA properties."));
  } else if (property.hasHoa === undefined) {
    criteria.push(criterion("hoa", "UNKNOWN", "UNKNOWN_HOA", "HOA status is missing."));
  } else {
    criteria.push(property.hasHoa
      ? criterion("hoa", "MISMATCH", "MISMATCH_HOA", "The property has an HOA and the buyer avoids HOAs.")
      : criterion("hoa", "MATCH", "MATCH_HOA", "The property has no HOA."));
  }

  if (buyer.criteria.closeSpeedDays === undefined) {
    criteria.push(criterion("timeline", "NOT_APPLICABLE", "MATCH_TIMELINE_UNRESTRICTED", "Close speed is not recorded."));
  } else if (property.daysToDeadline === undefined) {
    criteria.push(criterion("timeline", "UNKNOWN", "UNKNOWN_TIMELINE", "No execution deadline is available."));
  } else {
    criteria.push(buyer.criteria.closeSpeedDays <= property.daysToDeadline
      ? criterion("timeline", "MATCH", "MATCH_TIMELINE", `Buyer close speed fits within ${property.daysToDeadline} days.`)
      : criterion("timeline", "MISMATCH", "MISMATCH_TIMELINE", `Buyer needs ${buyer.criteria.closeSpeedDays} days but only ${property.daysToDeadline} remain.`));
  }

  const credibilityScore = buyerCredibilityScore(buyer);
  const eligible = buyer.status === "ACTIVE" && ["RELATIONSHIP", "OPTED_IN"].includes(buyer.contactStatus);
  const applicable = criteria.filter((item) => item.outcome !== "NOT_APPLICABLE");
  const earned = applicable.reduce((sum, item) => sum + item.weight * (item.outcome === "MATCH" ? 1 : item.outcome === "UNKNOWN" ? 0.5 : 0), 0);
  const possible = applicable.reduce((sum, item) => sum + item.weight, 0);
  const fitScore = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const hasMismatch = criteria.some((item) => item.outcome === "MISMATCH");
  const hasUnknown = criteria.some((item) => item.outcome === "UNKNOWN");
  let classification: BuyerMatchClassification = "POSSIBLE";
  if (!eligible) classification = "INELIGIBLE";
  else if (hasMismatch) classification = "EXCLUDED";
  else if (!hasUnknown && credibilityScore >= 50) classification = "PROBABLE";

  const reasonCodes = criteria.filter((item) => item.outcome === "MISMATCH" || item.outcome === "UNKNOWN").map((item) => item.reasonCode);
  if (!eligible) reasonCodes.unshift("BUYER_NOT_CONTACT_ELIGIBLE");
  else if (classification === "PROBABLE") reasonCodes.unshift("MATCH_PROBABLE");
  else if (credibilityScore < 50) reasonCodes.unshift("BUYER_CREDIBILITY_BELOW_PROBABLE");
  else reasonCodes.unshift("MATCH_POSSIBLE_MISSING_EVIDENCE");

  return {
    buyerId: buyer.id,
    buyerName: buyer.displayName,
    classification,
    fitScore,
    credibilityScore,
    reasonCodes,
    criteria,
    buyerSnapshot: buyer,
  };
}

function breadthScore(probableBuyerCount: number): number {
  return [0, 38, 58, 72, 82, 90, 95, 98, 100][Math.min(8, probableBuyerCount)] ?? 100;
}

export function analyzeBuyerDemand(
  property: BuyerMatchProperty,
  buyers: BuyerProfile[],
  options: { buyerPoolTruncated?: boolean } = {},
): BuyerDemandAnalysis {
  const matches = buyers.map((buyer) => matchBuyer(property, buyer)).sort((left, right) => {
    const rank = { PROBABLE: 0, POSSIBLE: 1, EXCLUDED: 2, INELIGIBLE: 3 } as const;
    return rank[left.classification] - rank[right.classification]
      || right.fitScore - left.fitScore
      || right.credibilityScore - left.credibilityScore
      || left.buyerName.localeCompare(right.buyerName);
  });
  const probable = matches.filter((match) => match.classification === "PROBABLE");
  const possible = matches.filter((match) => match.classification === "POSSIBLE");
  const eligible = matches.filter((match) => match.classification !== "INELIGIBLE");
  const averageQuality = probable.length === 0 ? 0 : probable.reduce(
    (sum, match) => sum + ((match.fitScore * 0.65) + (match.credibilityScore * 0.35)),
    0,
  ) / probable.length;
  const buyerDemandScore = probable.length === 0
    ? 0
    : Math.round((breadthScore(probable.length) * 0.7) + (averageQuality * 0.3));
  const reasonCodes = [
    buyers.length === 0 ? "NO_ACTIVE_BUYERS" : undefined,
    buyers.length > 0 && eligible.length === 0 ? "NO_CONTACT_ELIGIBLE_BUYERS" : undefined,
    eligible.length > 0 && probable.length === 0 ? "NO_PROBABLE_BUYERS" : undefined,
    probable.length > 0 ? "PROBABLE_BUYERS_FOUND" : undefined,
    options.buyerPoolTruncated ? "BUYER_POOL_LIMIT_REACHED" : undefined,
  ].filter((value): value is string => Boolean(value));
  return {
    modelVersion: "buyer-demand-v1",
    buyerDemandScore: clamp(buyerDemandScore),
    probableBuyerCount: probable.length,
    possibleBuyerCount: possible.length,
    eligibleBuyerCount: eligible.length,
    evaluatedBuyerCount: buyers.length,
    buyerPoolTruncated: options.buyerPoolTruncated ?? false,
    reasonCodes,
    property,
    matches,
  };
}

export function buildBuyerDemandEvaluation(
  rawInput: RawLeadInput,
  analysis: BuyerDemandAnalysis,
  runId: string,
  now: Date,
  evaluate: (raw: RawLeadInput, evaluationId: string) => OpportunityEvaluation,
  evaluationId: string,
): OpportunityEvaluation {
  const revised = evaluate({
    ...rawInput,
    source: "BUYER_MATCH_MODEL",
    sourceRecordId: runId,
    retrievedAt: now.toISOString(),
    buyerDemandScore: analysis.buyerDemandScore,
  }, evaluationId);
  revised.parserVersion = analysis.modelVersion;
  if (analysis.probableBuyerCount > 0) {
    revised.reasons.push({
      code: "PASS_BUYER_DEMAND_SUPPORTED",
      severity: "POSITIVE",
      message: `${analysis.probableBuyerCount} probable buyer${analysis.probableBuyerCount === 1 ? "" : "s"} support the ${analysis.buyerDemandScore}/100 demand score.`,
    });
  } else {
    revised.reasons.push({
      code: "REVIEW_NO_PROBABLE_BUYERS",
      severity: "REVIEW",
      message: "No active, contact-eligible buyer fully matches the recorded property evidence and buy-box criteria.",
    });
    if (!revised.reasons.some((reason) => reason.severity === "REJECT")) revised.nextAction = "HUMAN_REVIEW";
  }
  return revised;
}
