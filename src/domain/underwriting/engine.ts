import type { NormalizedLead, UnderwritingScenario } from "../opportunities/types";

export interface UnderwritingConfig {
  investorPurchaseFactor: number;
  transactionRiskBuffer: number;
  desiredAssignmentFee: number;
  minimumSellerNetAboveDebt: number;
}

export const defaultUnderwritingConfig: UnderwritingConfig = {
  investorPurchaseFactor: 0.78,
  transactionRiskBuffer: 12_000,
  desiredAssignmentFee: 10_000,
  minimumSellerNetAboveDebt: 5_000,
};

const money = (value: number): number => Math.round(value);

export function underwrite(
  lead: NormalizedLead,
  config: UnderwritingConfig = defaultUnderwritingConfig,
): UnderwritingScenario[] {
  const liens = lead.liens ?? 0;
  const baseArv = (lead.arvLow + lead.arvHigh) / 2;
  const baseRepairs = (lead.repairsLow + lead.repairsHigh) / 2;
  const baseDebt = (lead.debtLow + lead.debtHigh) / 2;
  const inputs = [
    ["DOWNSIDE", lead.arvLow, lead.repairsHigh, lead.debtHigh],
    ["BASE", baseArv, baseRepairs, baseDebt],
    ["UPSIDE", lead.arvHigh, lead.repairsLow, lead.debtLow],
  ] as const;

  return inputs.map(([name, arv, repairs, debt]) => {
    const investorPurchaseCeiling = arv * config.investorPurchaseFactor - repairs - config.transactionRiskBuffer;
    const debtFloor = debt + liens + config.minimumSellerNetAboveDebt;
    const estimatedContractPrice = lead.proposedContractPrice ?? debtFloor;
    return {
      name,
      arv: money(arv),
      repairs: money(repairs),
      estimatedDebt: money(debt + liens),
      investorPurchaseCeiling: money(investorPurchaseCeiling),
      estimatedContractPrice: money(estimatedContractPrice),
      maximumContractForTargetFee: money(investorPurchaseCeiling - config.desiredAssignmentFee),
      expectedAssignmentFee: money(investorPurchaseCeiling - estimatedContractPrice),
      estimatedEquity: money(arv - debt - liens),
    };
  });
}
