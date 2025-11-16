import { randomUUID } from 'crypto';
import { FinancialsRepository } from './financials.repository.js';
import {
  FinancialBlueprintModel,
  FinancialBlueprintRecord,
  FinancialLineComputation,
  FinancialLineItem,
  FinancialLineNature
} from './financials.types.js';
import {
  createDefaultBlueprintModel,
  DEFAULT_MONTH_COUNT,
  MAX_MONTH_COUNT,
  MIN_MONTH_COUNT
} from './financials.defaults.js';

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const MAX_INDENT_LEVEL = 6;

const clampIndent = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_INDENT_LEVEL, Math.floor(value)));
};

const slugify = (value: string) => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `LINE_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

const normalizeNature = (value: unknown): FinancialLineNature => {
  if (value === 'cost' || value === 'summary') {
    return value;
  }
  return 'revenue';
};

const normalizeComputation = (value: unknown): FinancialLineComputation => {
  if (value === 'children' || value === 'cumulative') {
    return value;
  }
  return 'manual';
};

const sanitizeMonths = (input: unknown): Record<string, number> => {
  if (!input || typeof input !== 'object') {
    return {};
  }
  return Object.entries(input as Record<string, unknown>).reduce((acc, [key, raw]) => {
    if (!MONTH_KEY_PATTERN.test(key)) {
      return acc;
    }
    const numeric = Number(raw);
    acc[key] = Number.isFinite(numeric) ? Number(raw) : 0;
    return acc;
  }, {} as Record<string, number>);
};

const sanitizeLines = (lines: unknown): FinancialLineItem[] => {
  if (!Array.isArray(lines)) {
    return [];
  }
  const usedCodes = new Map<string, number>();
  const sanitized: FinancialLineItem[] = [];
  for (const candidate of lines) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const source = candidate as Record<string, unknown>;
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name) {
      continue;
    }
    const id =
      typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomUUID();
    const baseCode =
      typeof source.code === 'string' && source.code.trim()
        ? slugify(source.code)
        : slugify(name);
    const codeUsage = usedCodes.get(baseCode) ?? 0;
    usedCodes.set(baseCode, codeUsage + 1);
    const code = codeUsage === 0 ? baseCode : `${baseCode}_${codeUsage + 1}`;
    const indent = clampIndent(Number(source.indent));
    const computation = normalizeComputation(source.computation);
    const nature = computation === 'manual' ? normalizeNature(source.nature) : 'summary';
    sanitized.push({
      id,
      code,
      name,
      indent,
      nature,
      computation,
      months: computation === 'manual' ? sanitizeMonths(source.months) : {}
    });
  }
  return sanitized;
};

const sanitizeBlueprint = (payload: unknown): FinancialBlueprintModel => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_INPUT');
  }
  const input = payload as {
    startMonth?: unknown;
    monthCount?: unknown;
    lines?: unknown;
  };
  const startMonth =
    typeof input.startMonth === 'string' && MONTH_KEY_PATTERN.test(input.startMonth)
      ? input.startMonth
      : new Date().toISOString().slice(0, 7);
  const rawMonthCount = Number(input.monthCount);
  const monthCount = Number.isFinite(rawMonthCount)
    ? Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, Math.floor(rawMonthCount)))
    : DEFAULT_MONTH_COUNT;
  const sanitizedLines = sanitizeLines(input.lines);
  return {
    startMonth,
    monthCount,
    lines: sanitizedLines.length ? sanitizedLines : createDefaultBlueprintModel().lines
  };
};

export class FinancialsService {
  constructor(private readonly repository: FinancialsRepository) {}

  async getBlueprint(): Promise<FinancialBlueprintRecord> {
    const existing = await this.repository.getBlueprint();
    if (existing && existing.lines.length) {
      return existing;
    }
    const defaults = createDefaultBlueprintModel();
    return this.repository.insertBlueprint(defaults);
  }

  async saveBlueprint(payload: unknown, expectedVersion: unknown): Promise<FinancialBlueprintRecord> {
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion)) {
      throw new Error('INVALID_INPUT');
    }
    const sanitized = sanitizeBlueprint(payload);
    const result = await this.repository.updateBlueprint(sanitized, expectedVersion);
    if (result.type === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    return result.record;
  }
}
