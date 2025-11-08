import { randomUUID } from 'crypto';
import { InitiativesRepository } from './initiatives.repository.js';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  InitiativeFinancialEntry,
  InitiativeRecord,
  InitiativeResponse,
  InitiativeStageKey,
  InitiativeStageMap,
  InitiativeStagePayload,
  InitiativeTotals,
  InitiativeWriteModel
} from './initiatives.types.js';

const sanitizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sanitizeOptionalString = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const normalizeStageKey = (value: unknown): InitiativeStageKey => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (initiativeStageKeys.includes(normalized as InitiativeStageKey)) {
      return normalized as InitiativeStageKey;
    }
  }
  return 'l0';
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
      distribution: {}
    };
  }
  const payload = value as { id?: unknown; label?: unknown; category?: unknown; distribution?: unknown };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  const label = sanitizeString(payload.label);
  const category = sanitizeString(payload.category);
  return {
    id,
    label,
    category,
    distribution: sanitizeDistribution(payload.distribution)
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

const sumFinancialEntries = (stages: InitiativeStageMap, kind: typeof initiativeFinancialKinds[number]) => {
  let total = 0;
  for (const stageKey of initiativeStageKeys) {
    const entries = stages[stageKey].financials[kind];
    for (const entry of entries) {
      for (const value of Object.values(entry.distribution)) {
        if (Number.isFinite(value)) {
          total += value;
        }
      }
    }
  }
  return total;
};

const buildTotals = (record: InitiativeRecord): InitiativeTotals => {
  const recurringBenefits = sumFinancialEntries(record.stages, 'recurring-benefits');
  const recurringCosts = sumFinancialEntries(record.stages, 'recurring-costs');
  const oneoffBenefits = sumFinancialEntries(record.stages, 'oneoff-benefits');
  const oneoffCosts = sumFinancialEntries(record.stages, 'oneoff-costs');
  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};

const toResponse = (record: InitiativeRecord): InitiativeResponse => ({
  ...record,
  totals: buildTotals(record)
});

export class InitiativesService {
  constructor(private readonly repository: InitiativesRepository) {}

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
      stages
    };
  }

  async createInitiative(payload: unknown): Promise<InitiativeResponse> {
    const model = this.sanitizeModel(payload);
    const record = await this.repository.createInitiative(model);
    return toResponse(record);
  }

  async updateInitiative(id: string, payload: unknown, expectedVersion: number): Promise<InitiativeResponse> {
    if (!Number.isInteger(expectedVersion)) {
      throw new Error('INVALID_INPUT');
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
    return toResponse(result);
  }

  async removeInitiative(id: string): Promise<string> {
    const removed = await this.repository.deleteInitiative(id);
    if (!removed) {
      throw new Error('NOT_FOUND');
    }
    return id;
  }

  async advanceStage(id: string, targetStage?: InitiativeStageKey): Promise<InitiativeResponse> {
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
    const updatedModel: InitiativeWriteModel = {
      id: record.id,
      workstreamId: record.workstreamId,
      name: record.name,
      description: record.description,
      ownerAccountId: record.ownerAccountId,
      ownerName: record.ownerName,
      currentStatus: record.currentStatus,
      activeStage: desiredStage,
      l4Date: record.l4Date,
      stages: record.stages
    };
    const result = await this.repository.updateInitiative(updatedModel, record.version);
    if (typeof result === 'string') {
      if (result === 'version-conflict') {
        throw new Error('VERSION_CONFLICT');
      }
      throw new Error('NOT_FOUND');
    }
    return toResponse(result);
  }
}
