import { randomUUID, createHash } from 'crypto';
import { ApprovalTaskRow, InitiativesRepository } from './initiatives.repository.js';
import { WorkstreamsRepository } from '../workstreams/workstreams.repository.js';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  InitiativeFinancialKind,
  InitiativeFinancialEntry,
  InitiativeRecord,
  InitiativeResponse,
  InitiativeStageKey,
  InitiativeStageMap,
  InitiativeStagePayload,
  InitiativeStageState,
  InitiativeStageStateMap,
  InitiativeTotals,
  InitiativeWriteModel,
  InitiativeApprovalRecord,
  InitiativeApprovalTask,
  InitiativeApprovalRule,
  ApprovalDecision,
  InitiativeMutationMetadata,
  InitiativeEventTimelineEntry,
  InitiativeCommentThread,
  InitiativeCommentMessage,
  InitiativeCommentSelection,
  InitiativeCommentThreadRow,
  InitiativeCommentMessageRow,
  InitiativeBusinessCaseFile,
  InitiativeSupportingDocument,
  InitiativeStageKPI,
  InitiativeStatusReport,
  InitiativeStatusReportEntry,
  InitiativePlanTask,
  InitiativePlanModel
} from './initiatives.types.js';
import { normalizePlanModel } from './initiativePlan.helpers.js';
import {
  workstreamGateKeys,
  WorkstreamGateKey,
  WorkstreamApprovalRound,
  WorkstreamRoleAssignmentRecord
} from '../workstreams/workstreams.types.js';
import { buildInitiativeTotals } from './initiativeTotals.js';

const sanitizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sanitizeOptionalString = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const hashPayload = (value: string) => createHash('sha1').update(value).digest('hex');

const STATUS_UPDATE_MAX_LENGTH = 2000;
const STATUS_SUMMARY_MAX_LENGTH = 4000;

const normalizeStageKey = (value: unknown): InitiativeStageKey => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (initiativeStageKeys.includes(normalized as InitiativeStageKey)) {
      return normalized as InitiativeStageKey;
    }
  }
  return 'l0';
};

const normalizeStageKeyOrNull = (value: unknown): InitiativeStageKey | null => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (initiativeStageKeys.includes(normalized as InitiativeStageKey)) {
      return normalized as InitiativeStageKey;
    }
  }
  return null;
};

const sanitizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const sanitizeDistribution = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    const numberValue = sanitizeNumber(rawValue);
    if (numberValue !== null) {
      result[key] = numberValue;
    }
  }
  return result;
};

const sanitizeFinancialEntry = (value: unknown): InitiativeFinancialEntry => {
  if (!value || typeof value !== 'object') {
    return {
      id: randomUUID(),
      label: '',
      category: '',
      lineCode: null,
      distribution: {},
      actuals: {}
    };
  }
  const payload = value as {
    id?: unknown;
    label?: unknown;
    category?: unknown;
    lineCode?: unknown;
    distribution?: unknown;
    actuals?: unknown;
  };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const label = sanitizeString(payload.label);
  const category = sanitizeString(payload.category);
  const lineCode = sanitizeOptionalString(payload.lineCode);
  return {
    id,
    label,
    category,
    lineCode,
    distribution: sanitizeDistribution(payload.distribution),
    actuals: sanitizeDistribution(payload.actuals)
  };
};

const sanitizeBusinessCaseFile = (value: unknown): InitiativeBusinessCaseFile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    size?: unknown;
    dataUrl?: unknown;
    uploadedAt?: unknown;
  };
  const fileName = sanitizeString(payload.fileName);
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const mimeType = sanitizeOptionalString(payload.mimeType);
  const size =
    typeof payload.size === 'number' && Number.isFinite(payload.size) ? Math.max(0, Math.trunc(payload.size)) : 0;
  const uploadedAt =
    typeof payload.uploadedAt === 'string' && payload.uploadedAt.trim()
      ? payload.uploadedAt
      : new Date().toISOString();
  return {
    id,
    fileName,
    mimeType,
    size,
    dataUrl,
    uploadedAt
  };
};

const sanitizeSupportingDoc = (value: unknown): InitiativeSupportingDocument | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    size?: unknown;
    dataUrl?: unknown;
    uploadedAt?: unknown;
    comment?: unknown;
  };
  const fileName = sanitizeString(payload.fileName);
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const mimeType = sanitizeOptionalString(payload.mimeType);
  const size =
    typeof payload.size === 'number' && Number.isFinite(payload.size) ? Math.max(0, Math.trunc(payload.size)) : 0;
  const uploadedAt =
    typeof payload.uploadedAt === 'string' && payload.uploadedAt.trim()
      ? payload.uploadedAt
      : new Date().toISOString();
  const comment = sanitizeString(payload.comment);
  return { id, fileName, mimeType, size, dataUrl, uploadedAt, comment };
};

const sanitizeKpi = (value: unknown): InitiativeStageKPI | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
    unit?: unknown;
    source?: unknown;
    isCustom?: unknown;
    baseline?: unknown;
    distribution?: unknown;
    actuals?: unknown;
  };
  const name = sanitizeString(payload.name);
  if (!name) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const unit = sanitizeString(payload.unit);
  const source = sanitizeString(payload.source);
  const isCustom = Boolean(payload.isCustom);
  const baseline =
    typeof payload.baseline === 'number' && Number.isFinite(payload.baseline) ? Number(payload.baseline) : null;
  const distribution = sanitizeDistribution(payload.distribution);
  const actuals = sanitizeDistribution(payload.actuals);
  return { id, name, unit, source, isCustom, baseline, distribution, actuals };
};

