export const initiativeStageKeys = ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'] as const;
export type InitiativeStageKey = (typeof initiativeStageKeys)[number];

export const initiativeStageLabels: Record<InitiativeStageKey, string> = {
  l0: 'L0 Gate',
  l1: 'L1 Gate',
  l2: 'L2 Gate',
  l3: 'L3 Gate',
  l4: 'L4 Gate',
  l5: 'L5 Gate'
};

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

export interface InitiativeStageData {
  key: InitiativeStageKey;
  name: string;
  description: string;
  periodMonth: number | null;
  periodYear: number | null;
  l4Date?: string | null;
  financials: InitiativeStageFinancials;
}

export type InitiativeStageMap = Record<InitiativeStageKey, InitiativeStageData>;

export type InitiativeStageStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';

export interface InitiativeStageState {
  status: InitiativeStageStatus;
  roundIndex: number;
  comment?: string | null;
}

export type InitiativeStageStateMap = Record<InitiativeStageKey, InitiativeStageState>;

export interface InitiativeCommentSelection {
  top: number;
  left: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface InitiativeCommentMessage {
  id: string;
  threadId: string;
  parentId: string | null;
  body: string;
  authorAccountId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InitiativeCommentThread {
  id: string;
  initiativeId: string;
  stageKey: InitiativeStageKey | null;
  targetId: string;
  targetLabel: string | null;
  targetPath: string | null;
  selection: InitiativeCommentSelection | null;
  createdAt: string;
  createdByAccountId: string | null;
  createdByName: string | null;
  comments: InitiativeCommentMessage[];
}

export interface InitiativeTotals {
  recurringBenefits: number;
  recurringCosts: number;
  oneoffBenefits: number;
  oneoffCosts: number;
  recurringImpact: number;
}

export interface Initiative {
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
  totals: InitiativeTotals;
}

export interface InitiativeDraft extends Initiative {}

export const pnlCategories = [
  'Revenue',
  'COGS',
  'Opex: Rent',
  'Opex: Payroll',
  'Opex: Marketing',
  'Opex: IT',
  'Other'
] as const;

export type PnlCategory = (typeof pnlCategories)[number];
