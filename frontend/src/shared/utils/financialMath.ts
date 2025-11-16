import { FinancialLineItem } from '../types/financials';

export interface MonthDescriptor {
  key: string;
  year: number;
  month: number;
}

export const parseMonthKey = (key: string): MonthDescriptor | null => {
  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { key, year, month };
};

export const buildMonthIndex = (lines: FinancialLineItem[]) => {
  const keys = new Set<string>();
  lines.forEach((line) => {
    Object.keys(line.months ?? {}).forEach((key) => keys.add(key));
  });
  return Array.from(keys)
    .map((key) => parseMonthKey(key))
    .filter((month): month is MonthDescriptor => Boolean(month))
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));
};

export const buildEmptyRecord = (keys: string[]) =>
  keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<string, number>);

export const addToRecord = (target: Record<string, number>, source: Record<string, number>) => {
  Object.keys(target).forEach((key) => {
    target[key] = (target[key] ?? 0) + (source[key] ?? 0);
  });
};

export const lineEffect = (line: FinancialLineItem) => {
  if (line.nature === 'cost') {
    return -1;
  }
  return 1;
};

export const buildManualValueMap = (lines: FinancialLineItem[], monthKeys: string[]) => {
  const map = new Map<string, Record<string, number>>();
  for (const line of lines) {
    if (line.computation !== 'manual') {
      continue;
    }
    const effect = lineEffect(line);
    const record = buildEmptyRecord(monthKeys);
    monthKeys.forEach((key) => {
      const numeric = Number(line.months[key]);
      record[key] = Number.isFinite(numeric) ? effect * numeric : 0;
    });
    map.set(line.id, record);
  }
  return map;
};

export const buildCumulativeLookup = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  manualMap: Map<string, Record<string, number>>
) => {
  const running = buildEmptyRecord(monthKeys);
  const lookup = new Map<string, Record<string, number>>();
  for (const line of lines) {
    if (line.computation === 'manual') {
      const contribution = manualMap.get(line.id) ?? buildEmptyRecord(monthKeys);
      addToRecord(running, contribution);
    }
    if (line.computation === 'cumulative') {
      lookup.set(line.id, { ...running });
    }
  }
  return lookup;
};

export const buildValueMap = (
  lines: FinancialLineItem[],
  monthKeys: string[],
  childMap: Map<string, string[]>,
  manualMap: Map<string, Record<string, number>>,
  cumulativeLookup: Map<string, Record<string, number>>
) => {
  const memo = new Map<string, Record<string, number>>();
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const resolve = (line: FinancialLineItem): Record<string, number> => {
    if (memo.has(line.id)) {
      return memo.get(line.id)!;
    }
    let computed: Record<string, number>;
    if (line.computation === 'manual') {
      computed = manualMap.get(line.id) ?? buildEmptyRecord(monthKeys);
    } else if (line.computation === 'children') {
      const totals = buildEmptyRecord(monthKeys);
      const children = childMap.get(line.id) ?? [];
      for (const childId of children) {
        const child = lineById.get(childId);
        if (!child) {
          continue;
        }
        const childValue = resolve(child);
        addToRecord(totals, childValue);
      }
      computed = totals;
    } else {
      computed = cumulativeLookup.get(line.id) ?? buildEmptyRecord(monthKeys);
    }
    memo.set(line.id, computed);
    return computed;
  };

  lines.forEach((line) => resolve(line));
  return memo;
};
