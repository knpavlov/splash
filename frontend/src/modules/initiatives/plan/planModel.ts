import {
  InitiativePlanCapacitySegment,
  InitiativePlanModel,
  InitiativePlanTask
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';

export const PLAN_ZOOM_MIN = 0;
export const PLAN_ZOOM_MAX = 6;
export const PLAN_SPLIT_MIN = 0.2;
export const PLAN_SPLIT_MAX = 0.8;

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
  color: null
});

const normalizePlanTask = (value: unknown): InitiativePlanTask => {
  const base = createEmptyPlanTask();
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
    indent?: unknown;
    color?: unknown;
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
    description: typeof payload.description === 'string' ? payload.description.trim() : '',
    startDate,
    endDate,
    responsible: typeof payload.responsible === 'string' ? payload.responsible.trim() : '',
    progress: clamp(Math.round(normalizeNumber(payload.progress) ?? 0), 0, 100),
    requiredCapacity,
    capacityMode,
    capacitySegments: segments,
    indent: clamp(Math.trunc(normalizeNumber(payload.indent) ?? 0), 0, 8),
    color: typeof payload.color === 'string' ? payload.color.trim() || null : null
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
  }
});

export const normalizePlanModel = (value: unknown): InitiativePlanModel => {
  if (!value || typeof value !== 'object') {
    return createEmptyPlanModel();
  }
  const payload = value as { tasks?: unknown; settings?: unknown };
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  return {
    tasks: tasks.map((task) => normalizePlanTask(task)),
    settings: normalizePlanSettings(payload.settings)
  };
};

export const sanitizePlanModel = (plan: InitiativePlanModel | null | undefined): InitiativePlanModel =>
  normalizePlanModel(plan ?? null);
