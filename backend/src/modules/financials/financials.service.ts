import { randomUUID } from 'crypto';
import { FinancialsRepository } from './financials.repository.js';
import {
  FinancialBlueprintModel,
  FinancialBlueprintRecord,
  FinancialFiscalYearConfig,
  FinancialLineComputation,
  FinancialLineItem,
  FinancialLineNature,
  FinancialRatioDefinition
} from './financials.types.js';
import {
  createDefaultBlueprintModel,
  DEFAULT_MONTH_COUNT,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  MAX_MONTH_COUNT,
  MIN_MONTH_COUNT,
  createDefaultRatios
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

const sanitizeFiscalYear = (input: unknown): FinancialFiscalYearConfig => {
  if (!input || typeof input !== 'object') {
    return { startMonth: DEFAULT_FISCAL_YEAR_START_MONTH };
  }
  const source = input as Record<string, unknown>;
  const rawStart = Number(source.startMonth);
  const startMonth =
    Number.isFinite(rawStart) && rawStart >= 1 && rawStart <= 12
      ? Math.floor(rawStart)
      : DEFAULT_FISCAL_YEAR_START_MONTH;
  const label = typeof source.label === 'string' ? source.label.trim() : '';
  return label ? { startMonth, label } : { startMonth };
};

const sanitizeRatios = (ratios: unknown): FinancialRatioDefinition[] => {
  if (!Array.isArray(ratios)) {
    return createDefaultRatios();
  }
  const sanitized: FinancialRatioDefinition[] = [];
  for (const candidate of ratios) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const source = candidate as Record<string, unknown>;
    const label = typeof source.label === 'string' ? source.label.trim() : '';
    if (!label) {
      continue;
    }
    const numeratorCode =
      typeof source.numeratorCode === 'string' && source.numeratorCode.trim()
        ? slugify(source.numeratorCode)
        : '';
    const denominatorCode =
      typeof source.denominatorCode === 'string' && source.denominatorCode.trim()
        ? slugify(source.denominatorCode)
        : '';
    if (!numeratorCode || !denominatorCode) {
      continue;
    }
    const id =
      typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomUUID();
    const format = source.format === 'multiple' ? 'multiple' : 'percentage';
    const rawPrecision = Number(source.precision);
    const precision =
      Number.isFinite(rawPrecision) && rawPrecision >= 0
        ? Math.min(4, Math.max(0, Math.floor(rawPrecision)))
        : 1;
    const description =
      typeof source.description === 'string' && source.description.trim()
        ? source.description.trim()
        : undefined;
    sanitized.push({
      id,
      label,
      numeratorCode,
      denominatorCode,
      format,
      precision,
      description
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
    fiscalYear?: unknown;
    ratios?: unknown;
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
  const fiscalYear = sanitizeFiscalYear(input.fiscalYear);
  const ratios = sanitizeRatios(input.ratios);
  return {
    startMonth,
    monthCount,
    fiscalYear,
    ratios,
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
