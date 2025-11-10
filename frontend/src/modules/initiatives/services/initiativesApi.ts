import { apiRequest } from '../../../shared/api/httpClient';
import {
  initiativeFinancialKinds,
  initiativeStageKeys,
  Initiative,
  InitiativeFinancialEntry,
  InitiativeStageData,
  InitiativeStageMap,
  InitiativeTotals,
  InitiativeStageKey,
  InitiativeStageStateMap,
  InitiativeCommentSelection,
  InitiativeCommentMessage,
  InitiativeCommentThread
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

const isStageKey = (value: string): value is InitiativeStageKey =>
  initiativeStageKeys.includes(value as InitiativeStageKey);

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

const createDefaultStageState = (): InitiativeStageStateMap =>
  initiativeStageKeys.reduce(
    (acc, key) => {
      acc[key] = { status: key === 'l0' ? 'approved' : 'draft', roundIndex: 0, comment: null };
      return acc;
    },
    {} as InitiativeStageStateMap
  );

const normalizeStageState = (value: unknown): InitiativeStageStateMap => {
  const base = createDefaultStageState();
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
        : base[key].status;
    const roundIndex = typeof entry.roundIndex === 'number' ? entry.roundIndex : base[key].roundIndex;
    const comment = typeof entry.comment === 'string' ? entry.comment : null;
    base[key] = { status, roundIndex, comment };
  }
  return base;
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
  const stageState = normalizeStageState(payload.stageState);
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
    stageState,
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

export interface InitiativeEventChange {
  field: string;
  previousValue: unknown;
  nextValue: unknown;
}

export interface InitiativeEventEntry {
  id: string;
  eventType: string;
  createdAt: string;
  actorAccountId: string | null;
  actorName: string | null;
  changes: InitiativeEventChange[];
}

const normalizeEventChange = (value: unknown): InitiativeEventChange | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { field?: unknown; previousValue?: unknown; nextValue?: unknown };
  if (typeof payload.field !== 'string') {
    return null;
  }
  return {
    field: payload.field,
    previousValue: payload.previousValue ?? null,
    nextValue: payload.nextValue ?? null
  };
};

const normalizeEventEntry = (value: unknown): InitiativeEventEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : null;
  if (!id) {
    return null;
  }
  const eventType = typeof payload.eventType === 'string' ? payload.eventType : 'update';
  const createdAt = toIsoString(payload.createdAt) ?? new Date().toISOString();
  const actorName = typeof payload.actorName === 'string' ? payload.actorName : null;
  const actorAccountId = typeof payload.actorAccountId === 'string' ? payload.actorAccountId : null;
  const changesSource = Array.isArray(payload.changes) ? payload.changes : [];
  const changes = changesSource
    .map((change) => normalizeEventChange(change))
    .filter((change): change is InitiativeEventChange => Boolean(change));
  return {
    id,
    eventType,
    createdAt,
    actorAccountId,
    actorName,
    changes
  };
};

const ensureEventList = (value: unknown): InitiativeEventEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeEventEntry(item)).filter((item): item is InitiativeEventEntry => Boolean(item));
};

export interface InitiativeActorMetadata {
  accountId?: string | null;
  name?: string | null;
}

const normalizeCommentSelection = (value: unknown): InitiativeCommentSelection | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const readNumber = (input: unknown) => {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }
    if (typeof input === 'string') {
      const parsed = Number(input.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const top = readNumber(payload.top);
  const left = readNumber(payload.left);
  const width = readNumber(payload.width);
  const height = readNumber(payload.height);
  const pageWidth = readNumber(payload.pageWidth);
  const pageHeight = readNumber(payload.pageHeight);
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
  return { top, left, width, height, pageWidth, pageHeight };
};

const normalizeCommentMessage = (value: unknown): InitiativeCommentMessage | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : null;
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : null;
  if (!id || !threadId) {
    return null;
  }
  return {
    id,
    threadId,
    parentId: typeof payload.parentId === 'string' ? payload.parentId : null,
    body: typeof payload.body === 'string' ? payload.body : '',
    authorAccountId: typeof payload.authorAccountId === 'string' ? payload.authorAccountId : null,
    authorName: typeof payload.authorName === 'string' ? payload.authorName : null,
    createdAt: toIsoString(payload.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(payload.updatedAt) ?? new Date().toISOString()
  };
};

const normalizeCommentThread = (value: unknown): InitiativeCommentThread | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const id = typeof payload.id === 'string' ? payload.id : null;
  const initiativeId = typeof payload.initiativeId === 'string' ? payload.initiativeId : null;
  if (!id || !initiativeId) {
    return null;
  }
  const stageKeyValue = typeof payload.stageKey === 'string' ? payload.stageKey : null;
  const normalizedStageKey = stageKeyValue && isStageKey(stageKeyValue.toLowerCase())
    ? (stageKeyValue.toLowerCase() as InitiativeStageKey)
    : null;
  const commentsSource = Array.isArray(payload.comments) ? payload.comments : [];
  const comments = commentsSource
    .map((entry) => normalizeCommentMessage(entry))
    .filter((entry): entry is InitiativeCommentMessage => Boolean(entry));
  return {
    id,
    initiativeId,
    stageKey: normalizedStageKey,
    targetId: typeof payload.targetId === 'string' ? payload.targetId : id,
    targetLabel: typeof payload.targetLabel === 'string' ? payload.targetLabel : null,
    targetPath: typeof payload.targetPath === 'string' ? payload.targetPath : null,
    selection: normalizeCommentSelection(payload.selection),
    createdAt: toIsoString(payload.createdAt) ?? new Date().toISOString(),
    createdByAccountId: typeof payload.createdByAccountId === 'string' ? payload.createdByAccountId : null,
    createdByName: typeof payload.createdByName === 'string' ? payload.createdByName : null,
    comments,
    resolvedAt: toIsoString(payload.resolvedAt) ?? null,
    resolvedByAccountId: typeof payload.resolvedByAccountId === 'string' ? payload.resolvedByAccountId : null,
    resolvedByName: typeof payload.resolvedByName === 'string' ? payload.resolvedByName : null
  };
};

