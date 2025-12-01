import {
  initiativeStageKeys,
  initiativeFinancialKinds,
  InitiativeStageMap,
  InitiativeFinancialSummary,
  InitiativeTotals
} from './initiatives.types.js';

const sumFinancialEntries = (stages: InitiativeStageMap, kind: (typeof initiativeFinancialKinds)[number]) => {
  let total = 0;
  for (const stageKey of initiativeStageKeys) {
    const entries = stages[stageKey].financials[kind];
    for (const entry of entries) {
      for (const value of Object.values(entry.distribution)) {
        if (Number.isFinite(value)) {
          total += value;
        }
      }
    }
  }
  return total;
};

const buildTotals = (stages: InitiativeStageMap): InitiativeTotals => {
  const recurringBenefits = sumFinancialEntries(stages, 'recurring-benefits');
  const recurringCosts = sumFinancialEntries(stages, 'recurring-costs');
  const oneoffBenefits = sumFinancialEntries(stages, 'oneoff-benefits');
  const oneoffCosts = sumFinancialEntries(stages, 'oneoff-costs');
  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};

export const buildInitiativeTotals = (record: { stages: InitiativeStageMap }): InitiativeTotals =>
  buildTotals(record.stages);

export const calculateRoiFromTotals = (totals: InitiativeTotals): number | null => {
  if (!Number.isFinite(totals.recurringCosts) || totals.recurringCosts === 0) {
    return null;
  }
  const roi = totals.recurringImpact / totals.recurringCosts;
  return Number.isFinite(roi) ? roi : null;
};

export const buildInitiativeFinancialSummary = (record: { stages: InitiativeStageMap }): InitiativeFinancialSummary => {
  const totals = buildTotals(record.stages);
  return {
    roi: calculateRoiFromTotals(totals)
  };
};
