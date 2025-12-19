import { initiativeStageKeys, type InitiativeStageKey } from './initiative';

export const initiativeFormBlockKeys = [
  'financial-outlook',
  'pnl-actuals',
  'kpis',
  'kpi-actuals',
  'supporting-docs',
  'implementation-plan',
  'implementation-plan-actuals',
  'risks'
] as const;

export type InitiativeFormBlockKey = (typeof initiativeFormBlockKeys)[number];

export type InitiativeFormFieldRequirement = 'hidden' | 'optional' | 'required';

export type InitiativeFormStageSettings = Record<InitiativeFormBlockKey, InitiativeFormFieldRequirement>;

export interface InitiativeFormSettingsMatrix {
  stages: Record<InitiativeStageKey, InitiativeFormStageSettings>;
}

export interface InitiativeFormSettingsPayload extends InitiativeFormSettingsMatrix {
  updatedAt: string;
}

export const initiativeFormBlocks: Array<{
  key: InitiativeFormBlockKey;
  label: string;
  submitHint: string;
}> = [
  { key: 'financial-outlook', label: 'Financial outlook', submitHint: 'Add at least one financial line item.' },
  { key: 'pnl-actuals', label: 'P&L actuals', submitHint: 'Add at least one actual entry.' },
  { key: 'kpis', label: 'KPIs', submitHint: 'Add at least one KPI plan value.' },
  { key: 'kpi-actuals', label: 'KPI actuals', submitHint: 'Add at least one KPI actual value.' },
  { key: 'supporting-docs', label: 'Supporting documentation', submitHint: 'Upload at least one supporting document.' },
  { key: 'implementation-plan', label: 'Implementation plan', submitHint: 'Add at least one plan task.' },
  {
    key: 'implementation-plan-actuals',
    label: 'Implementation plan – actuals',
    submitHint: 'Add at least one actual task entry.'
  },
  { key: 'risks', label: 'Risks', submitHint: 'Add at least one risk.' }
];

export const createDefaultInitiativeFormSettingsMatrix = (): InitiativeFormSettingsMatrix => ({
  stages: initiativeStageKeys.reduce((acc, stageKey) => {
    acc[stageKey] = initiativeFormBlockKeys.reduce((blocks, blockKey) => {
      blocks[blockKey] = 'optional';
      return blocks;
    }, {} as InitiativeFormStageSettings);
    return acc;
  }, {} as InitiativeFormSettingsMatrix['stages'])
});

