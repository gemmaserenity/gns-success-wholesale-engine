import type { DecisionReason, NormalizedLead, UnderwritingScenario } from "../opportunities/types";

export function evaluateDealKillers(lead: NormalizedLead, base: UnderwritingScenario, now = new Date()): DecisionReason[] {
  const reasons: DecisionReason[] = [];
  if (lead.ownerMismatch) reasons.push({ code: "REJECT_OWNER_MISMATCH", severity: "REJECT", message: "The distress record owner does not match the resolved owner." });
  if (lead.ownerConfidence < 0.5) reasons.push({ code: "REJECT_OWNER_UNRESOLVED", severity: "REJECT", message: "Owner resolution confidence is below 50%." });
  if (base.estimatedEquity <= 0) reasons.push({ code: "REJECT_LOW_EQUITY", severity: "REJECT", message: "Estimated debt and liens consume the estimated property value." });
  if (base.expectedAssignmentFee < 0) reasons.push({ code: "REJECT_NEGATIVE_SPREAD", severity: "REJECT", message: "The base-case investor ceiling is below the estimated contract price." });
  else if (base.expectedAssignmentFee < 10_000) reasons.push({ code: "REJECT_ASSIGNMENT_BELOW_TARGET", severity: "REJECT", message: "Base-case assignment is below the $10,000 target." });
  if (lead.dataConfidence < 0.55) reasons.push({ code: "REVIEW_DATA_CONFIDENCE", severity: "REVIEW", message: "Evidence confidence is too low for contact-ready status." });
  if (lead.titleComplexity) reasons.push({ code: "REVIEW_TITLE_COMPLEXITY", severity: "REVIEW", message: "Known title complexity requires human verification." });
  if (lead.trusteeSaleDate) {
    const days = Math.ceil((new Date(`${lead.trusteeSaleDate}T12:00:00Z`).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) reasons.push({ code: "REJECT_SALE_DATE_PASSED", severity: "REJECT", message: "The recorded trustee-sale date has passed." });
    else if (days < 7) reasons.push({ code: "REJECT_TIMELINE_TOO_SHORT", severity: "REJECT", message: "Fewer than seven days remain before the trustee sale." });
  }
  if (!reasons.some((reason) => reason.severity === "REJECT") && base.expectedAssignmentFee >= 10_000) {
    reasons.push({ code: "PASS_ASSIGNMENT_TARGET", severity: "POSITIVE", message: "Base-case assignment meets the $10,000 target." });
  }
  return reasons;
}
