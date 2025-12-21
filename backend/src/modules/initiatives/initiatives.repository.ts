import { randomUUID } from 'crypto';
import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  InitiativeFinancialEntry,
  InitiativeBusinessCaseFile,
  InitiativeSupportingDocument,
  InitiativeStageKPI,
  InitiativeRecord,
  InitiativeRow,
  InitiativeStageMap,
  InitiativeStagePayload,
  InitiativeStageState,
  InitiativeStageStateMap,
  InitiativeStageKey,
  InitiativeWriteModel,
  InitiativeRisk,
  InitiativeRiskCommentRow,
  InitiativeRiskAssessmentRow,
  InitiativeApprovalRow,
  InitiativeApprovalRecord,
  InitiativeEventRecord,
  InitiativeEventRow,
  InitiativeCommentThreadRow,
  InitiativeCommentMessageRow,
  InitiativeStatusReport,
  InitiativeStatusReportEntry,
  InitiativeStatusReportRow
} from './initiatives.types.js';
import { createEmptyPlanModel, normalizePlanModel } from './initiativePlan.helpers.js';

export interface ApprovalTaskRow extends InitiativeApprovalRow {
  initiative_name: string;
  initiative_description: string | null;
  workstream_id: string;
  workstream_name: string;
  workstream_description: string | null;
  workstream_gates: unknown;
  owner_name: string | null;
  owner_account_id: string | null;
  current_status: string;
  active_stage: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  l4_date: Date | null;
  stage_payload: unknown;
  stage_state: unknown;
  plan_payload: unknown;
  risk_register: unknown;
  account_name: string | null;
  account_email: string | null;
  account_role: string | null;
  round_total: number;
  round_approved: number;
  round_pending: number;
}

const toIsoString = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;

const createEmptyFinancialEntry = (): InitiativeFinancialEntry => ({
  id: '',
  label: '',
  category: '',
  lineCode: null,
  distribution: {},
  actuals: {}
});

const ensureDistribution = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim();
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (!normalizedKey) {
      continue;
    }
    if (Number.isFinite(numeric)) {
      result[normalizedKey] = Number(numeric);
    }
  }
  return result;
};

const ensureFinancialEntry = (value: unknown): InitiativeFinancialEntry => {
  if (!value || typeof value !== 'object') {
    return createEmptyFinancialEntry();
  }
  const payload = value as {
    id?: unknown;
    label?: unknown;
    category?: unknown;
    lineCode?: unknown;
    distribution?: unknown;
    actuals?: unknown;
  };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
  const label = typeof payload.label === 'string' ? payload.label.trim() : '';
  const category = typeof payload.category === 'string' ? payload.category.trim() : '';
  const lineCode = typeof payload.lineCode === 'string' && payload.lineCode.trim() ? payload.lineCode.trim() : null;
  return {
    id,
    label,
    category,
    lineCode,
    distribution: ensureDistribution(payload.distribution),
    actuals: ensureDistribution(payload.actuals)
  };
};

const ensureBusinessCaseFile = (value: unknown): InitiativeBusinessCaseFile | null => {
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
  const fileName = typeof payload.fileName === 'string' ? payload.fileName.trim() : '';
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const mimeType =
    typeof payload.mimeType === 'string' ? payload.mimeType.trim() || null : null;
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

const ensureSupportingDoc = (value: unknown): InitiativeSupportingDocument | null => {
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
  const fileName = typeof payload.fileName === 'string' ? payload.fileName.trim() : '';
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
  if (!fileName || !dataUrl) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const mimeType =
    typeof payload.mimeType === 'string' ? payload.mimeType.trim() || null : null;
  const size =
    typeof payload.size === 'number' && Number.isFinite(payload.size) ? Math.max(0, Math.trunc(payload.size)) : 0;
  const uploadedAt =
    typeof payload.uploadedAt === 'string' && payload.uploadedAt.trim()
      ? payload.uploadedAt
      : new Date().toISOString();
  const comment = typeof payload.comment === 'string' ? payload.comment.trim() : '';
  return { id, fileName, mimeType, size, dataUrl, uploadedAt, comment };
};

const ensureKpi = (value: unknown): InitiativeStageKPI | null => {
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
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const unit = typeof payload.unit === 'string' ? payload.unit.trim() : '';
  const source = typeof payload.source === 'string' ? payload.source.trim() : '';
  const isCustom = Boolean(payload.isCustom);
  const baseline =
    typeof payload.baseline === 'number' && Number.isFinite(payload.baseline) ? Number(payload.baseline) : null;
  const distribution = ensureDistribution(payload.distribution);
  const actuals = ensureDistribution(payload.actuals);
  return { id, name, unit, source, isCustom, baseline, distribution, actuals };
};

const clampScore = (value: unknown, min = 1, max = 5): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const ensureRisk = (value: unknown): InitiativeRisk | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    title?: unknown;
    category?: unknown;
    description?: unknown;
    severity?: unknown;
    likelihood?: unknown;
    mitigation?: unknown;
  };
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const mitigation = typeof payload.mitigation === 'string' ? payload.mitigation.trim() : '';
  const category = typeof payload.category === 'string' ? payload.category.trim() : 'Uncategorized';
  if (!title && !description && !mitigation && !category) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const severity = clampScore(payload.severity);
  const likelihood = clampScore(payload.likelihood);
  return {
    id,
    title,
    category,
    description,
    severity,
    likelihood,
    mitigation
  };
};