const createEmptyStagePayload = (): InitiativeStagePayload => ({
  name: '',
  description: '',
  periodMonth: null,
  periodYear: null,
  l4Date: null,
  valueStepTaskId: null,
  additionalCommentary: '',
  calculationLogic: initiativeFinancialKinds.reduce(
    (acc, kind) => {
      acc[kind] = '';
      return acc;
    },
    {} as InitiativeStagePayload['calculationLogic']
  ),
  businessCaseFiles: [],
  supportingDocs: [],
  kpis: [],
  financials: initiativeFinancialKinds.reduce(
    (acc, kind) => {
      acc[kind] = [];
      return acc;
    },
    {} as InitiativeStagePayload['financials']
  )
});

const sanitizeStage = (value: unknown): InitiativeStagePayload => {
  if (!value || typeof value !== 'object') {
    return createEmptyStagePayload();
  }
  const payload = value as {
    name?: unknown;
    description?: unknown;
    periodMonth?: unknown;
    periodYear?: unknown;
    l4Date?: unknown;
    financials?: unknown;
    valueStepTaskId?: unknown;
    additionalCommentary?: unknown;
    calculationLogic?: unknown;
    businessCaseFiles?: unknown;
    supportingDocs?: unknown;
    kpis?: unknown;
  };
  const result = createEmptyStagePayload();
  result.name = sanitizeString(payload.name);
  result.description = sanitizeString(payload.description);
  const month = sanitizeNumber(payload.periodMonth);
  result.periodMonth = month && month >= 1 && month <= 12 ? Math.trunc(month) : null;
  const year = sanitizeNumber(payload.periodYear);
  result.periodYear = year ? Math.trunc(year) : null;
  const l4Date = sanitizeOptionalString(payload.l4Date);
  result.l4Date = l4Date;
  result.valueStepTaskId =
    typeof payload.valueStepTaskId === 'string' && payload.valueStepTaskId.trim()
      ? payload.valueStepTaskId.trim()
      : null;
  result.additionalCommentary = sanitizeString(payload.additionalCommentary);

  const calcSource =
    payload.calculationLogic && typeof payload.calculationLogic === 'object'
      ? (payload.calculationLogic as Record<string, unknown>)
      : {};
  result.calculationLogic = initiativeFinancialKinds.reduce((acc, kind) => {
    const raw = calcSource[kind];
    acc[kind] = typeof raw === 'string' ? raw.trim() : '';
    return acc;
  }, {} as InitiativeStagePayload['calculationLogic']);

  const filesSource = Array.isArray(payload.businessCaseFiles) ? payload.businessCaseFiles : [];
  result.businessCaseFiles = filesSource
    .map((entry) => sanitizeBusinessCaseFile(entry))
    .filter((entry): entry is InitiativeBusinessCaseFile => Boolean(entry));

  const supportingSource = Array.isArray(payload.supportingDocs) ? payload.supportingDocs : [];
  result.supportingDocs = supportingSource
    .map((entry) => sanitizeSupportingDoc(entry))
    .filter((entry): entry is InitiativeSupportingDocument => Boolean(entry));

  const kpiSource = Array.isArray(payload.kpis) ? payload.kpis : [];
  result.kpis = kpiSource.map((entry) => sanitizeKpi(entry)).filter((entry): entry is InitiativeStageKPI => Boolean(entry));

  if (payload.financials && typeof payload.financials === 'object') {
    const source = payload.financials as Record<string, unknown>;
    for (const kind of initiativeFinancialKinds) {
      const list = Array.isArray(source[kind]) ? source[kind] : [];
      result.financials[kind] = list.map((entry) => sanitizeFinancialEntry(entry));
    }
  }

  return result;
};

const sanitizeStageMap = (value: unknown): InitiativeStageMap => {
  const map = {} as InitiativeStageMap;
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of initiativeStageKeys) {
    map[key] = sanitizeStage(payload[key]);
  }
  return map;
};

const createDefaultStageStateMap = (): InitiativeStageStateMap =>
  initiativeStageKeys.reduce(
    (acc, key) => {
      acc[key] = { status: 'draft', roundIndex: 0 };
      return acc;
    },
    {} as InitiativeStageStateMap
  );

const sanitizeStageStateMap = (value: unknown): InitiativeStageStateMap => {
  const base = createDefaultStageStateMap();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as Record<string, unknown>;
  for (const key of initiativeStageKeys) {
    const raw = payload[key];
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const entry = raw as { status?: unknown; roundIndex?: unknown; comment?: unknown };
    const status =
      entry.status === 'pending' ||
      entry.status === 'approved' ||
      entry.status === 'returned' ||
      entry.status === 'rejected'
        ? entry.status
        : 'draft';
    const roundIndex = typeof entry.roundIndex === 'number' ? entry.roundIndex : 0;
    const comment = typeof entry.comment === 'string' ? entry.comment : null;
    base[key] = { status, roundIndex, comment };
  }
  return base;
};

const normalizeSelection = (value: unknown): InitiativeCommentSelection | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const top = sanitizeNumber(payload.top);
  const left = sanitizeNumber(payload.left);
  const width = sanitizeNumber(payload.width);
  const height = sanitizeNumber(payload.height);
  const pageWidth = sanitizeNumber(payload.pageWidth);
  const pageHeight = sanitizeNumber(payload.pageHeight);
  if (
    top === null ||
    left === null ||
    width === null ||
    height === null ||
    pageWidth === null ||
    pageHeight === null
  ) {
    return null;
  }
  return {
    top,
    left,
    width,
    height,
    pageWidth,
    pageHeight
  };
};

export interface InitiativeCommentPayload {
  targetId?: string | null;
  targetLabel?: string | null;
  targetPath?: string | null;
  stageKey?: InitiativeStageKey | null;
  selection?: InitiativeCommentSelection | null;
  body?: string | null;
}

export interface InitiativeCommentReplyPayload {
  body?: string | null;
  parentId?: string | null;
}

const toIsoString = (value: Date | string | null | undefined) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return null;
};

const isGateKey = (stageKey: InitiativeStageKey): stageKey is WorkstreamGateKey =>
  (workstreamGateKeys as readonly string[]).includes(stageKey);

