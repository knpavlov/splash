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
  lineCode: string | null;
  distribution: Record<string, number>;
  actuals: Record<string, number>;
}

export type InitiativeStageFinancials = Record<InitiativeFinancialKind, InitiativeFinancialEntry[]>;

export interface InitiativeStagePayload {
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

export type InitiativeStageMap = Record<InitiativeStageKey, InitiativeStagePayload>;

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
  plan_payload: unknown;
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
  plan: InitiativePlanModel;
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
  plan: InitiativePlanModel;
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
  entries: InitiativeStatusReportEntry[];
}

export interface InitiativeStatusReportRow extends Record<string, unknown> {
  id: string;
  initiative_id: string;
  entries: unknown;
  plan_version: number | null;
  created_at: Date;
  created_by_account_id: string | null;
  created_by_name: string | null;
}

export interface InitiativeCommentSelection {
  top: number;
  left: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
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

export interface InitiativeCommentThreadRow extends Record<string, unknown> {
  id: string;
  initiative_id: string;
  stage_key: string | null;
  target_id: string;
  target_label: string | null;
  target_path: string | null;
  selection: unknown;
  created_at: Date;
  created_by_account_id: string | null;
  created_by_name: string | null;
  resolved_at: Date | null;
  resolved_by_account_id: string | null;
  resolved_by_name: string | null;
}

export interface InitiativeCommentMessageRow extends Record<string, unknown> {
  id: string;
  thread_id: string;
  parent_id: string | null;
  body: string;
  author_account_id: string | null;
  author_name: string | null;
  created_at: Date;
  updated_at: Date;
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

export interface InitiativeMutationMetadata {
  actorAccountId?: string | null;
  actorName?: string | null;
}

export interface InitiativeEventRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  initiative_id: string;
  event_type: string;
  field: string;
  previous_value: unknown;
  next_value: unknown;
  actor_account_id: string | null;
  actor_name: string | null;
  created_at: Date;
}

export interface InitiativeEventChange {
  field: string;
  previousValue: unknown;
  nextValue: unknown;
}

export interface InitiativeEventRecord {
  id: string;
  eventId: string;
  initiativeId: string;
  eventType: string;
  field: string;
  previousValue: unknown;
  nextValue: unknown;
  actorAccountId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface InitiativeEventTimelineEntry {
  id: string;
  eventType: string;
  createdAt: string;
  actorAccountId: string | null;
  actorName: string | null;
  changes: InitiativeEventChange[];
}