const ensureRiskList = (value: unknown): InitiativeRisk[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => ensureRisk(entry)).filter((entry): entry is InitiativeRisk => Boolean(entry));
};

const ensureStatusReportEntry = (value: unknown): InitiativeStatusReportEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    taskId?: unknown;
    name?: unknown;
    description?: unknown;
    responsible?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    statusUpdate?: unknown;
    source?: unknown;
    dueDaysSnapshot?: unknown;
    dueStatusSnapshot?: unknown;
    dueLabelSnapshot?: unknown;
  };
  const taskId = typeof payload.taskId === 'string' && payload.taskId.trim() ? payload.taskId.trim() : null;
  if (!taskId) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const dueDaysSnapshot =
    typeof payload.dueDaysSnapshot === 'number' && Number.isFinite(payload.dueDaysSnapshot)
      ? payload.dueDaysSnapshot
      : null;
  const dueStatusSnapshot =
    payload.dueStatusSnapshot === 'negative' || payload.dueStatusSnapshot === 'warning' || payload.dueStatusSnapshot === 'muted'
      ? payload.dueStatusSnapshot
      : undefined;
  const dueLabelSnapshot = typeof payload.dueLabelSnapshot === 'string' ? payload.dueLabelSnapshot : '';
  return {
    id,
    taskId,
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : '',
    responsible: typeof payload.responsible === 'string' ? payload.responsible : '',
    startDate: typeof payload.startDate === 'string' ? payload.startDate : null,
    endDate: typeof payload.endDate === 'string' ? payload.endDate : null,
    statusUpdate: typeof payload.statusUpdate === 'string' ? payload.statusUpdate : '',
    source: payload.source === 'manual' ? 'manual' : 'auto',
    dueDaysSnapshot,
    dueStatusSnapshot,
    dueLabelSnapshot
  };
};

const ensureStatusReportEntries = (value: unknown): InitiativeStatusReportEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenTasks = new Set<string>();
  const entries: InitiativeStatusReportEntry[] = [];
  for (const item of value) {
    const entry = ensureStatusReportEntry(item);
    if (!entry || seenTasks.has(entry.taskId)) {
      continue;
    }
    seenTasks.add(entry.taskId);
    entries.push(entry);
  }
  return entries;
};

type PoolClientLike = {
  query: typeof postgresPool.query;
  release: () => void;
};

const connectClient = async (): Promise<PoolClientLike> =>
  (postgresPool as unknown as { connect: () => Promise<PoolClientLike> }).connect();

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

const ensureStagePayload = (value: unknown): InitiativeStagePayload => {
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
  const base = createEmptyStagePayload();
  base.name = typeof payload.name === 'string' ? payload.name.trim() : '';
  base.description = typeof payload.description === 'string' ? payload.description.trim() : '';
  base.periodMonth = Number.isInteger(payload.periodMonth) ? Number(payload.periodMonth) : null;
  base.periodYear = Number.isInteger(payload.periodYear) ? Number(payload.periodYear) : null;
  base.l4Date = typeof payload.l4Date === 'string' ? payload.l4Date : null;
  base.valueStepTaskId =
    typeof payload.valueStepTaskId === 'string' && payload.valueStepTaskId.trim()
      ? payload.valueStepTaskId.trim()
      : null;
  base.additionalCommentary =
    typeof payload.additionalCommentary === 'string' ? payload.additionalCommentary.trim() : '';

  const calcSource = payload.calculationLogic && typeof payload.calculationLogic === 'object'
    ? (payload.calculationLogic as Record<string, unknown>)
    : {};
  base.calculationLogic = initiativeFinancialKinds.reduce((acc, kind) => {
    const raw = calcSource[kind];
    acc[kind] = typeof raw === 'string' ? raw.trim() : '';
    return acc;
  }, {} as InitiativeStagePayload['calculationLogic']);

  const filesSource = Array.isArray(payload.businessCaseFiles) ? payload.businessCaseFiles : [];
  base.businessCaseFiles = filesSource
    .map((item) => ensureBusinessCaseFile(item))
    .filter((item): item is InitiativeBusinessCaseFile => Boolean(item));

  const supportingSource = Array.isArray(payload.supportingDocs) ? payload.supportingDocs : [];
  base.supportingDocs = supportingSource
    .map((item) => ensureSupportingDoc(item))
    .filter((item): item is InitiativeSupportingDocument => Boolean(item));

  const kpiSource = Array.isArray(payload.kpis) ? payload.kpis : [];
  base.kpis = kpiSource.map((item) => ensureKpi(item)).filter((item): item is InitiativeStageKPI => Boolean(item));

  if (payload.financials && typeof payload.financials === 'object') {
    const source = payload.financials as Record<string, unknown>;
    for (const kind of initiativeFinancialKinds) {
      const list = Array.isArray(source[kind]) ? source[kind] : [];
      base.financials[kind] = list.map((entry) => ensureFinancialEntry(entry));
    }
  }

  return base;
};