const getNextStageKey = (stageKey: InitiativeStageKey): InitiativeStageKey | null => {
  const index = initiativeStageKeys.indexOf(stageKey);
  if (index === -1 || index >= initiativeStageKeys.length - 1) {
    return null;
  }
  return initiativeStageKeys[index + 1];
};

const getGateKeyForStage = (stageKey: InitiativeStageKey): WorkstreamGateKey | null => {
  const next = getNextStageKey(stageKey);
  return next && isGateKey(next) ? next : null;
};

const cloneStagePayload = (stage: InitiativeStagePayload): InitiativeStagePayload => ({
  name: stage.name,
  description: stage.description,
  periodMonth: stage.periodMonth,
  periodYear: stage.periodYear,
  l4Date: stage.l4Date ?? null,
  valueStepTaskId: stage.valueStepTaskId ?? null,
  additionalCommentary: stage.additionalCommentary ?? '',
  calculationLogic: initiativeFinancialKinds.reduce(
    (acc, kind) => {
      acc[kind] = stage.calculationLogic?.[kind] ?? '';
      return acc;
    },
    {} as InitiativeStagePayload['calculationLogic']
  ),
  businessCaseFiles: [...(stage.businessCaseFiles ?? [])],
  supportingDocs: [...(stage.supportingDocs ?? [])],
  kpis: (stage.kpis ?? []).map((kpi) => ({
    ...kpi,
    distribution: { ...(kpi.distribution ?? {}) },
    actuals: { ...(kpi.actuals ?? {}) }
  })),
  financials: initiativeFinancialKinds.reduce(
    (acc, kind) => {
      acc[kind] = stage.financials[kind].map((entry) => ({
        id: entry.id,
        label: entry.label,
        category: entry.category,
        lineCode: entry.lineCode ?? null,
        distribution: { ...entry.distribution },
        actuals: { ...(entry.actuals ?? {}) }
      }));
      return acc;
    },
    {} as InitiativeStagePayload['financials']
  )
});

const readRoundCount = (gates: unknown, stageKey: InitiativeStageKey): number => {
  const gateKey = getGateKeyForStage(stageKey);
  if (!gateKey || !gates || typeof gates !== 'object') {
    return 0;
  }
  const payload = gates as Record<string, unknown>;
  const rounds = Array.isArray(payload[gateKey]) ? payload[gateKey] : [];
  return rounds.length;
};

const buildRoleAssignmentsMap = (assignments: WorkstreamRoleAssignmentRecord[]) => {
  const map = new Map<string, string[]>();
  for (const assignment of assignments) {
    if (!assignment.role) {
      continue;
    }
    const list = map.get(assignment.role) ?? [];
    list.push(assignment.accountId);
    map.set(assignment.role, list);
  }
  return map;
};

const resolveApprovalThreshold = (rule: InitiativeApprovalRule, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  switch (rule) {
    case 'all':
      return total;
    case 'majority':
      return Math.floor(total / 2) + 1;
    case 'any':
    default:
      return 1;
  }
};

const isRequirementSatisfied = (
  rule: InitiativeApprovalRule,
  approved: number,
  total: number
): boolean => approved >= resolveApprovalThreshold(rule, total);

const isMissingRelationError = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in (error as Record<string, unknown>) && (error as { code?: unknown }).code === '42P01');

const createDefaultStageStateEntry = (_stageKey: InitiativeStageKey): InitiativeStageState => ({
  status: 'draft',
  roundIndex: 0,
  comment: null
});

const toResponse = (record: InitiativeRecord): InitiativeResponse => ({
  ...record,
  totals: buildInitiativeTotals(record)
});

const mapCommentMessageRow = (row: InitiativeCommentMessageRow): InitiativeCommentMessage => ({
  id: row.id,
  threadId: row.thread_id,
  parentId: row.parent_id ?? null,
  body: row.body,
  authorAccountId: row.author_account_id ?? null,
  authorName: row.author_name ?? null,
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString()
});

const mapCommentThreadRow = (
  thread: InitiativeCommentThreadRow,
  messages: InitiativeCommentMessageRow[]
): InitiativeCommentThread => ({
  id: thread.id,
  initiativeId: thread.initiative_id,
  stageKey: thread.stage_key ? normalizeStageKeyOrNull(thread.stage_key) : null,
  targetId: thread.target_id,
  targetLabel: thread.target_label ?? null,
  targetPath: thread.target_path ?? null,
  selection: normalizeSelection(thread.selection),
  createdAt: toIsoString(thread.created_at) ?? new Date().toISOString(),
  createdByAccountId: thread.created_by_account_id ?? null,
  createdByName: thread.created_by_name ?? null,
  comments: messages.map((message) => mapCommentMessageRow(message)),
  resolvedAt: thread.resolved_at ? toIsoString(thread.resolved_at) : null,
  resolvedByAccountId: thread.resolved_by_account_id ?? null,
  resolvedByName: thread.resolved_by_name ?? null
});

export class InitiativesService {
  constructor(
    private readonly repository: InitiativesRepository,
    private readonly workstreamsRepository: WorkstreamsRepository
  ) {}

  async listInitiatives(): Promise<InitiativeResponse[]> {
    const records = await this.repository.listInitiatives();
    return records.map((record) => toResponse(record));
  }

  async getInitiative(id: string): Promise<InitiativeResponse> {
    const record = await this.repository.findInitiative(id);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    return toResponse(record);
  }

