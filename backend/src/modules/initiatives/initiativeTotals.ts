import {
  initiativeStageKeys,
  initiativeFinancialKinds,
  InitiativeStageMap,
  InitiativeRecord,
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

export const buildInitiativeTotals = (record: InitiativeRecord): InitiativeTotals => {
  const recurringBenefits = sumFinancialEntries(record.stages, 'recurring-benefits');
  const recurringCosts = sumFinancialEntries(record.stages, 'recurring-costs');
  const oneoffBenefits = sumFinancialEntries(record.stages, 'oneoff-benefits');
  const oneoffCosts = sumFinancialEntries(record.stages, 'oneoff-costs');
  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};
