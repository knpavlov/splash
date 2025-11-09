import {
  InitiativeFinancialEntry,
  InitiativeFinancialKind,
  InitiativeStageData,
  initiativeFinancialKinds
} from '../../../shared/types/initiative';
import { FISCAL_YEAR_START_MONTH } from '../../../shared/config/finance';

export const parseMonthKey = (key: string) => {
  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return {
    year,
    month,
    date: new Date(year, month - 1, 1)
  };
};

export const buildMonthRange = (stage: InitiativeStageData) => {
  const now = new Date();
  now.setDate(1);

  const defaultEnd = new Date(now);
  defaultEnd.setMonth(defaultEnd.getMonth() + 11);

  const endYear = stage.periodYear ?? defaultEnd.getFullYear();
  const endMonth = stage.periodMonth ?? defaultEnd.getMonth() + 1;
  const endCandidate = new Date(endYear, endMonth - 1, 1);
  const end = endCandidate.getTime() < now.getTime() ? defaultEnd : endCandidate;

  let earliestTime: number | null = null;
  for (const kind of initiativeFinancialKinds) {
    stage.financials[kind].forEach((entry) => {
      Object.keys(entry.distribution).forEach((key) => {
        const parsed = parseMonthKey(key);
        if (!parsed) {
          return;
        }
        const timestamp = parsed.date.getTime();
        if (!earliestTime || timestamp < earliestTime) {
          earliestTime = timestamp;
        }
      });
    });
  }

  let start = now;
  if (typeof earliestTime === 'number' && earliestTime < now.getTime()) {
    start = new Date(earliestTime);
  }
  const months: { key: string; label: string; year: number; index: number }[] = [];
  const cursor = new Date(start);
  let index = 0;
  while (cursor.getTime() <= end.getTime() && months.length < 360) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleString('en-US', { month: 'short' }),
      year: cursor.getFullYear(),
      index
    });
    index += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

export const aggregateEntryMonths = (entries: InitiativeFinancialEntry[]) => {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    for (const [monthKey, rawValue] of Object.entries(entry.distribution)) {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        continue;
      }
      totals[monthKey] = (totals[monthKey] ?? 0) + numeric;
    }
  }
  return totals;
};

export const buildKindMonthlyTotals = (stage: InitiativeStageData, kind: InitiativeFinancialKind) =>
  aggregateEntryMonths(stage.financials[kind]);

export const calculateRunRate = (monthKeys: string[], totals: Record<string, number>, windowSize = 12) => {
  if (!monthKeys.length) {
    return 0;
  }
  const slice = monthKeys.slice(Math.max(monthKeys.length - windowSize, 0));
  return slice.reduce((sum, key) => sum + (totals[key] ?? 0), 0);
};

export interface YearSummaryEntry {
  label: string;
  value: number;
}

export interface YearSummaryResult {
  calendar: YearSummaryEntry[];
  fiscal: YearSummaryEntry[];
}

export const calculateYearSummaries = (
  totals: Record<string, number>,
  fiscalStartMonth = FISCAL_YEAR_START_MONTH
): YearSummaryResult => {
  const calendar = new Map<number, number>();
  const fiscal = new Map<number, number>();
  for (const [key, value] of Object.entries(totals)) {
    const parsed = parseMonthKey(key);
    if (!parsed) {
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    calendar.set(parsed.year, (calendar.get(parsed.year) ?? 0) + numeric);
    const fiscalYear = parsed.month >= fiscalStartMonth ? parsed.year + 1 : parsed.year;
    fiscal.set(fiscalYear, (fiscal.get(fiscalYear) ?? 0) + numeric);
  }
  const toList = (source: Map<number, number>, prefix = ''): YearSummaryEntry[] =>
    Array.from(source.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, total]) => ({
        label: prefix ? `${prefix}${year}` : String(year),
        value: total
      }));
  return {
    calendar: toList(calendar),
    fiscal: toList(fiscal, 'FY')
  };
};
