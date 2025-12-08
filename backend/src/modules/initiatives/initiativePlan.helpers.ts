import { randomUUID } from 'crypto';
import {
  InitiativePlanActualsModel,
  InitiativePlanActualTask,
  InitiativePlanBaseline,
  InitiativePlanAssignee,
  InitiativePlanCapacityMode,
  InitiativePlanCapacitySegment,
  InitiativePlanModel,
  InitiativePlanTask
} from './initiatives.types.js';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const PLAN_MAX_INDENT_LEVEL = 2;

const sanitizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sanitizeDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }
  return null;
};

const sanitizeProgress = (value: unknown) => {
  const numeric = sanitizeNumber(value);
  if (numeric === null) {
    return 0;
  }
  return clamp(Math.round(numeric), 0, 100);
};

const sanitizeCapacity = (value: unknown) => {
  const numeric = sanitizeNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.max(0, Math.round(numeric * 100) / 100);
};

const sanitizeIndent = (value: unknown) => {
  const numeric = sanitizeNumber(value);
  if (numeric === null) {
    return 0;
  }
  return clamp(Math.trunc(numeric), 0, PLAN_MAX_INDENT_LEVEL);
};

const sanitizeColor = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const sanitizeMilestoneType = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'Standard';
  }
  const trimmed = value.trim();
  return trimmed || 'Standard';
};

const ensureDateOrder = (start: string | null, end: string | null): [string | null, string | null] => {
  if (start && !end) {
    return [start, start];
  }
  if (!start && end) {
    return [end, end];
  }
  if (start && end && end < start) {
    return [start, start];
  }
  return [start, end];
};

const sanitizeSegment = (
  value: unknown,
  taskStart: string | null,
  taskEnd: string | null
): InitiativePlanCapacitySegment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { id?: unknown; startDate?: unknown; endDate?: unknown; capacity?: unknown };
  const startDate = sanitizeDate(payload.startDate);
  const endDate = sanitizeDate(payload.endDate);
  if (!startDate || !endDate || endDate < startDate) {
    return null;
  }
  if (taskStart && startDate < taskStart) {
    return null;
  }
  if (taskEnd && endDate > taskEnd) {
    return null;
  }
  const capacity = sanitizeCapacity(payload.capacity);
  if (capacity === null) {
    return null;
  }
  const id =
    typeof payload.id === 'string' && payload.id.trim()
      ? payload.id.trim()
      : randomUUID();
  return {
    id,
    startDate,
    endDate,
    capacity
  };
};

const sanitizeSegments = (
  value: unknown,
  taskStart: string | null,
  taskEnd: string | null
): InitiativePlanCapacitySegment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const sanitized = value
    .map((entry) => sanitizeSegment(entry, taskStart, taskEnd))
    .filter((entry): entry is InitiativePlanCapacitySegment => Boolean(entry))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  const filtered: InitiativePlanCapacitySegment[] = [];
  let lastEnd: string | null = null;
  for (const segment of sanitized) {
    if (lastEnd && segment.startDate <= lastEnd) {
      continue;
    }
    filtered.push(segment);
    lastEnd = segment.endDate;
  }
  return filtered;
};

const sanitizeAssignee = (
  value: unknown,
  taskStart: string | null,
  taskEnd: string | null,
  defaults: {
    id: string;
    name: string;
    capacityMode: InitiativePlanCapacityMode;
    requiredCapacity: number | null;
    segments: InitiativePlanCapacitySegment[];
  }
): InitiativePlanAssignee | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
    capacityMode?: unknown;
    requiredCapacity?: unknown;
    capacitySegments?: unknown;
  };
  const id =
    typeof payload.id === 'string' && payload.id.trim()
      ? payload.id.trim()
      : defaults.id;
  const name = typeof payload.name === 'string' ? payload.name.trim() : defaults.name;
  const segments = sanitizeSegments(payload.capacitySegments, taskStart, taskEnd);
  let mode: InitiativePlanCapacityMode =
    payload.capacityMode === 'variable' || segments.length
      ? 'variable'
      : 'fixed';
  let requiredCapacity = mode === 'fixed' ? sanitizeCapacity(payload.requiredCapacity) : null;
  if (mode === 'variable' && !segments.length) {
    mode = 'fixed';
    requiredCapacity = sanitizeCapacity(payload.requiredCapacity);
  }
  const resolvedSegments = mode === 'variable' ? (segments.length ? segments : defaults.segments) : [];
  return {
    id,
    name,
    capacityMode: mode,
    requiredCapacity: mode === 'fixed' ? requiredCapacity ?? defaults.requiredCapacity ?? null : null,
    capacitySegments: resolvedSegments
  };
};