const ensureStageMap = (value: unknown): InitiativeStageMap => {
  const map = {} as InitiativeStageMap;
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of initiativeStageKeys) {
    map[key] = ensureStagePayload(payload[key]);
  }
  return map;
};

const normalizeStageKey = (value: unknown): InitiativeRecord['activeStage'] => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (initiativeStageKeys.includes(normalized as (typeof initiativeStageKeys)[number])) {
      return normalized as InitiativeRecord['activeStage'];
    }
  }
  return 'l0';
};

const createDefaultStageState = (): InitiativeStageStateMap =>
  initiativeStageKeys.reduce(
    (acc, key) => {
      acc[key] = { status: 'draft', roundIndex: 0 };
      return acc;
    },
    {} as InitiativeStageStateMap
  );

const ensureStageState = (value: unknown): InitiativeStageStateMap => {
  const base = createDefaultStageState();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as Record<string, unknown>;
  for (const key of initiativeStageKeys) {
    const raw = payload[key];
    if (raw && typeof raw === 'object') {
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
  }
  return base;
};

const normalizeFinancialSummary = (value: unknown): InitiativeRecord['financialSummary'] => {
  if (!value || typeof value !== 'object') {
    return { roi: null };
  }
  const payload = value as { roi?: unknown };
  const roi = typeof payload.roi === 'number' && Number.isFinite(payload.roi) ? payload.roi : null;
  return { roi };
};

const mapRowToRecord = (row: InitiativeRow): InitiativeRecord => ({
  id: row.id,
  workstreamId: row.workstream_id,
  name: row.name,
  description: row.description ?? '',
  ownerAccountId: row.owner_account_id,
  ownerName: row.owner_name,
  currentStatus: row.current_status,
  activeStage: normalizeStageKey(row.active_stage),
  l4Date: toIsoString(row.l4_date),
  version: Number(row.version ?? 1),
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  stages: ensureStageMap(row.stage_payload),
  stageState: ensureStageState(row.stage_state),
  financialSummary: normalizeFinancialSummary(row.financial_summary),
  plan: normalizePlanModel(row.plan_payload),
  risks: ensureRiskList(row.risk_register ?? [])
});

const mapStatusReportRow = (row: InitiativeStatusReportRow): InitiativeStatusReport => ({
  id: row.id,
  initiativeId: row.initiative_id,
  entries: ensureStatusReportEntries(row.entries),
  planVersion: Number.isFinite(row.plan_version) ? Number(row.plan_version) : null,
  summary: typeof row.summary === 'string' ? row.summary : '',
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  createdByAccountId: row.created_by_account_id ?? null,
  createdByName: row.created_by_name ?? null
});

export class InitiativesRepository {
  async listInitiatives(): Promise<InitiativeRecord[]> {
    const result = await postgresPool.query<InitiativeRow>('SELECT * FROM workstream_initiatives ORDER BY updated_at DESC;');
    return (result.rows ?? []).map((row) => mapRowToRecord(row));
  }

  async findInitiative(id: string): Promise<InitiativeRecord | null> {
    const result = await postgresPool.query<InitiativeRow>('SELECT * FROM workstream_initiatives WHERE id = $1 LIMIT 1;', [id]);
    const row = result.rows?.[0];
    return row ? mapRowToRecord(row) : null;
  }

  async createInitiative(model: InitiativeWriteModel): Promise<InitiativeRecord> {
    const result = await postgresPool.query<InitiativeRow>(
      `INSERT INTO workstream_initiatives (id, workstream_id, name, description, owner_account_id, owner_name, current_status, active_stage, l4_date, stage_payload, stage_state, plan_payload, financial_summary, risk_register, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, 1, NOW(), NOW())
       RETURNING *;`,
      [
        model.id,
        model.workstreamId,
        model.name,
        model.description,
        model.ownerAccountId,
        model.ownerName,
        model.currentStatus,
        model.activeStage,
        model.l4Date,
        JSON.stringify(model.stages),
        JSON.stringify(model.stageState),
        JSON.stringify(model.plan ?? createEmptyPlanModel()),
        JSON.stringify(model.financialSummary ?? { roi: null }),
        JSON.stringify(model.risks ?? [])
      ]
    );
    return mapRowToRecord(result.rows[0]);
  }

  async updateInitiative(
    model: InitiativeWriteModel,
    expectedVersion: number
  ): Promise<'not-found' | 'version-conflict' | InitiativeRecord> {
    const result = await postgresPool.query<InitiativeRow>(
      `UPDATE workstream_initiatives
          SET workstream_id = $2,
              name = $3,
              description = $4,
              owner_account_id = $5,
              owner_name = $6,
              current_status = $7,
              active_stage = $8,
              l4_date = $9,
              stage_payload = $10::jsonb,
              stage_state = $11::jsonb,
              plan_payload = $12::jsonb,
              financial_summary = $13::jsonb,
              risk_register = $14::jsonb,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $15
        RETURNING *;`,
      [
        model.id,
        model.workstreamId,
        model.name,
        model.description,
        model.ownerAccountId,
        model.ownerName,
        model.currentStatus,
        model.activeStage,
        model.l4Date,
        JSON.stringify(model.stages),
        JSON.stringify(model.stageState),
        JSON.stringify(model.plan ?? createEmptyPlanModel()),
        JSON.stringify(model.financialSummary ?? { roi: null }),
        JSON.stringify(model.risks ?? []),
        expectedVersion
      ]
    );
    if (!result.rows?.length) {
      const exists = await postgresPool.query('SELECT 1 FROM workstream_initiatives WHERE id = $1 LIMIT 1;', [model.id]);
      const count = (exists as { rowCount?: number }).rowCount ?? 0;
      if (count === 0) {
        return 'not-found';
      }
      return 'version-conflict';
    }
    return mapRowToRecord(result.rows[0]);
  }

  async deleteInitiative(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM workstream_initiatives WHERE id = $1;', [id]);
    const affected = (result as { rowCount?: number }).rowCount ?? 0;
    return affected > 0;
  }

  async updateStageState(id: string, state: InitiativeStageStateMap): Promise<InitiativeRecord | null> {
    const result = await postgresPool.query<InitiativeRow>(
      `UPDATE workstream_initiatives
          SET stage_state = $2::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *;`,
      [id, JSON.stringify(state)]
    );
    const row = result.rows?.[0];
    return row ? mapRowToRecord(row) : null;
  }

  async listApprovals(): Promise<InitiativeApprovalRecord[]> {
    const result = await postgresPool.query<InitiativeApprovalRow>(
      'SELECT * FROM workstream_initiative_approvals ORDER BY created_at ASC;'
    );
    return (result.rows ?? []).map((row) => ({
      id: row.id,
      initiativeId: row.initiative_id,
      stageKey: normalizeStageKey(row.stage_key) as InitiativeApprovalRecord['stageKey'],
      roundIndex: Number(row.round_index ?? 0),
      role: row.role,
      rule: (row.rule as InitiativeApprovalRecord['rule']) ?? 'any',
      accountId: row.account_id ?? null,
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    }));
  }

  async listApprovalsForStage(
    initiativeId: string,
    stageKey: InitiativeStageKey,
    roundIndex: number
  ): Promise<InitiativeApprovalRecord[]> {
    const result = await postgresPool.query<InitiativeApprovalRow>(
      `SELECT * FROM workstream_initiative_approvals
        WHERE initiative_id = $1 AND stage_key = $2 AND round_index = $3
        ORDER BY created_at ASC;`,
      [initiativeId, stageKey, roundIndex]
    );
    return (result.rows ?? []).map((row) => ({
      id: row.id,
      initiativeId: row.initiative_id,
      stageKey: normalizeStageKey(row.stage_key),
      roundIndex: Number(row.round_index ?? 0),
      role: row.role,
      rule: (row.rule as InitiativeApprovalRecord['rule']) ?? 'any',
      accountId: row.account_id ?? null,
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    }));
  }

  async insertApprovals(
    approvals: Array<{
      id: string;
      initiativeId: string;
      stageKey: InitiativeStageKey;
      roundIndex: number;
      role: string;
      rule: InitiativeApprovalRecord['rule'];
      accountId: string | null;
    }>
  ) {
    for (const approval of approvals) {
      await postgresPool.query(
        `INSERT INTO workstream_initiative_approvals (id, initiative_id, stage_key, round_index, role, rule, account_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
         ON CONFLICT (initiative_id, stage_key, round_index, role, account_id)
         DO NOTHING;`,
        [approval.id, approval.initiativeId, approval.stageKey, approval.roundIndex, approval.role, approval.rule, approval.accountId]
      );
    }
  }

  async updateApprovalStatus(
    id: string,
    status: 'approved' | 'returned' | 'rejected' | 'pending',
    comment?: string | null
  ): Promise<InitiativeApprovalRecord | null> {
    const result = await postgresPool.query<InitiativeApprovalRow>(
      `UPDATE workstream_initiative_approvals
          SET status = $2,
              comment = $3,
              decided_at = NOW()
        WHERE id = $1
        RETURNING *;`,
      [id, status, comment ?? null]
    );
    const row = result.rows?.[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      initiativeId: row.initiative_id,
      stageKey: normalizeStageKey(row.stage_key),
      roundIndex: Number(row.round_index ?? 0),
      role: row.role,
      rule: (row.rule as InitiativeApprovalRecord['rule']) ?? 'any',
      accountId: row.account_id ?? null,
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    };
  }

  async findApproval(id: string): Promise<InitiativeApprovalRecord | null> {
    const result = await postgresPool.query<InitiativeApprovalRow>(
      'SELECT * FROM workstream_initiative_approvals WHERE id = $1 LIMIT 1;',
      [id]
    );
    const row = result.rows?.[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      initiativeId: row.initiative_id,
      stageKey: normalizeStageKey(row.stage_key),
      roundIndex: Number(row.round_index ?? 0),
      role: row.role,
      rule: (row.rule as InitiativeApprovalRecord['rule']) ?? 'any',
      accountId: row.account_id ?? null,
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    };
  }

  async deleteApprovalsForStage(initiativeId: string, stageKey: InitiativeStageKey): Promise<void> {
    await postgresPool.query(
      `DELETE FROM workstream_initiative_approvals
        WHERE initiative_id = $1 AND stage_key = $2;`,
      [initiativeId, stageKey]
    );
  }

  async updateApprovalsForRole(
    initiativeId: string,
    stageKey: InitiativeStageKey,
    roundIndex: number,
    role: string,
    fromStatuses: InitiativeApprovalRecord['status'][],
    nextStatus: InitiativeApprovalRecord['status'],
    comment?: string | null
  ): Promise<void> {
    await postgresPool.query(
      `UPDATE workstream_initiative_approvals
          SET status = $6,
              comment = COALESCE($7, comment),
              decided_at = CASE WHEN $6 <> 'pending' THEN NOW() ELSE decided_at END
        WHERE initiative_id = $1
          AND stage_key = $2
          AND round_index = $3
          AND role = $4
          AND status = ANY($5::text[]);`,
      [initiativeId, stageKey, roundIndex, role, fromStatuses, nextStatus, comment ?? null]
    );
  }

  async updateApprovalsForStage(
    initiativeId: string,
    stageKey: InitiativeStageKey,
    fromStatuses: InitiativeApprovalRecord['status'][],
    nextStatus: InitiativeApprovalRecord['status'],
    comment?: string | null
  ): Promise<void> {
    await postgresPool.query(
      `UPDATE workstream_initiative_approvals
          SET status = $4,
              comment = COALESCE($5, comment),
              decided_at = CASE WHEN $4 <> 'pending' THEN NOW() ELSE decided_at END
        WHERE initiative_id = $1
          AND stage_key = $2
          AND status = ANY($3::text[]);`,
      [initiativeId, stageKey, fromStatuses, nextStatus, comment ?? null]
    );
  }

  async listApprovalTaskRows(filter: {
    status?: InitiativeApprovalRecord['status'];
    accountId?: string | null;
  } = {}): Promise<ApprovalTaskRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`wa.status = $${params.length}`);
    }
    if (filter.accountId) {
      params.push(filter.accountId);
      conditions.push(`wa.account_id = $${params.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const partition = 'PARTITION BY wa.initiative_id, wa.stage_key, wa.round_index';
    const result = await postgresPool.query<ApprovalTaskRow>(
      `
        SELECT
          wa.*,
          i.name AS initiative_name,
          i.description AS initiative_description,
          i.workstream_id,
          i.current_status,
          i.active_stage,
          i.version,
          i.created_at,
          i.updated_at,
          i.l4_date,
          i.stage_payload,
          i.stage_state,
          i.plan_payload,
          i.risk_register,
          i.owner_name,
          i.owner_account_id,
          w.name AS workstream_name,
          w.description AS workstream_description,
          w.gates AS workstream_gates,
          COALESCE(
            NULLIF(trim(a.display_name), ''),
            NULLIF(trim(concat_ws(' ', a.first_name, a.last_name)), ''),
            NULLIF(trim(a.email), '')
          ) AS account_name,
          a.email AS account_email,
          wra.role AS account_role,
          COUNT(*) OVER (${partition}) AS round_total,
          COUNT(*) FILTER (WHERE wa.status = 'approved') OVER (${partition}) AS round_approved,
          COUNT(*) FILTER (WHERE wa.status = 'pending') OVER (${partition}) AS round_pending
        FROM workstream_initiative_approvals wa
        JOIN workstream_initiatives i ON i.id = wa.initiative_id
        JOIN workstreams w ON w.id = i.workstream_id
        LEFT JOIN accounts a ON a.id = wa.account_id
        LEFT JOIN workstream_role_assignments wra
          ON wra.account_id = wa.account_id AND wra.workstream_id = i.workstream_id
        ${whereClause}
        ORDER BY wa.created_at ASC;
      `,
      params
    );
    return result.rows ?? [];
  }

  async insertEvents(
    entries: Array<{
      id: string;
      eventId: string;
      initiativeId: string;
      eventType: string;
      field: string;
      previousValue: unknown;
      nextValue: unknown;
      actorAccountId?: string | null;
      actorName?: string | null;
    }>
  ): Promise<void> {
    if (!entries.length) {
      return;
    }
    for (const entry of entries) {
      await postgresPool.query(
        `INSERT INTO workstream_initiative_events
           (id, event_id, initiative_id, event_type, field, previous_value, next_value, actor_account_id, actor_name)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9);`,
        [
          entry.id,
          entry.eventId,
          entry.initiativeId,
          entry.eventType,
          entry.field,
          JSON.stringify(entry.previousValue ?? null),
          JSON.stringify(entry.nextValue ?? null),
          entry.actorAccountId ?? null,
          entry.actorName ?? null
        ]
      );
    }
  }

  async listEvents(initiativeId: string): Promise<InitiativeEventRecord[]> {
    const result = await postgresPool.query<InitiativeEventRow>(
      `SELECT *
         FROM workstream_initiative_events
        WHERE initiative_id = $1
        ORDER BY created_at DESC, event_id DESC;`,
      [initiativeId]
    );
    return (result.rows ?? []).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      initiativeId: row.initiative_id,
      eventType: row.event_type,
      field: row.field,
      previousValue: row.previous_value ?? null,
      nextValue: row.next_value ?? null,
      actorAccountId: row.actor_account_id ?? null,
      actorName: row.actor_name ?? null,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString()
    }));
  }

  async listStatusReports(initiativeId: string): Promise<InitiativeStatusReport[]> {
    const result = await postgresPool.query<InitiativeStatusReportRow>(
      `SELECT *
         FROM initiative_status_reports
        WHERE initiative_id = $1
        ORDER BY created_at DESC;`,
      [initiativeId]
    );
    return (result.rows ?? []).map((row) => mapStatusReportRow(row));
  }

  async insertStatusReport(payload: {
    id: string;
    initiativeId: string;
    entries: InitiativeStatusReportEntry[];
    planVersion: number | null;
    createdByAccountId: string | null;
    createdByName: string | null;
    summary: string;
  }): Promise<InitiativeStatusReport> {
    const result = await postgresPool.query<InitiativeStatusReportRow>(
      `INSERT INTO initiative_status_reports
         (id, initiative_id, entries, plan_version, summary, created_at, created_by_account_id, created_by_name)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), $6, $7)
       RETURNING *;`,
      [
        payload.id,
        payload.initiativeId,
        JSON.stringify(payload.entries ?? []),
        payload.planVersion ?? null,
        payload.summary,
        payload.createdByAccountId ?? null,
        payload.createdByName ?? null
      ]
    );
    const row = result.rows?.[0];
    if (!row) {
      throw new Error('INSERT_FAILED');
    }
    return mapStatusReportRow(row);
  }

  async listCommentThreads(
    initiativeId: string
  ): Promise<Array<{ thread: InitiativeCommentThreadRow; messages: InitiativeCommentMessageRow[] }>> {
    const threadResult = await postgresPool.query<InitiativeCommentThreadRow>(
      `SELECT *
         FROM initiative_comment_threads
        WHERE initiative_id = $1
        ORDER BY created_at ASC;`,
      [initiativeId]
    );
    const threads = threadResult.rows ?? [];
    if (!threads.length) {
      return [];
    }
    const threadIds = threads.map((thread) => thread.id);
    const messageResult = await postgresPool.query<InitiativeCommentMessageRow>(
      `SELECT *
         FROM initiative_comment_messages
        WHERE thread_id = ANY($1::uuid[])
        ORDER BY created_at ASC, id ASC;`,
      [threadIds]
    );
    const grouped = new Map<string, InitiativeCommentMessageRow[]>();
    for (const message of messageResult.rows ?? []) {
      const bucket = grouped.get(message.thread_id) ?? [];
      bucket.push(message);
      grouped.set(message.thread_id, bucket);
    }
    return threads.map((thread) => ({
      thread,
      messages: grouped.get(thread.id) ?? []
    }));
  }

  async listCommentMessages(threadId: string): Promise<InitiativeCommentMessageRow[]> {
    const result = await postgresPool.query<InitiativeCommentMessageRow>(
      `SELECT *
         FROM initiative_comment_messages
        WHERE thread_id = $1
        ORDER BY created_at ASC, id ASC;`,
      [threadId]
    );
    return result.rows ?? [];
  }

  async findCommentThread(id: string): Promise<InitiativeCommentThreadRow | null> {
    const result = await postgresPool.query<InitiativeCommentThreadRow>(
      `SELECT *
         FROM initiative_comment_threads
        WHERE id = $1
        LIMIT 1;`,
      [id]
    );
      return result.rows?.[0] ?? null;
    }

  async findCommentMessage(id: string): Promise<InitiativeCommentMessageRow | null> {
    const result = await postgresPool.query<InitiativeCommentMessageRow>(
      `SELECT *
         FROM initiative_comment_messages
        WHERE id = $1
        LIMIT 1;`,
      [id]
    );
    return result.rows?.[0] ?? null;
  }

  async createCommentThread(payload: {
    threadId: string;
    initiativeId: string;
    stageKey?: string | null;
    targetId: string;
    targetLabel?: string | null;
    targetPath?: string | null;
    selection?: unknown;
    authorAccountId?: string | null;
    authorName?: string | null;
    messageId: string;
    body: string;
  }): Promise<{ thread: InitiativeCommentThreadRow; message: InitiativeCommentMessageRow }> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      const threadResult = await client.query<InitiativeCommentThreadRow>(
        `INSERT INTO initiative_comment_threads
           (id, initiative_id, stage_key, target_id, target_label, target_path, selection, created_by_account_id, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         RETURNING *;`,
        [
          payload.threadId,
          payload.initiativeId,
          payload.stageKey ?? null,
          payload.targetId,
          payload.targetLabel ?? null,
          payload.targetPath ?? null,
          payload.selection ? JSON.stringify(payload.selection) : null,
          payload.authorAccountId ?? null,
          payload.authorName ?? null
        ]
      );
      const threadRow = threadResult.rows?.[0];
      if (!threadRow) {
        throw new Error('INSERT_FAILED');
      }
      const messageResult = await client.query<InitiativeCommentMessageRow>(
        `INSERT INTO initiative_comment_messages
           (id, thread_id, parent_id, body, author_account_id, author_name)
         VALUES ($1, $2, NULL, $3, $4, $5)
         RETURNING *;`,
        [
          payload.messageId,
          payload.threadId,
          payload.body,
          payload.authorAccountId ?? null,
          payload.authorName ?? null
        ]
      );
      const messageRow = messageResult.rows?.[0];
      if (!messageRow) {
        throw new Error('INSERT_FAILED');
      }
      await client.query('COMMIT');
      return { thread: threadRow, message: messageRow };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertCommentMessage(payload: {
    id: string;
    threadId: string;
    parentId?: string | null;
    body: string;
    authorAccountId?: string | null;
    authorName?: string | null;
  }): Promise<InitiativeCommentMessageRow | null> {
    const result = await postgresPool.query<InitiativeCommentMessageRow>(
      `INSERT INTO initiative_comment_messages
         (id, thread_id, parent_id, body, author_account_id, author_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *;`,
      [
        payload.id,
        payload.threadId,
        payload.parentId ?? null,
        payload.body,
        payload.authorAccountId ?? null,
        payload.authorName ?? null
      ]
    );
    return result.rows?.[0] ?? null;
  }

  async updateCommentThreadResolution(
    threadId: string,
    resolved: boolean,
    actorAccountId?: string | null,
    actorName?: string | null
  ): Promise<InitiativeCommentThreadRow | null> {
    const result = await postgresPool.query<InitiativeCommentThreadRow>(
      `UPDATE initiative_comment_threads
          SET resolved_at = $2,
              resolved_by_account_id = $3,
              resolved_by_name = $4
        WHERE id = $1
        RETURNING *;`,
      [threadId, resolved ? new Date() : null, resolved ? actorAccountId ?? null : null, resolved ? actorName ?? null : null]
    );
    return result.rows?.[0] ?? null;
  }

  async deleteCommentThread(threadId: string): Promise<boolean> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM initiative_comment_messages WHERE thread_id = $1;`,
        [threadId]
      );
      const result = await client.query(
        `DELETE FROM initiative_comment_threads WHERE id = $1;`,
        [threadId]
      );
      await client.query('COMMIT');
      return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteCommentMessage(messageId: string): Promise<boolean> {
    const result = await postgresPool.query(
      `DELETE FROM initiative_comment_messages WHERE id = $1;`,
      [messageId]
    );
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async countThreadMessages(threadId: string): Promise<number> {
    const result = await postgresPool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM initiative_comment_messages WHERE thread_id = $1;`,
      [threadId]
    );
    return parseInt(result.rows?.[0]?.count ?? '0', 10);
  }

  async listRiskComments(initiativeId: string): Promise<InitiativeRiskCommentRow[]> {
    const result = await postgresPool.query<InitiativeRiskCommentRow>(
      `SELECT *
         FROM initiative_risk_comments
        WHERE initiative_id = $1
        ORDER BY created_at ASC, id ASC;`,
      [initiativeId]
    );
    return result.rows ?? [];
  }

  async insertRiskComment(payload: {
    id: string;
    initiativeId: string;
    riskId: string;
    snapshotId?: string | null;
    body: string;
    authorAccountId?: string | null;
    authorName?: string | null;
  }): Promise<InitiativeRiskCommentRow | null> {
    const result = await postgresPool.query<InitiativeRiskCommentRow>(
      `INSERT INTO initiative_risk_comments
         (id, initiative_id, risk_id, snapshot_id, body, author_account_id, author_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *;`,
      [
        payload.id,
        payload.initiativeId,
        payload.riskId,
        payload.snapshotId ?? null,
        payload.body,
        payload.authorAccountId ?? null,
        payload.authorName ?? null
      ]
    );
    return result.rows?.[0] ?? null;
  }

  async updateRiskCommentResolution(
    commentId: string,
    resolved: boolean,
    actorAccountId?: string | null,
    actorName?: string | null
  ): Promise<InitiativeRiskCommentRow | null> {
    const result = await postgresPool.query<InitiativeRiskCommentRow>(
      `UPDATE initiative_risk_comments
          SET resolved_at = $2,
              resolved_by_account_id = $3,
              resolved_by_name = $4
        WHERE id = $1
        RETURNING *;`,
      [
        commentId,
        resolved ? new Date() : null,
        resolved ? actorAccountId ?? null : null,
        resolved ? actorName ?? null : null
      ]
    );
    return result.rows?.[0] ?? null;
  }

  async listRiskAssessments(initiativeId: string): Promise<InitiativeRiskAssessmentRow[]> {
    const result = await postgresPool.query<InitiativeRiskAssessmentRow>(
      `SELECT *
         FROM initiative_risk_assessments
        WHERE initiative_id = $1
        ORDER BY sequence DESC, created_at DESC;`,
      [initiativeId]
    );
    return result.rows ?? [];
  }

  async findRiskAssessment(initiativeId: string, assessmentId: string): Promise<InitiativeRiskAssessmentRow | null> {
    const result = await postgresPool.query<InitiativeRiskAssessmentRow>(
      `SELECT *
         FROM initiative_risk_assessments
        WHERE initiative_id = $1 AND id = $2
        LIMIT 1;`,
      [initiativeId, assessmentId]
    );
    return result.rows?.[0] ?? null;
  }

  async insertRiskAssessment(payload: {
    id: string;
    initiativeId: string;
    stageKey: string;
    kind: string;
    risks: InitiativeRisk[];
    actorAccountId?: string | null;
    actorName?: string | null;
  }): Promise<InitiativeRiskAssessmentRow | null> {
    const result = await postgresPool.query<InitiativeRiskAssessmentRow>(
      `WITH next_seq AS (
         SELECT COALESCE(MAX(sequence), 0) + 1 AS seq
           FROM initiative_risk_assessments
          WHERE initiative_id = $2
       )
       INSERT INTO initiative_risk_assessments
         (id, initiative_id, sequence, stage_key, kind, risks, actor_account_id, actor_name)
       SELECT $1, $2, next_seq.seq, $3, $4, $5::jsonb, $6, $7
         FROM next_seq
       RETURNING *;`,
      [
        payload.id,
        payload.initiativeId,
        payload.stageKey,
        payload.kind,
        JSON.stringify(payload.risks ?? []),
        payload.actorAccountId ?? null,
        payload.actorName ?? null
      ]
    );
    return result.rows?.[0] ?? null;
  }
}
