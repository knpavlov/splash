import type { InitiativeStageKey } from './initiatives.types.js';

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