const ensureCommentThread = (value: unknown): InitiativeCommentThread => {
  const thread = normalizeCommentThread(value);
  if (!thread) {
    throw new Error('Failed to parse comment thread payload.');
  }
  return thread;
};

const ensureCommentThreadList = (value: unknown): InitiativeCommentThread[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeCommentThread(entry)).filter((entry): entry is InitiativeCommentThread => Boolean(entry));
};

export interface InitiativeCommentInput {
  targetId: string;
  targetLabel?: string | null;
  targetPath?: string | null;
  stageKey?: InitiativeStageKey | null;
  selection?: InitiativeCommentSelection | null;
  body: string;
}

export interface InitiativeCommentReplyInput {
  body: string;
  parentId?: string | null;
}

const withActor = (payload: Record<string, unknown>, actor?: InitiativeActorMetadata) => {
  if (!actor) {
    return payload;
  }
  const normalized = {
    accountId: actor.accountId ?? null,
    name: actor.name ?? null
  };
  if (!normalized.accountId && !normalized.name) {
    return payload;
  }
  return { ...payload, actor: normalized };
};

export const initiativesApi = {
  list: async () => ensureInitiativeList(await apiRequest<unknown>('/initiatives')),
  get: async (id: string) => ensureInitiative(await apiRequest<unknown>(`/initiatives/${id}`)),
  create: async (initiative: Initiative, actor?: InitiativeActorMetadata) =>
    ensureInitiative(
      await apiRequest<unknown>('/initiatives', {
        method: 'POST',
        body: withActor({ initiative }, actor)
      })
    ),
  update: async (id: string, initiative: Initiative, expectedVersion: number, actor?: InitiativeActorMetadata) =>
    ensureInitiative(
      await apiRequest<unknown>(`/initiatives/${id}`, {
        method: 'PUT',
        body: withActor({ initiative, expectedVersion }, actor)
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
    ),
  submit: async (id: string) =>
    ensureInitiative(
      await apiRequest<unknown>(`/initiatives/${id}/submit`, {
        method: 'POST'
      })
    ),
  events: async (id: string) => ensureEventList(await apiRequest<unknown>(`/initiatives/${id}/events`)),
  listComments: async (id: string) => ensureCommentThreadList(await apiRequest<unknown>(`/initiatives/${id}/comments`)),
  createComment: async (id: string, input: InitiativeCommentInput, actor?: InitiativeActorMetadata) =>
    ensureCommentThread(
      await apiRequest<unknown>(`/initiatives/${id}/comments`, {
        method: 'POST',
        body: withActor({ comment: input }, actor)
      })
    ),
  replyToComment: async (
    id: string,
    threadId: string,
    input: InitiativeCommentReplyInput,
    actor?: InitiativeActorMetadata
  ) =>
    ensureCommentThread(
      await apiRequest<unknown>(`/initiatives/${id}/comments/${threadId}/replies`, {
        method: 'POST',
        body: withActor({ reply: input }, actor)
      })
    ),
  setCommentResolution: async (id: string, threadId: string, resolved: boolean, actor?: InitiativeActorMetadata) =>
    ensureCommentThread(
      await apiRequest<unknown>(`/initiatives/${id}/comments/${threadId}/status`, {
        method: 'PATCH',
        body: withActor({ resolved }, actor)
      })
    )
};
