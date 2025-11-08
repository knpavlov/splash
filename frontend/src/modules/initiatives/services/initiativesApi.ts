import { apiRequest } from '../../../shared/api/httpClient';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  Initiative,
  InitiativeFinancialEntry,
  InitiativeStageData,
  InitiativeStageMap,
  InitiativeTotals,
  InitiativeStageKey
} from '../../../shared/types/initiative';

const toIsoString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeDistribution = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      continue;
    }
    const numeric = normalizeNumber(raw);
    if (numeric !== null) {
      result[trimmedKey] = numeric;
    }
  }
  return result;
};

const normalizeFinancialEntry = (value: unknown): InitiativeFinancialEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { id?: unknown; label?: unknown; category?: unknown; distribution?: unknown };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : null;
  if (!id) {
    return null;
  }
  const label = typeof payload.label === 'string' ? payload.label.trim() : '';
  const category = typeof payload.category === 'string' ? payload.category.trim() : '';
  return {
    id,
    label,
    category,
    distribution: normalizeDistribution(payload.distribution)
  };
};

const createEmptyStage = (key: InitiativeStageKey): InitiativeStageData => ({
  key,
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
    {} as InitiativeStageData['financials']
  )
});

const normalizeStage = (key: InitiativeStageKey, value: unknown): InitiativeStageData => {
  const stage = createEmptyStage(key);
  if (!value || typeof value !== 'object') {
    return stage;
  }
  const payload = value as {
    name?: unknown;
    description?: unknown;
    periodMonth?: unknown;
    periodYear?: unknown;
    l4Date?: unknown;
    financials?: unknown;
  };
  stage.name = typeof payload.name === 'string' ? payload.name.trim() : '';
  stage.description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const month = normalizeNumber(payload.periodMonth);
  stage.periodMonth = month && month >= 1 && month <= 12 ? Math.trunc(month) : null;
  const year = normalizeNumber(payload.periodYear);
  stage.periodYear = year ? Math.trunc(year) : null;
  stage.l4Date = toIsoString(payload.l4Date);
  if (payload.financials && typeof payload.financials === 'object') {
    const source = payload.financials as Record<string, unknown>;
    for (const kind of initiativeFinancialKinds) {
      const list = Array.isArray(source[kind]) ? source[kind] : [];
      stage.financials[kind] = list
        .map((entry) => normalizeFinancialEntry(entry))
        .filter((entry): entry is InitiativeFinancialEntry => Boolean(entry));
    }
  }
  return stage;
};

const normalizeStageMap = (value: unknown): InitiativeStageMap => {
  const map = {} as InitiativeStageMap;
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of initiativeStageKeys) {
    map[key] = normalizeStage(key, payload[key]);
  }
  return map;
};

const normalizeTotals = (value: unknown): InitiativeTotals => {
  if (!value || typeof value !== 'object') {
    return {
      recurringBenefits: 0,
      recurringCosts: 0,
      oneoffBenefits: 0,
      oneoffCosts: 0,
      recurringImpact: 0
    };
  }
  const payload = value as Record<string, unknown>;
  const recurringBenefits = normalizeNumber(payload.recurringBenefits) ?? 0;
  const recurringCosts = normalizeNumber(payload.recurringCosts) ?? 0;
  const oneoffBenefits = normalizeNumber(payload.oneoffBenefits) ?? 0;
  const oneoffCosts = normalizeNumber(payload.oneoffCosts) ?? 0;
  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: normalizeNumber(payload.recurringImpact) ?? recurringBenefits - recurringCosts
  };
};

const normalizeInitiative = (value: unknown): Initiative | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id.trim() : null;
  const workstreamId = typeof payload.workstreamId === 'string' ? payload.workstreamId.trim() : null;
  const name = typeof payload.name === 'string' ? payload.name.trim() : null;
  if (!id || !workstreamId || !name) {
    return null;
  }
  const description = typeof payload.description === 'string' ? payload.description : '';
  const ownerAccountId = typeof payload.ownerAccountId === 'string' ? payload.ownerAccountId : null;
  const ownerName = typeof payload.ownerName === 'string' ? payload.ownerName : null;
  const currentStatus = typeof payload.currentStatus === 'string' ? payload.currentStatus : 'draft';
  const activeStage = initiativeStageKeys.includes(payload.activeStage as InitiativeStageKey)
    ? (payload.activeStage as InitiativeStageKey)
    : 'l0';
  const version = typeof payload.version === 'number' ? payload.version : Number(payload.version) || 1;
  const createdAt = toIsoString(payload.createdAt) ?? new Date().toISOString();
  const updatedAt = toIsoString(payload.updatedAt) ?? createdAt;
  const l4Date = toIsoString(payload.l4Date);
  const stages = normalizeStageMap(payload.stages);
  const totals = normalizeTotals(payload.totals);

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
    version,
    createdAt,
    updatedAt,
    stages,
    totals
  };
};

const ensureInitiative = (value: unknown): Initiative => {
  const initiative = normalizeInitiative(value);
  if (!initiative) {
    throw new Error('Failed to parse initiative payload.');
  }
  return initiative;
};

const ensureInitiativeList = (value: unknown): Initiative[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeInitiative(item)).filter((item): item is Initiative => Boolean(item));
};

export const initiativesApi = {
  list: async () => ensureInitiativeList(await apiRequest<unknown>('/initiatives')),
  get: async (id: string) => ensureInitiative(await apiRequest<unknown>(`/initiatives/${id}`)),
  create: async (initiative: Initiative) =>
    ensureInitiative(
      await apiRequest<unknown>('/initiatives', {
        method: 'POST',
        body: { initiative }
      })
    ),
  update: async (id: string, initiative: Initiative, expectedVersion: number) =>
    ensureInitiative(
      await apiRequest<unknown>(`/initiatives/${id}`, {
        method: 'PUT',
        body: { initiative, expectedVersion }
      })
    ),
  remove: async (id: string) => {
    await apiRequest<unknown>(`/initiatives/${id}`, { method: 'DELETE' });
    return id;
  },
  advance: async (id: string, targetStage?: InitiativeStageKey) =>
    ensureInitiative(
      await apiRequest<unknown>(`/initiatives/${id}/advance`, {
        method: 'POST',
        body: targetStage ? { targetStage } : undefined
      })
    )
};
