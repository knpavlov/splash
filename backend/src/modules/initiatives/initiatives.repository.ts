import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  InitiativeFinancialEntry,
  InitiativeRecord,
  InitiativeRow,
  InitiativeStageMap,
  InitiativeStagePayload,
  InitiativeStageState,
  InitiativeStageStateMap,
  InitiativeStageKey,
  InitiativeWriteModel,
  InitiativeApprovalRow,
  InitiativeApprovalRecord
} from './initiatives.types.js';

const toIsoString = (value: Date | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;

const createEmptyFinancialEntry = (): InitiativeFinancialEntry => ({
  id: '',
  label: '',
  category: '',
  distribution: {}
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
  const payload = value as { id?: unknown; label?: unknown; category?: unknown; distribution?: unknown };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
  const label = typeof payload.label === 'string' ? payload.label.trim() : '';
  const category = typeof payload.category === 'string' ? payload.category.trim() : '';
  return {
    id,
    label,
    category,
    distribution: ensureDistribution(payload.distribution)
  };
};

const createEmptyStagePayload = (): InitiativeStagePayload => ({
  name: '',
  description: '',
  periodMonth: null,
  periodYear: null,
  l4Date: null,
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
  };
  const base = createEmptyStagePayload();
  base.name = typeof payload.name === 'string' ? payload.name.trim() : '';
  base.description = typeof payload.description === 'string' ? payload.description.trim() : '';
  base.periodMonth = Number.isInteger(payload.periodMonth) ? Number(payload.periodMonth) : null;
  base.periodYear = Number.isInteger(payload.periodYear) ? Number(payload.periodYear) : null;
  base.l4Date = typeof payload.l4Date === 'string' ? payload.l4Date : null;

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
  stageState: ensureStageState(row.stage_state)
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
      `INSERT INTO workstream_initiatives (id, workstream_id, name, description, owner_account_id, owner_name, current_status, active_stage, l4_date, stage_payload, stage_state, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, 1, NOW(), NOW())
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
        JSON.stringify(model.stageState)
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
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $12
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
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    }));
  }

  async insertApprovals(
    approvals: Array<{ id: string; initiativeId: string; stageKey: InitiativeStageKey; roundIndex: number; role: string }>
  ) {
    for (const approval of approvals) {
      await postgresPool.query(
        `INSERT INTO workstream_initiative_approvals (id, initiative_id, stage_key, round_index, role, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
         ON CONFLICT (initiative_id, stage_key, round_index, role)
         DO NOTHING;`,
        [approval.id, approval.initiativeId, approval.stageKey, approval.roundIndex, approval.role]
      );
    }
  }

  async updateApprovalStatus(
    id: string,
    status: 'approved' | 'returned' | 'rejected',
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
      status: row.status as InitiativeApprovalRecord['status'],
      comment: row.comment,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      decidedAt: toIsoString(row.decided_at)
    };
  }
}
