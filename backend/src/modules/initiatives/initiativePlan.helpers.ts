import { randomUUID } from 'crypto';
import {
  InitiativePlanCapacitySegment,
  InitiativePlanModel,
  InitiativePlanTask
} from './initiatives.types.js';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  return clamp(Math.trunc(numeric), 0, 8);
};

const sanitizeColor = (value: unknown) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
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

const sanitizeTask = (value: unknown): InitiativePlanTask => {
  const base: InitiativePlanTask = {
    id: randomUUID(),
    name: '',
    startDate: null,
    endDate: null,
    responsible: '',
    progress: 0,
    requiredCapacity: null,
    capacityMode: 'fixed',
    capacitySegments: [],
    indent: 0,
    color: null
  };
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
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
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : randomUUID();
  let startDate = sanitizeDate(payload.startDate);
  let endDate = sanitizeDate(payload.endDate);
  [startDate, endDate] = ensureDateOrder(startDate, endDate);

  const capacitySegments = sanitizeSegments(payload.capacitySegments, startDate, endDate);
  const mode =
    payload.capacityMode === 'variable' || capacitySegments.length
      ? 'variable'
      : 'fixed';
  const requiredCapacity = mode === 'fixed' ? sanitizeCapacity(payload.requiredCapacity) : null;

  return {
    id,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    startDate,
    endDate,
    responsible: typeof payload.responsible === 'string' ? payload.responsible.trim() : '',
    progress: sanitizeProgress(payload.progress),
    requiredCapacity,
    capacityMode: mode,
    capacitySegments,
    indent: sanitizeIndent(payload.indent),
    color: sanitizeColor(payload.color)
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
  const tasksSource = Array.isArray(payload.tasks) ? payload.tasks : [];
  return {
    tasks: tasksSource.map((task) => sanitizeTask(task)),
    settings: sanitizeSettings(payload.settings)
  };
};
