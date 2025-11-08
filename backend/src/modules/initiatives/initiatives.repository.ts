import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  InitiativeFinancialEntry,
  InitiativeRecord,
  InitiativeRow,
  InitiativeStageMap,
  InitiativeStagePayload,
  InitiativeWriteModel
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
  stages: ensureStageMap(row.stage_payload)
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
      `INSERT INTO workstream_initiatives (id, workstream_id, name, description, owner_account_id, owner_name, current_status, active_stage, l4_date, stage_payload, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 1, NOW(), NOW())
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
        JSON.stringify(model.stages)
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
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $11
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
}