  private sanitizeModel(payload: unknown, idOverride?: string): InitiativeWriteModel {
    if (!payload || typeof payload !== 'object') {
      throw new Error('INVALID_INPUT');
    }
    const input = payload as {
      id?: unknown;
      workstreamId?: unknown;
      name?: unknown;
      description?: unknown;
      ownerAccountId?: unknown;
      ownerName?: unknown;
      currentStatus?: unknown;
      activeStage?: unknown;
      l4Date?: unknown;
      stages?: unknown;
      stageState?: unknown;
      plan?: unknown;
    };

    const id = idOverride ?? (typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID());
    const workstreamId = typeof input.workstreamId === 'string' ? input.workstreamId.trim() : '';
    if (!workstreamId) {
      throw new Error('INVALID_INPUT');
    }
    const name = sanitizeString(input.name);
    if (!name) {
      throw new Error('INVALID_INPUT');
    }
    const description = sanitizeString(input.description);
    const ownerAccountId = typeof input.ownerAccountId === 'string' && input.ownerAccountId.trim()
      ? input.ownerAccountId.trim()
      : null;
    const ownerName = sanitizeOptionalString(input.ownerName);
    const currentStatus = sanitizeString(input.currentStatus) || 'draft';
    const stages = sanitizeStageMap(input.stages);
    const stageState = sanitizeStageStateMap(input.stageState);
    const plan = normalizePlanModel(input.plan);
    const valueStepTaskId =
      plan.tasks.find((task) => (task.milestoneType ?? '').toLowerCase() === 'value step')?.id ?? null;
    const normalizedStages = initiativeStageKeys.reduce((acc, key) => {
      acc[key] = { ...stages[key], valueStepTaskId };
      return acc;
    }, {} as InitiativeStageMap);
    const activeStage = normalizeStageKey(input.activeStage);
    const l4Date = sanitizeOptionalString(input.l4Date) ?? stages.l4.l4Date ?? null;

    return {
      id,
      workstreamId,
      name,
      description,
      ownerAccountId,
      ownerName,
      currentStatus,
      activeStage,
      l4Date,
      stages: normalizedStages,
      stageState,
      plan
    };
  }

  async createInitiative(payload: unknown, metadata?: InitiativeMutationMetadata): Promise<InitiativeResponse> {
    const model = this.sanitizeModel(payload);
    const record = await this.repository.createInitiative(model);
    await this.recordEvents(null, record, metadata, 'create');
    return toResponse(record);
  }

