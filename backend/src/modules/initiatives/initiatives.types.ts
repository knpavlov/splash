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

export type InitiativeStageStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';

export interface InitiativeStageState {
  status: InitiativeStageStatus;
  roundIndex: number;
  comment?: string | null;
}

export type InitiativeStageStateMap = Record<InitiativeStageKey, InitiativeStageState>;

export interface InitiativeRow extends Record<string, unknown> {
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
  stage_state: unknown;
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
  stageState: InitiativeStageStateMap;
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
  stageState: InitiativeStageStateMap;
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

export interface InitiativeApprovalRow extends Record<string, unknown> {
  id: string;
  initiative_id: string;
  stage_key: string;
  round_index: number;
  role: string;
  rule: string;
  account_id: string | null;
  status: string;
  comment: string | null;
  created_at: Date;
  decided_at: Date | null;
}

export type ApprovalDecision = 'approve' | 'return' | 'reject';

export type InitiativeApprovalRule = 'any' | 'all' | 'majority';

export interface InitiativeApprovalRecord {
  id: string;
  initiativeId: string;
  stageKey: InitiativeStageKey;
  roundIndex: number;
  role: string;
  rule: InitiativeApprovalRule;
  accountId: string | null;
  status: 'pending' | 'approved' | 'returned' | 'rejected';
  comment: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface InitiativeApprovalTask {
  id: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  stageKey: InitiativeStageKey;
  roundIndex: number;
  roundCount: number;
  role: string;
  rule: InitiativeApprovalRule;
  status: 'pending' | 'approved' | 'returned' | 'rejected';
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
  requestedAt: string;
  decidedAt: string | null;
  ownerName: string | null;
  ownerAccountId: string | null;
  stage: InitiativeStagePayload;
  stageState: InitiativeStageState;
  totals: InitiativeTotals;
  workstreamDescription: string | null;
  roleTotal: number;
  roleApproved: number;
  rolePending: number;
}
