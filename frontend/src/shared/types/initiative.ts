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
  lineCode: string | null;
  distribution: Record<string, number>;
  actuals: Record<string, number>;
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
  valueStepTaskId: string | null;
  additionalCommentary: string;
  calculationLogic: Record<InitiativeFinancialKind, string>;
  businessCaseFiles: InitiativeBusinessCaseFile[];
  supportingDocs: InitiativeSupportingDocument[];
  kpis: InitiativeStageKPI[];
}

export type InitiativeStageMap = Record<InitiativeStageKey, InitiativeStageData>;

export type InitiativeStageStatus = 'draft' | 'pending' | 'approved' | 'returned' | 'rejected';

export interface InitiativeStageState {
  status: InitiativeStageStatus;
  roundIndex: number;
  comment?: string | null;
}

export type InitiativeStageStateMap = Record<InitiativeStageKey, InitiativeStageState>;

export type InitiativePlanCapacityMode = 'fixed' | 'variable';

export interface InitiativePlanCapacitySegment {
  id: string;
  startDate: string;
  endDate: string;
  capacity: number;
}

export interface InitiativePlanTask {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  responsible: string;
  progress: number;
  requiredCapacity: number | null;
  capacityMode: InitiativePlanCapacityMode;
  capacitySegments: InitiativePlanCapacitySegment[];
  indent: number;
  color: string | null;
  milestoneType: string | null;
  baseline?: InitiativePlanBaseline | null;
  sourceTaskId?: string | null;
  archived?: boolean;
}

export interface InitiativePlanSettings {
  zoomLevel: number;
  splitRatio: number;
}

export interface InitiativePlanModel {
  tasks: InitiativePlanTask[];
  settings: InitiativePlanSettings;
  actuals?: InitiativePlanActualsModel | null;
}

export interface InitiativePlanBaseline {
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  responsible: string;
  milestoneType: string | null;
  requiredCapacity: number | null;
}

export interface InitiativePlanActualTask extends InitiativePlanTask {
  baseline: InitiativePlanBaseline | null;
  sourceTaskId: string | null;
  archived: boolean;
}

export interface InitiativePlanActualsModel {
  tasks: InitiativePlanActualTask[];
  settings: InitiativePlanSettings;
}

export type InitiativeStatusReportSource = 'auto' | 'manual';

export interface InitiativeStatusReportEntry {
  id: string;
  taskId: string;
  name: string;
  description: string;
  responsible: string;
  startDate: string | null;
  endDate: string | null;
  statusUpdate: string;
  source: InitiativeStatusReportSource;
}

export interface InitiativeStatusReport {
  id: string;
  initiativeId: string;
  createdAt: string;
  createdByAccountId: string | null;
  createdByName: string | null;
  planVersion: number | null;
  summary: string;
  entries: InitiativeStatusReportEntry[];
}

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
  resolvedAt: string | null;
  resolvedByAccountId: string | null;
  resolvedByName: string | null;
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
  plan: InitiativePlanModel;
}

export interface InitiativeDraft extends Initiative {}

export interface InitiativeBusinessCaseFile {
  id: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  dataUrl: string;
  uploadedAt: string;
}

export interface InitiativeSupportingDocument {
  id: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  dataUrl: string;
  uploadedAt: string;
  comment: string;
}

export interface InitiativeStageKPI {
  id: string;
  name: string;
  unit: string;
  source: string;
  isCustom: boolean;
  baseline: number | null;
  distribution: Record<string, number>;
  actuals: Record<string, number>;
}