const sanitizeBaselineSnapshot = (value: unknown): InitiativePlanBaseline | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InitiativePlanBaseline>;
  const startDate = sanitizeDate(payload.startDate);
  const endDate = sanitizeDate(payload.endDate);
  let orderedStart = startDate;
  let orderedEnd = endDate;
  if (orderedStart && orderedEnd && orderedEnd < orderedStart) {
    orderedEnd = orderedStart;
  }
  return {
    name: typeof payload.name === 'string' ? payload.name : '',
    description: typeof payload.description === 'string' ? payload.description : '',
    startDate: orderedStart,
    endDate: orderedEnd,
    responsible: typeof payload.responsible === 'string' ? payload.responsible : '',
    milestoneType: typeof payload.milestoneType === 'string' ? payload.milestoneType : null,
    requiredCapacity: sanitizeCapacity(payload.requiredCapacity)
  };
};

const sanitizeTask = (value: unknown): InitiativePlanTask => {
  const base: InitiativePlanTask = {
    id: randomUUID(),
    name: '',
    startDate: null,
    description: '',
    endDate: null,
    responsible: '',
    progress: 0,
    requiredCapacity: null,
    capacityMode: 'fixed',
    capacitySegments: [],
    assignees: [],
    dependencies: [],
    indent: 0,
    color: null,
    milestoneType: 'Standard',
    baseline: null,
    sourceTaskId: null,
    archived: false
  };
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    responsible?: unknown;
    progress?: unknown;
    requiredCapacity?: unknown;
    capacityMode?: unknown;
    capacitySegments?: unknown;
    assignees?: unknown;
    dependencies?: unknown;
    indent?: unknown;
    color?: unknown;
    milestoneType?: unknown;
    baseline?: unknown;
    sourceTaskId?: unknown;
    archived?: unknown;
  };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  let startDate = sanitizeDate(payload.startDate);
  let endDate = sanitizeDate(payload.endDate);
  [startDate, endDate] = ensureDateOrder(startDate, endDate);

  const responsible = typeof payload.responsible === 'string' ? payload.responsible.trim() : '';
  const capacitySegments = sanitizeSegments(payload.capacitySegments, startDate, endDate);
  const mode =
    payload.capacityMode === 'variable' || capacitySegments.length
      ? 'variable'
      : 'fixed';
  const requiredCapacity = mode === 'fixed' ? sanitizeCapacity(payload.requiredCapacity) : null;
  const rawAssignees = Array.isArray(payload.assignees) ? payload.assignees : [];
  const defaultAssignee: InitiativePlanAssignee = {
    id: `${id}-primary`,
    name: responsible,
    capacityMode: mode,
    requiredCapacity: mode === 'fixed' ? requiredCapacity : null,
    capacitySegments: mode === 'variable' ? capacitySegments : []
  };
  const sanitizedAssignees = rawAssignees
    .map((entry, index) =>
      sanitizeAssignee(entry, startDate, endDate, {
        id: `${id}-${index}`,
        name: defaultAssignee.name,
        capacityMode: defaultAssignee.capacityMode,
        requiredCapacity: defaultAssignee.requiredCapacity,
        segments: defaultAssignee.capacitySegments
      })
    )
    .filter((entry): entry is InitiativePlanAssignee => Boolean(entry));
  const assignees = sanitizedAssignees.length
    ? sanitizedAssignees
    : [
        {
          ...defaultAssignee,
          capacitySegments:
            defaultAssignee.capacityMode === 'variable'
              ? [...defaultAssignee.capacitySegments]
              : []
        }
      ];
  const primaryAssignee = assignees[0];
  const resolvedMode = primaryAssignee.capacityMode;
  const resolvedRequiredCapacity =
    resolvedMode === 'fixed'
      ? sanitizeCapacity(primaryAssignee.requiredCapacity) ?? null
      : null;
  const resolvedSegments =
    resolvedMode === 'variable'
      ? [...primaryAssignee.capacitySegments]
      : [];
  const resolvedResponsible = primaryAssignee.name ?? responsible;
  const dependencies = Array.isArray(payload.dependencies)
    ? Array.from(
        new Set(
          payload.dependencies
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        )
      )
    : [];

  return {
    id,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    description: typeof payload.description === 'string' ? payload.description.trim() : '',
    startDate,
    endDate,
    responsible: resolvedResponsible,
    progress: sanitizeProgress(payload.progress),
    requiredCapacity: resolvedRequiredCapacity,
    capacityMode: resolvedMode,
    capacitySegments: resolvedMode === 'variable' ? resolvedSegments : [],
    assignees,
    dependencies,
    indent: sanitizeIndent(payload.indent),
    color: sanitizeColor(payload.color),
    milestoneType: sanitizeMilestoneType(payload.milestoneType),
    baseline: sanitizeBaselineSnapshot(payload.baseline),
    sourceTaskId: typeof payload.sourceTaskId === 'string' ? payload.sourceTaskId.trim() || null : null,
    archived: Boolean(payload.archived)
  };
};