  async updateInitiative(
    id: string,
    payload: unknown,
    expectedVersion: number,
    metadata?: InitiativeMutationMetadata
  ): Promise<InitiativeResponse> {
    if (!Number.isInteger(expectedVersion)) {
      throw new Error('INVALID_INPUT');
    }
    const current = await this.repository.findInitiative(id);
    if (!current) {
      throw new Error('NOT_FOUND');
    }
    const safePayload = payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>), id } : { id };
    const model = this.sanitizeModel(safePayload, id);
    const result = await this.repository.updateInitiative(model, expectedVersion);
    if (result === 'not-found') {
      throw new Error('NOT_FOUND');
    }
    if (result === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    await this.recordEvents(current, result, metadata, 'update');
    return toResponse(result);
  }

  async removeInitiative(id: string): Promise<string> {
    const removed = await this.repository.deleteInitiative(id);
    if (!removed) {
      throw new Error('NOT_FOUND');
    }
    return id;
  }

  async advanceStage(id: string, targetStage?: InitiativeStageKey, metadata?: InitiativeMutationMetadata): Promise<InitiativeResponse> {
    const record = await this.repository.findInitiative(id);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const currentIndex = initiativeStageKeys.indexOf(record.activeStage);
    const desiredStage = targetStage ?? initiativeStageKeys[Math.min(currentIndex + 1, initiativeStageKeys.length - 1)];
    const desiredIndex = initiativeStageKeys.indexOf(desiredStage);
    if (desiredIndex === -1 || desiredIndex <= currentIndex) {
      throw new Error('INVALID_INPUT');
    }
    if (desiredIndex !== currentIndex + 1) {
      throw new Error('INVALID_INPUT');
    }
    const roundIndex = record.stageState[record.activeStage]?.roundIndex ?? 0;
    const updated = await this.finalizeStage(record, record.activeStage, roundIndex);
    await this.recordEvents(record, updated, metadata, 'update');
    return toResponse(updated);
  }

  async submitStage(id: string, metadata?: InitiativeMutationMetadata): Promise<InitiativeResponse> {
    const record = await this.repository.findInitiative(id);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const stageKey = record.activeStage;
    const stageStateEntry = record.stageState[stageKey] ?? createDefaultStageStateEntry(stageKey);
    if (stageStateEntry.status === 'pending') {
      throw new Error('STAGE_PENDING');
    }
    if (stageStateEntry.status === 'approved') {
      throw new Error('STAGE_ALREADY_APPROVED');
    }
    const workstream = await this.workstreamsRepository.findWorkstream(record.workstreamId);
    if (!workstream) {
      throw new Error('WORKSTREAM_NOT_FOUND');
    }
    const assignments = await this.workstreamsRepository.listAssignmentsByWorkstream(record.workstreamId);
    const roleAssignments = buildRoleAssignmentsMap(assignments);
    const gateKey = getGateKeyForStage(stageKey);
    const rounds = gateKey ? workstream.gates[gateKey] ?? [] : [];
    if (!rounds.length) {
      const approvedRecord = await this.finalizeStage(record, stageKey, stageStateEntry.roundIndex);
      await this.recordEvents(record, approvedRecord, metadata, 'update');
      return toResponse(approvedRecord);
    }
    const firstRound = rounds[0];
    const approvalsPayload = this.composeApprovalsPayload(record.id, stageKey, 0, firstRound, roleAssignments);
    if (!approvalsPayload.length) {
      throw new Error('MISSING_APPROVERS');
    }
    await this.repository.deleteApprovalsForStage(record.id, stageKey);
    await this.repository.insertApprovals(approvalsPayload);
    const nextStageState = {
      ...record.stageState,
      [stageKey]: { status: 'pending', roundIndex: 0, comment: null }
    };
    const updatedModel: InitiativeWriteModel = {
      ...record,
      stageState: nextStageState
    };
    const result = await this.repository.updateInitiative(updatedModel, record.version);
    if (typeof result === 'string') {
      await this.repository.deleteApprovalsForStage(record.id, stageKey);
      if (result === 'version-conflict') {
        throw new Error('VERSION_CONFLICT');
      }
        throw new Error('NOT_FOUND');
    }
    await this.recordEvents(record, result, metadata, 'update');
    return toResponse(result);
  }

  async listApprovalTasks(filter: {
    status?: InitiativeApprovalRecord['status'];
    accountId?: string | null;
  } = {}): Promise<InitiativeApprovalTask[]> {
    try {
      const rows = await this.repository.listApprovalTaskRows(filter);
      return rows.map((row) => this.mapApprovalTask(row));
    } catch (error) {
      if (isMissingRelationError(error)) {
        console.warn(
          'Approvals table not found while listing approval tasks. Run migrations to enable approvals.'
        );
        return [];
      }
      throw error;
    }
  }

  async decideApproval(
    approvalId: string,
    decision: ApprovalDecision,
    actorAccountId?: string,
    comment?: string | null
  ): Promise<InitiativeResponse> {
    const actorMeta = actorAccountId ? { actorAccountId } : undefined;
    const approval = await this.repository.findApproval(approvalId);
    if (!approval) {
      throw new Error('APPROVAL_NOT_FOUND');
    }
    if (approval.status !== 'pending') {
      const record = await this.repository.findInitiative(approval.initiativeId);
      if (!record) {
        throw new Error('NOT_FOUND');
      }
      return toResponse(record);
    }
    if (approval.accountId && actorAccountId && approval.accountId !== actorAccountId) {
      throw new Error('FORBIDDEN');
    }
    const record = await this.repository.findInitiative(approval.initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const stageKey = approval.stageKey;
    if (record.activeStage !== stageKey) {
      return toResponse(record);
    }
    const workstream = await this.workstreamsRepository.findWorkstream(record.workstreamId);
    if (!workstream) {
      throw new Error('WORKSTREAM_NOT_FOUND');
    }
    const nextStatus = decision === 'approve' ? 'approved' : decision === 'return' ? 'returned' : 'rejected';
    await this.repository.updateApprovalStatus(approvalId, nextStatus, comment ?? null);

    if (decision === 'return' || decision === 'reject') {
      await this.repository.updateApprovalsForStage(
        record.id,
        stageKey,
        ['pending'],
        decision === 'return' ? 'returned' : 'rejected',
        comment ?? null
      );
      const updated = await this.updateStageState(record, stageKey, {
        status: decision === 'return' ? 'returned' : 'rejected',
        roundIndex: approval.roundIndex,
        comment: comment ?? null
      });
      await this.recordEvents(record, updated, actorMeta, 'update');
      return toResponse(updated);
    }

    const roundApprovals = await this.repository.listApprovalsForStage(record.id, stageKey, approval.roundIndex);
    const roleTotals = new Map<string, { total: number; approved: number }>();
    for (const entry of roundApprovals) {
      const bucket = roleTotals.get(entry.role) ?? { total: 0, approved: 0 };
      bucket.total += 1;
      if (entry.status === 'approved') {
        bucket.approved += 1;
      }
      roleTotals.set(entry.role, bucket);
    }
    const gateKey = getGateKeyForStage(stageKey);
    const currentRound = gateKey ? workstream.gates[gateKey]?.[approval.roundIndex] : null;
    if (!currentRound) {
      const updated = await this.finalizeStage(record, stageKey, approval.roundIndex);
      await this.recordEvents(record, updated, actorMeta, 'update');
      return toResponse(updated);
    }
    const requirement = currentRound.approvers.find((item) => item.role === approval.role);
    if (requirement && isRequirementSatisfied(requirement.rule, roleTotals.get(approval.role)?.approved ?? 0, roleTotals.get(approval.role)?.total ?? 0)) {
      await this.repository.updateApprovalsForRole(
        record.id,
        stageKey,
        approval.roundIndex,
        approval.role,
        ['pending'],
        'approved',
        'Auto-approved (rule satisfied)'
      );
    }
    const roundSatisfied = currentRound.approvers.every((item) => {
      const stats = roleTotals.get(item.role);
      if (!stats) {
        return false;
      }
      return isRequirementSatisfied(item.rule, stats.approved, stats.total);
    });
    if (!roundSatisfied) {
      const updated = await this.repository.findInitiative(record.id);
      return toResponse(updated ?? record);
    }
    const nextRoundIndex = approval.roundIndex + 1;
    const rounds = gateKey ? workstream.gates[gateKey] ?? [] : [];
    if (nextRoundIndex >= rounds.length) {
      const updated = await this.finalizeStage(record, stageKey, approval.roundIndex);
      await this.recordEvents(record, updated, actorMeta, 'update');
      return toResponse(updated);
    }
    const assignments = await this.workstreamsRepository.listAssignmentsByWorkstream(record.workstreamId);
    const payload = this.composeApprovalsPayload(record.id, stageKey, nextRoundIndex, rounds[nextRoundIndex], buildRoleAssignmentsMap(assignments));
    if (!payload.length) {
      throw new Error('MISSING_APPROVERS');
    }
    await this.repository.insertApprovals(payload);
    const updated = await this.updateStageState(record, stageKey, {
      status: 'pending',
      roundIndex: nextRoundIndex,
      comment: null
    });
    await this.recordEvents(record, updated, actorMeta, 'update');
    return toResponse(updated);
  }

  async listEvents(id: string): Promise<InitiativeEventTimelineEntry[]> {
    const events = await this.repository.listEvents(id);
    const grouped = new Map<string, InitiativeEventTimelineEntry>();
    for (const row of events) {
      let entry = grouped.get(row.eventId);
      if (!entry) {
        entry = {
          id: row.eventId,
          eventType: row.eventType,
          createdAt: row.createdAt,
          actorAccountId: row.actorAccountId,
          actorName: row.actorName,
          changes: []
        };
        grouped.set(row.eventId, entry);
      }
      entry.changes.push({ field: row.field, previousValue: row.previousValue, nextValue: row.nextValue });
    }
    return Array.from(grouped.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async listStatusReports(initiativeId: string): Promise<InitiativeStatusReport[]> {
    const record = await this.repository.findInitiative(initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    return this.repository.listStatusReports(initiativeId);
  }

  async createStatusReport(
    initiativeId: string,
    payload: unknown,
    actor?: InitiativeMutationMetadata
  ): Promise<InitiativeStatusReport> {
    const record = await this.repository.findInitiative(initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const { entries, summary } = this.sanitizeStatusReportPayload(payload, record);
    return this.repository.insertStatusReport({
      id: randomUUID(),
      initiativeId,
      entries,
      summary,
      planVersion: record.version ?? null,
      createdByAccountId: actor?.actorAccountId ?? null,
      createdByName: actor?.actorName ?? null
    });
  }

  async listComments(initiativeId: string): Promise<InitiativeCommentThread[]> {
    const record = await this.repository.findInitiative(initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const rows = await this.repository.listCommentThreads(initiativeId);
    return rows.map(({ thread, messages }) => mapCommentThreadRow(thread, messages));
  }

  async createComment(
    initiativeId: string,
    payload: InitiativeCommentPayload,
    actor?: InitiativeMutationMetadata
  ): Promise<InitiativeCommentThread> {
    const record = await this.repository.findInitiative(initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const targetId = sanitizeString(payload.targetId);
    const body = sanitizeString(payload.body);
    if (!targetId || !body) {
      throw new Error('INVALID_INPUT');
    }
    const selection = payload.selection ? normalizeSelection(payload.selection) : null;
    const stageKey = payload.stageKey ? normalizeStageKeyOrNull(payload.stageKey) : null;
    const created = await this.repository.createCommentThread({
      threadId: randomUUID(),
      messageId: randomUUID(),
      initiativeId,
      stageKey: stageKey ?? undefined,
      targetId,
      targetLabel: sanitizeOptionalString(payload.targetLabel),
      targetPath: sanitizeOptionalString(payload.targetPath),
      selection: selection ?? null,
      authorAccountId: actor?.actorAccountId ?? null,
      authorName: actor?.actorName ?? null,
      body
    });
    return mapCommentThreadRow(created.thread, [created.message]);
  }

  async replyToComment(
    initiativeId: string,
    threadId: string,
    payload: InitiativeCommentReplyPayload,
    actor?: InitiativeMutationMetadata
  ): Promise<InitiativeCommentThread> {
    const record = await this.repository.findInitiative(initiativeId);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    const thread = await this.repository.findCommentThread(threadId);
    if (!thread || thread.initiative_id !== initiativeId) {
      throw new Error('NOT_FOUND');
    }
    const body = sanitizeString(payload.body);
    if (!body) {
      throw new Error('INVALID_INPUT');
    }
    let parentId: string | null = null;
    if (payload.parentId) {
      const parent = await this.repository.findCommentMessage(payload.parentId);
      if (!parent || parent.thread_id !== threadId) {
        throw new Error('INVALID_INPUT');
      }
      parentId = parent.id;
    }
    await this.repository.insertCommentMessage({
      id: randomUUID(),
      threadId,
      parentId,
      body,
      authorAccountId: actor?.actorAccountId ?? null,
      authorName: actor?.actorName ?? null
    });
    const messages = await this.repository.listCommentMessages(threadId);
    return mapCommentThreadRow(thread, messages);
  }

  async setCommentResolution(
    initiativeId: string,
    threadId: string,
    resolved: boolean,
    actor?: InitiativeMutationMetadata
  ): Promise<InitiativeCommentThread> {
    const thread = await this.repository.findCommentThread(threadId);
    if (!thread || thread.initiative_id !== initiativeId) {
      throw new Error('NOT_FOUND');
    }
    const updatedThread =
      (await this.repository.updateCommentThreadResolution(
        threadId,
        resolved,
        actor?.actorAccountId ?? null,
        actor?.actorName ?? null
      )) ?? thread;
    const messages = await this.repository.listCommentMessages(threadId);
    return mapCommentThreadRow(updatedThread, messages);
  }

  private sanitizeStatusReportPayload(
    payload: unknown,
    record: InitiativeRecord
  ): { entries: InitiativeStatusReportEntry[]; summary: string } {
    if (!payload || typeof payload !== 'object') {
      throw new Error('INVALID_INPUT');
    }
    const entriesPayload = (payload as { entries?: unknown }).entries;
    if (!Array.isArray(entriesPayload)) {
      throw new Error('INVALID_INPUT');
    }
    const rawSummary = (payload as { summary?: unknown }).summary;
    const summary = sanitizeString(rawSummary).slice(0, STATUS_SUMMARY_MAX_LENGTH);
    const tasks = [
      ...(record.plan.actuals?.tasks ?? []),
      ...record.plan.tasks
    ] as InitiativePlanTask[];
    const taskMap = new Map<string, InitiativePlanTask>();
    tasks.forEach((task) => {
      if (task.id && !taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });
    if (!taskMap.size) {
      throw new Error('INVALID_INPUT');
    }
    const entries: InitiativeStatusReportEntry[] = [];
    const seenTasks = new Set<string>();
    for (const item of entriesPayload) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const rawTaskId = (item as { taskId?: unknown }).taskId;
      const taskId = typeof rawTaskId === 'string' ? rawTaskId.trim() : '';
      if (!taskId || seenTasks.has(taskId)) {
        continue;
      }
      const task = taskMap.get(taskId);
      if (!task) {
        continue;
      }
      seenTasks.add(taskId);
      const statusUpdateRaw = (item as { statusUpdate?: unknown }).statusUpdate;
      const sourceRaw = (item as { source?: unknown }).source;
      const statusUpdate = sanitizeString(statusUpdateRaw).slice(0, STATUS_UPDATE_MAX_LENGTH);
      const source = sourceRaw === 'manual' ? 'manual' : 'auto';
      entries.push({
        id: randomUUID(),
        taskId: task.id,
        name: task.name,
        description: task.description,
        responsible: task.responsible,
        startDate: task.startDate,
        endDate: task.endDate ?? task.baseline?.endDate ?? null,
        statusUpdate,
        source
      });
    }
    if (!entries.length) {
      throw new Error('INVALID_INPUT');
    }
    return { entries, summary };
  }

  private composeApprovalsPayload(
    initiativeId: string,
    stageKey: InitiativeStageKey,
    roundIndex: number,
    round: WorkstreamApprovalRound,
    roleAssignments: Map<string, string[]>
  ) {
    const approvals: Array<{
      id: string;
      initiativeId: string;
      stageKey: InitiativeStageKey;
      roundIndex: number;
      role: string;
      rule: InitiativeApprovalRule;
      accountId: string | null;
    }> = [];
    for (const approver of round.approvers) {
      const accounts = roleAssignments.get(approver.role) ?? [];
      if (!accounts.length) {
        throw new Error('MISSING_APPROVERS');
      }
      for (const accountId of accounts) {
        approvals.push({
          id: randomUUID(),
          initiativeId,
          stageKey,
          roundIndex,
          role: approver.role,
          rule: approver.rule,
          accountId
        });
      }
    }
    return approvals;
  }

  private async updateStageState(
    record: InitiativeRecord,
    stageKey: InitiativeStageKey,
    nextState: InitiativeStageState
  ): Promise<InitiativeRecord> {
    const stageState = { ...record.stageState, [stageKey]: nextState };
    const updatedModel: InitiativeWriteModel = {
      ...record,
      stageState
    };
    const result = await this.repository.updateInitiative(updatedModel, record.version);
    if (typeof result === 'string') {
      if (result === 'version-conflict') {
        throw new Error('VERSION_CONFLICT');
      }
      throw new Error('NOT_FOUND');
    }
    return result;
  }

  private async finalizeStage(
    record: InitiativeRecord,
    stageKey: InitiativeStageKey,
    roundIndex: number
  ): Promise<InitiativeRecord> {
    const nextStage = getNextStageKey(stageKey);
    const nextStages = { ...record.stages };
    if (nextStage && nextStage !== stageKey) {
      nextStages[nextStage] = cloneStagePayload(nextStages[stageKey]);
    }
    const stageState = {
      ...record.stageState,
      [stageKey]: { status: 'approved', roundIndex, comment: null }
    };
    const updatedModel: InitiativeWriteModel = {
      ...record,
      activeStage: nextStage ?? record.activeStage,
      stages: nextStages,
      stageState
    };
    const result = await this.repository.updateInitiative(updatedModel, record.version);
    if (typeof result === 'string') {
      if (result === 'version-conflict') {
        throw new Error('VERSION_CONFLICT');
      }
      throw new Error('NOT_FOUND');
    }
    await this.repository.deleteApprovalsForStage(record.id, stageKey);
    return result;
  }

  private mapApprovalTask(row: ApprovalTaskRow): InitiativeApprovalTask {
    const stageKey = normalizeStageKey(row.stage_key);
    const stages = sanitizeStageMap(row.stage_payload);
    const stageStateMap = sanitizeStageStateMap(row.stage_state);
    const stage = stages[stageKey];
    const stageState = stageStateMap[stageKey] ?? createDefaultStageStateEntry(stageKey);
    const initiativeRecord: InitiativeRecord = {
      id: row.initiative_id,
      workstreamId: row.workstream_id,
      name: row.initiative_name,
      description: row.initiative_description ?? '',
      ownerAccountId: row.owner_account_id,
      ownerName: row.owner_name,
      currentStatus: row.current_status,
      activeStage: normalizeStageKey(row.active_stage),
      l4Date: toIsoString(row.l4_date),
      version: Number(row.version ?? 1),
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
      stages,
      stageState: stageStateMap,
      plan: normalizePlanModel(row.plan_payload)
    };
    return {
      id: row.id,
      initiativeId: row.initiative_id,
      initiativeName: row.initiative_name,
      workstreamId: row.workstream_id,
      workstreamName: row.workstream_name,
      workstreamDescription: row.workstream_description ?? null,
      stageKey,
      roundIndex: Number(row.round_index ?? 0),
      roundCount: readRoundCount(row.workstream_gates, stageKey),
      role: row.role,
      rule: (row.rule as InitiativeApprovalRule) ?? 'any',
      status: row.status as InitiativeApprovalRecord['status'],
      accountId: row.account_id ?? null,
      accountName: row.account_name,
      accountEmail: row.account_email,
      requestedAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at),
      ownerName: row.owner_name,
      ownerAccountId: row.owner_account_id,
      stage,
      stageState,
      totals: buildInitiativeTotals(initiativeRecord),
      roleTotal: Number(row.role_total ?? 0),
      roleApproved: Number(row.role_approved ?? 0),
      rolePending: Number(row.role_pending ?? 0)
    };
  }

  private async recordEvents(
    previous: InitiativeRecord | null,
    next: InitiativeRecord,
    metadata: InitiativeMutationMetadata | undefined,
    eventType: 'create' | 'update'
  ): Promise<void> {
    const changes = this.buildChangeSet(previous, next);
    if (!changes.length) {
      return;
    }
    const eventId = randomUUID();
    await this.repository.insertEvents(
      changes.map((change) => ({
        id: randomUUID(),
        eventId,
        initiativeId: next.id,
        eventType,
        field: change.field,
        previousValue: change.previousValue,
        nextValue: change.nextValue,
        actorAccountId: metadata?.actorAccountId ?? null,
        actorName: metadata?.actorName ?? null
      }))
    );
  }

  private buildChangeSet(previous: InitiativeRecord | null, next: InitiativeRecord): Array<{
    field: string;
    previousValue: unknown;
    nextValue: unknown;
  }> {
    const areEqual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const summarizeDocs = (docs: InitiativeSupportingDocument[] | InitiativeBusinessCaseFile[] | undefined | null) => {
      const safe = Array.isArray(docs) ? docs : [];
      return {
        count: safe.length,
        names: safe.map((file) => file.fileName),
        checksum: hashPayload(
          JSON.stringify(safe.map((file) => ({ id: file.id, name: file.fileName, size: file.size })))
        )
      };
    };
    const sumDistribution = (
      entries: InitiativeFinancialEntry[] | undefined,
      selector: 'distribution' | 'actuals' = 'distribution'
    ) =>
      (entries ?? []).reduce(
        (total, entry) =>
          total +
          Object.values(entry[selector] ?? {}).reduce(
            (acc, value) => acc + (Number.isFinite(Number(value)) ? Number(value) : 0),
            0
          ),
        0
      );
    const summarizeFinancials = (stage: InitiativeStageMap[InitiativeStageKey]) =>
      initiativeFinancialKinds.reduce((acc, kind) => {
        const entries = stage.financials[kind] ?? [];
        acc[kind] = {
          planTotal: sumDistribution(entries, 'distribution'),
          actualTotal: sumDistribution(entries, 'actuals'),
          checksum: hashPayload(
            JSON.stringify(entries.map((entry) => ({ id: entry.id, distribution: entry.distribution, actuals: entry.actuals })))
          )
        };
        return acc;
      }, {} as Record<InitiativeFinancialKind, { planTotal: number; actualTotal: number; checksum: string }>);
    const summarizeKpis = (stage: InitiativeStageMap[InitiativeStageKey]) => {
      const list = Array.isArray(stage.kpis) ? stage.kpis : [];
      return {
        count: list.length,
        names: list.map((kpi) => kpi.name),
        checksum: hashPayload(
          JSON.stringify(list.map((kpi) => ({ id: kpi.id, distribution: kpi.distribution, actuals: kpi.actuals, baseline: kpi.baseline })))
        )
      };
    };
    const summarizePlan = (plan: InitiativePlanModel | null | undefined) => {
      const tasks = plan?.tasks ?? [];
      const dates: number[] = [];
      tasks.forEach((task) => {
        const start = task.startDate ? new Date(task.startDate).getTime() : null;
        const end = task.endDate ? new Date(task.endDate).getTime() : null;
        if (start && !Number.isNaN(start)) {
          dates.push(start);
        }
        if (end && !Number.isNaN(end)) {
          dates.push(end);
        }
      });
      const startDate = dates.length ? new Date(Math.min(...dates)).toISOString() : null;
      const endDate = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
      return {
        taskCount: tasks.length,
        milestoneCount: tasks.filter((task) => Boolean(task.milestoneType)).length,
        startDate,
        endDate,
        checksum: hashPayload(JSON.stringify(plan ?? {}))
      };
    };

    const changes: Array<{ field: string; previousValue: unknown; nextValue: unknown }> = [];
    if (!previous) {
      changes.push({
        field: 'created',
        previousValue: null,
        nextValue: {
          name: next.name,
          status: next.currentStatus,
          ownerName: next.ownerName
        }
      });
      return changes;
    }
    const addChange = (field: string, previousValue: unknown, nextValue: unknown) => {
      if (!areEqual(previousValue, nextValue)) {
        changes.push({ field, previousValue, nextValue });
      }
    };

    addChange('name', previous.name, next.name);
    addChange('description', previous.description, next.description);
    addChange('workstream', previous.workstreamId, next.workstreamId);
    addChange('status', previous.currentStatus, next.currentStatus);
    addChange(
      'owner',
      { accountId: previous.ownerAccountId, name: previous.ownerName },
      { accountId: next.ownerAccountId, name: next.ownerName }
    );
    addChange('l4Date', previous.l4Date, next.l4Date);
    addChange('activeStage', previous.activeStage, next.activeStage);

    const previousTotals = buildInitiativeTotals(previous);
    const nextTotals = buildInitiativeTotals(next);
    addChange('recurringImpact', previousTotals.recurringImpact, nextTotals.recurringImpact);

    for (const key of initiativeStageKeys) {
      const prevState = previous.stageState[key];
      const nextState = next.stageState[key];
      addChange(`stageState.${key}`, prevState, nextState);
      const prevStage = previous.stages[key];
      const nextStage = next.stages[key];
      addChange(`stage.${key}.name`, prevStage.name, nextStage.name);
      addChange(`stage.${key}.description`, prevStage.description, nextStage.description);
      addChange(
        `stage.${key}.period`,
        { month: prevStage.periodMonth, year: prevStage.periodYear },
        { month: nextStage.periodMonth, year: nextStage.periodYear }
      );
      addChange(`stage.${key}.commentary`, prevStage.additionalCommentary, nextStage.additionalCommentary);
      addChange(`stage.${key}.valueStep`, prevStage.valueStepTaskId, nextStage.valueStepTaskId);
      addChange(`stage.${key}.l4Date`, prevStage.l4Date, nextStage.l4Date);
      addChange(`stage.${key}.calcLogic`, prevStage.calculationLogic ?? {}, nextStage.calculationLogic ?? {});
      addChange(`stage.${key}.businessCase`, summarizeDocs(prevStage.businessCaseFiles), summarizeDocs(nextStage.businessCaseFiles));
      addChange(`stage.${key}.supportingDocs`, summarizeDocs(prevStage.supportingDocs), summarizeDocs(nextStage.supportingDocs));
      const previousFinancials = summarizeFinancials(prevStage);
      const nextFinancials = summarizeFinancials(nextStage);
      for (const kind of initiativeFinancialKinds) {
        addChange(`stage.${key}.financials.${kind}`, previousFinancials[kind], nextFinancials[kind]);
      }
      addChange(`stage.${key}.kpis`, summarizeKpis(prevStage), summarizeKpis(nextStage));
    }

    addChange('plan.timeline', summarizePlan(previous.plan), summarizePlan(next.plan));
    addChange('plan.actuals', summarizePlan(previous.plan?.actuals ?? null), summarizePlan(next.plan?.actuals ?? null));

    if (!changes.length) {
      changes.push({ field: 'updated', previousValue: null, nextValue: null });
    }
    return changes;
  }
}
