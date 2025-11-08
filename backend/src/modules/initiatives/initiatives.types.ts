export const initiativeStageKeys = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'] as const;
export type InitiativeStageKey = (typeof initiativeStageKeys)[number];

export const initiativeFinancialKinds = [
  'recurring-benefits',
  'recurring-costs',
  'oneoff-benefits',
  'oneoff-costs'
] as const;
export type InitiativeFinancialKind = (typeof initiativeFinancialKinds)[number];

export interface InitiativeFinancialEntry {
  id: string;
  label: string;
  category: string;
  distribution: Record<string, number>;
}

export type InitiativeStageFinancials = Record<InitiativeFinancialKind, InitiativeFinancialEntry[]>;

export interface InitiativeStagePayload {
  name: string;
  description: string;
  periodMonth: number | null;
  periodYear: number | null;
  l4Date?: string | null;
  financials: InitiativeStageFinancials;
}

export type InitiativeStageMap = Record<InitiativeStageKey, InitiativeStagePayload>;

export interface InitiativeRow {
  id: string;
  workstream_id: string;
  name: string;
  description: string | null;
  owner_account_id: string | null;
  owner_name: string | null;
  current_status: string;
  active_stage: string;
  l4_date: Date | null;
  stage_payload: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface InitiativeRecord {
  id: string;
  workstreamId: string;
  name: string;
  description: string;
  ownerAccountId: string | null;
  ownerName: string | null;
  currentStatus: string;
  activeStage: InitiativeStageKey;
  l4Date: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  stages: InitiativeStageMap;
}

export interface InitiativeWriteModel {
  id: string;
  workstreamId: string;
  name: string;
  description: string;
  ownerAccountId: string | null;
  ownerName: string | null;
  currentStatus: string;
  activeStage: InitiativeStageKey;
  l4Date: string | null;
  stages: InitiativeStageMap;
}

export interface InitiativeTotals {
  recurringBenefits: number;
  recurringCosts: number;
  oneoffBenefits: number;
  oneoffCosts: number;
  recurringImpact: number;
}

export interface InitiativeResponse extends InitiativeRecord {
  totals: InitiativeTotals;
}
