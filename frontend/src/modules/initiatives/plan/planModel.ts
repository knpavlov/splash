import {
  InitiativePlanCapacitySegment,
  InitiativePlanActualsModel,
  InitiativePlanActualTask,
  InitiativePlanBaseline,
  InitiativePlanModel,
  InitiativePlanTask
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';

export const PLAN_ZOOM_MIN = 0;
export const PLAN_ZOOM_MAX = 6;
export const PLAN_SPLIT_MIN = 0.2;
export const PLAN_SPLIT_MAX = 0.8;
export const PLAN_MAX_INDENT_LEVEL = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

const normalizeDateOnly = (value: unknown): string | null => {
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

const normalizeCapacityValue = (value: unknown): number | null => {
  const numeric = normalizeNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.max(0, Math.round(numeric * 100) / 100);
};

const normalizeMilestoneType = (value: unknown): string => {
  if (typeof value !== 'string') {
    return 'Standard';
  }
  const trimmed = value.trim();
  return trimmed || 'Standard';
};

const normalizePlanSegment = (
  value: unknown,
  taskStart: string | null,
  taskEnd: string | null
): InitiativePlanCapacitySegment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { id?: unknown; startDate?: unknown; endDate?: unknown; capacity?: unknown };
  const startDate = normalizeDateOnly(payload.startDate);
  const endDate = normalizeDateOnly(payload.endDate);
  if (!startDate || !endDate || endDate < startDate) {
    return null;
  }
  if (taskStart && startDate < taskStart) {
    return null;
  }
  if (taskEnd && endDate > taskEnd) {
    return null;
  }
  const capacity = normalizeCapacityValue(payload.capacity);
  if (capacity === null) {
    return null;
  }
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : generateId();
  return {
    id,
    startDate,
    endDate,
    capacity
  };
};

export const createEmptyPlanTask = (): InitiativePlanTask => ({
  id: generateId(),
  name: '',
  description: '',
  startDate: null,
  endDate: null,
  responsible: '',
  progress: 0,
  requiredCapacity: null,
  capacityMode: 'fixed',
  capacitySegments: [],
  indent: 0,
  color: null,
  milestoneType: 'Standard',
  baseline: null,
  sourceTaskId: null,
  archived: false
});

export const createEmptyPlanActualTask = (): InitiativePlanActualTask => ({
  ...createEmptyPlanTask(),
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

const normalizeBaselineSnapshot = (value: unknown): InitiativePlanBaseline | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as Partial<InitiativePlanBaseline>;
  const startDate = normalizeDateOnly(payload.startDate);
  const endDate = normalizeDateOnly(payload.endDate);
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
    requiredCapacity: normalizeCapacityValue(payload.requiredCapacity)
  };
};

const normalizePlanTask = (value: unknown): InitiativePlanTask => {
  const base = createEmptyPlanTask();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    description?: unknown;
    responsible?: unknown;
    progress?: unknown;
    requiredCapacity?: unknown;
    capacityMode?: unknown;
    capacitySegments?: unknown;
    indent?: unknown;
    color?: unknown;
    milestoneType?: unknown;
    baseline?: unknown;
    sourceTaskId?: unknown;
    archived?: unknown;
  };
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : base.id;
  let startDate = normalizeDateOnly(payload.startDate);
  let endDate = normalizeDateOnly(payload.endDate);
  if (startDate && !endDate) {
    endDate = startDate;
  } else if (!startDate && endDate) {
    startDate = endDate;
  } else if (startDate && endDate && endDate < startDate) {
    endDate = startDate;
  }
  const segments = Array.isArray(payload.capacitySegments)
    ? payload.capacitySegments
        .map((segment) => normalizePlanSegment(segment, startDate, endDate))
        .filter((segment): segment is InitiativePlanCapacitySegment => Boolean(segment))
        .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
    : [];
  let capacityMode: InitiativePlanTask['capacityMode'] =
    payload.capacityMode === 'variable' || segments.length ? 'variable' : 'fixed';
  let requiredCapacity = capacityMode === 'fixed' ? normalizeCapacityValue(payload.requiredCapacity) : null;
  if (capacityMode === 'variable' && !segments.length) {
    capacityMode = 'fixed';
    requiredCapacity = normalizeCapacityValue(payload.requiredCapacity);
  }
  return {
    id,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    startDate,
    endDate,
    description: typeof payload.description === 'string' ? payload.description.trim() : '',
    responsible: typeof payload.responsible === 'string' ? payload.responsible.trim() : '',
    progress: clamp(Math.round(normalizeNumber(payload.progress) ?? 0), 0, 100),
    requiredCapacity,
    capacityMode,
    capacitySegments: segments,
    indent: clamp(Math.trunc(normalizeNumber(payload.indent) ?? 0), 0, PLAN_MAX_INDENT_LEVEL),
    color: typeof payload.color === 'string' ? payload.color.trim() || null : null,
    milestoneType: normalizeMilestoneType(payload.milestoneType),
    baseline: normalizeBaselineSnapshot(payload.baseline) ?? null,
    sourceTaskId: typeof payload.sourceTaskId === 'string' ? payload.sourceTaskId.trim() || null : null,
    archived: Boolean(payload.archived)
  };
};