const sanitizeSettings = (value: unknown): InitiativePlanModel['settings'] => {
  if (!value || typeof value !== 'object') {
    return {
      zoomLevel: 2,
      splitRatio: 0.45
    };
  }
  const payload = value as { zoomLevel?: unknown; splitRatio?: unknown };
  const zoomValue = sanitizeNumber(payload.zoomLevel);
  const splitValue = sanitizeNumber(payload.splitRatio);
  return {
    zoomLevel: zoomValue === null ? 2 : clamp(Math.trunc(zoomValue), 0, 6),
    splitRatio: splitValue === null ? 0.45 : clamp(splitValue, 0.2, 0.8)
  };
};

export const createEmptyPlanActualTask = (): InitiativePlanActualTask => ({
  ...sanitizeTask({}),
  baseline: {
    name: '',
    description: '',
    startDate: null,
    endDate: null,
    responsible: '',
    milestoneType: 'Standard',
    requiredCapacity: null
  },
  sourceTaskId: null,
  archived: false
});

export const createEmptyPlanActualsModel = (): InitiativePlanActualsModel => ({
  tasks: [],
  settings: {
    zoomLevel: 2,
    splitRatio: 0.45
  }
});

const sanitizeActualTask = (value: unknown): InitiativePlanActualTask => {
  const base = createEmptyPlanActualTask();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const task = sanitizeTask(value);
  const payload = value as { baseline?: unknown; sourceTaskId?: unknown; archived?: unknown };
  return {
    ...task,
    baseline: sanitizeBaselineSnapshot(payload.baseline) ?? base.baseline,
    sourceTaskId: typeof payload.sourceTaskId === 'string' ? payload.sourceTaskId.trim() || null : task.sourceTaskId ?? null,
    archived: Boolean(payload.archived)
  };
};

const sanitizePlanActuals = (value: unknown): InitiativePlanActualsModel => {
  if (!value || typeof value !== 'object') {
    return createEmptyPlanActualsModel();
  }
  const payload = value as { tasks?: unknown; settings?: unknown };
  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  let valueStepClaimed = false;
  const tasks = rawTasks.map((entry) => {
    const sanitized = sanitizeActualTask(entry);
    const milestone = sanitizeMilestoneType(sanitized.milestoneType);
    const isValueStep = milestone.toLowerCase() === 'value step';
    if (isValueStep) {
      if (valueStepClaimed) {
        return { ...sanitized, milestoneType: 'Standard' };
      }
      valueStepClaimed = true;
    }
    return { ...sanitized, milestoneType: milestone };
  });
  return {
    tasks,
    settings: sanitizeSettings(payload.settings)
  };
};

export const createEmptyPlanModel = (): InitiativePlanModel => ({
  tasks: [],
  settings: {
    zoomLevel: 2,
    splitRatio: 0.45
  },
  actuals: createEmptyPlanActualsModel()
});

export const normalizePlanModel = (value: unknown): InitiativePlanModel => {
  if (!value || typeof value !== 'object') {
    return createEmptyPlanModel();
  }
  const payload = value as { tasks?: unknown; settings?: unknown; actuals?: unknown };
  const tasksSource = Array.isArray(payload.tasks) ? payload.tasks : [];
  let valueStepClaimed = false;
  const tasks = tasksSource.map((task) => {
    const sanitized = sanitizeTask(task);
    const milestone = sanitizeMilestoneType(sanitized.milestoneType);
    const isValueStep = milestone.toLowerCase() === 'value step';
    if (isValueStep) {
      if (valueStepClaimed) {
        return { ...sanitized, milestoneType: 'Standard' };
      }
      valueStepClaimed = true;
    }
    return { ...sanitized, milestoneType: milestone };
  });
  return {
    tasks,
    settings: sanitizeSettings(payload.settings),
    actuals: sanitizePlanActuals(payload.actuals)
  };
};
