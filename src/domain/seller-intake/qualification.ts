import type { SellerIntakeInput, SellerQualification } from "./types";

export function qualifySellerIntake(input: SellerIntakeInput): SellerQualification {
  let score = 0;
  const reasonCodes: string[] = [];
  const reviewFlags: string[] = [];

  if (input.county === "MARICOPA" || input.county === "PINAL") {
    score += 25;
    reasonCodes.push("TARGET_COUNTY");
  } else if (input.county === "OTHER_ARIZONA") {
    score += 8;
    reviewFlags.push("OUTSIDE_CURRENT_COUNTIES");
  } else {
    reviewFlags.push(input.county === "OUTSIDE_ARIZONA" ? "OUTSIDE_ARIZONA" : "COUNTY_UNVERIFIED");
  }

  if (input.relationship === "OWNER" || input.relationship === "CO_OWNER") {
    score += 20;
    reasonCodes.push("OWNER_AUTHORITY_REPORTED");
  } else if (input.relationship === "AUTHORIZED_REPRESENTATIVE") {
    score += 10;
    reviewFlags.push("REPRESENTATIVE_AUTHORITY_REQUIRES_VERIFICATION");
  } else {
    reviewFlags.push("OWNER_AUTHORITY_UNCLEAR");
  }

  const timelinePoints = { "0_30_DAYS": 20, "31_60_DAYS": 15, "61_90_DAYS": 8, "OVER_90_DAYS": 3, UNSURE: 2 } as const;
  score += timelinePoints[input.timeline];
  reasonCodes.push(`TIMELINE_${input.timeline}`);

  if (input.motivation === "OTHER") score += 5;
  else {
    score += 15;
    reasonCodes.push(`MOTIVATION_${input.motivation}`);
  }

  const conditionPoints = { MAJOR_REPAIRS: 15, MODERATE_REPAIRS: 10, LIGHT_REPAIRS: 5, MOVE_IN_READY: 1, UNKNOWN: 0 } as const;
  score += conditionPoints[input.condition];
  if (input.condition === "UNKNOWN") reviewFlags.push("CONDITION_UNVERIFIED");
  else reasonCodes.push(`CONDITION_${input.condition}`);

  const completeness = [input.apn, input.askingPrice, input.mortgageBalance, input.notes].filter((value) => value !== undefined).length;
  score += Math.min(5, completeness + (input.email && input.phone ? 1 : 0));
  if (input.askingPrice === undefined) reviewFlags.push("ASKING_PRICE_NOT_PROVIDED");
  if (input.mortgageBalance === undefined) reviewFlags.push("MORTGAGE_BALANCE_NOT_PROVIDED");

  const ineligible = input.county === "OUTSIDE_ARIZONA";
  const tier = ineligible ? "INELIGIBLE" : score >= 70 ? "PRIORITY" : score >= 45 ? "REVIEW" : "NURTURE";
  const eligibleForBooking = !ineligible && (tier === "PRIORITY" || tier === "REVIEW");
  const summary = `${input.relationship.replaceAll("_", " ").toLowerCase()} reported a ${input.condition.replaceAll("_", " ").toLowerCase()} property in ${input.county.replaceAll("_", " ").toLowerCase()} with a ${input.timeline.replaceAll("_", " ").toLowerCase()} timeline.`;

  return { modelVersion: "seller-intake-v1", score: Math.min(100, score), tier, reasonCodes, reviewFlags, eligibleForBooking, summary };
}