const normalizePlanSettings = (value: unknown): InitiativePlanModel['settings'] => {
  if (!value || typeof value !== 'object') {
    return { zoomLevel: 2, splitRatio: 0.45 };
  }
  const payload = value as { zoomLevel?: unknown; splitRatio?: unknown };
  const zoom = normalizeNumber(payload.zoomLevel);
  const split = normalizeNumber(payload.splitRatio);
  return {
    zoomLevel: clamp(Math.trunc(zoom ?? 2), PLAN_ZOOM_MIN, PLAN_ZOOM_MAX),
    splitRatio: clamp(split ?? 0.45, PLAN_SPLIT_MIN, PLAN_SPLIT_MAX)
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

export const createEmptyPlanActualsModel = (): InitiativePlanActualsModel => ({
  tasks: [],
  settings: {
    zoomLevel: 2,
    splitRatio: 0.45
  }
});

const normalizeActualTask = (value: unknown): InitiativePlanActualTask => {
  const base = createEmptyPlanActualTask();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const task = normalizePlanTask(value);
  const payload = value as { baseline?: unknown; sourceTaskId?: unknown; archived?: unknown };
  return {
    ...task,
    baseline: normalizeBaselineSnapshot(payload.baseline) ?? base.baseline,
    sourceTaskId: typeof payload.sourceTaskId === 'string' ? payload.sourceTaskId.trim() || null : task.sourceTaskId ?? null,
    archived: Boolean(payload.archived)
  };
};

const normalizePlanActuals = (value: unknown): InitiativePlanActualsModel => {
  if (!value || typeof value !== 'object') {
    return createEmptyPlanActualsModel();
  }
  const payload = value as { tasks?: unknown; settings?: unknown };
  const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  let valueStepLocked = false;
  const tasks = rawTasks.map((task) => {
    const normalized = normalizeActualTask(task);
    const milestone = normalizeMilestoneType(normalized.milestoneType);
    const isValueStep = milestone.toLowerCase() === 'value step';
    if (isValueStep) {
      if (valueStepLocked) {
        return { ...normalized, milestoneType: 'Standard' };
      }
      valueStepLocked = true;
    }
    return { ...normalized, milestoneType: milestone };
  });
  return {
    tasks,
    settings: normalizePlanSettings(payload.settings)
  };
};

export const normalizePlanModel = (value: unknown): InitiativePlanModel => {
  if (!value || typeof value !== 'object') {
    return createEmptyPlanModel();
  }
  const payload = value as { tasks?: unknown; settings?: unknown; actuals?: unknown };
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  let valueStepLocked = false;
  return {
    tasks: tasks.map((task) => {
      const normalized = normalizePlanTask(task);
      const milestone = normalizeMilestoneType(normalized.milestoneType);
      const isValueStep = milestone.toLowerCase() === 'value step';
      if (isValueStep) {
        if (valueStepLocked) {
          return { ...normalized, milestoneType: 'Standard' };
        }
        valueStepLocked = true;
      }
      return { ...normalized, milestoneType: milestone };
    }),
    settings: normalizePlanSettings(payload.settings),
    actuals: normalizePlanActuals(payload.actuals)
  };
};

export const sanitizePlanModel = (plan: InitiativePlanModel | null | undefined): InitiativePlanModel =>
  normalizePlanModel(plan ?? null);
