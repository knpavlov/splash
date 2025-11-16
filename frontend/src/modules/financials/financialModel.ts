import type { PnlCategory } from '../../shared/types/initiative';

export type FinancialLineNature = 'revenue' | 'cost' | 'summary';
export type FinancialAggregationMode = 'manual' | 'children' | 'cumulative';

export interface FinancialLineItem {
  id: string;
  code: string;
  name: string;
  indent: number;
  nature: FinancialLineNature;
  aggregation: FinancialAggregationMode;
  category: PnlCategory | '';
  notes?: string;
  months: Record<string, number>;
}

export interface FinancialBlueprint {
  startMonth: string;
  monthCount: number;
  lines: FinancialLineItem[];
}

export interface MonthColumn {
  key: string;
  label: string;
  year: number;
  index: number;
}

export const DEFAULT_MONTH_COUNT = 36;
export const MIN_MONTH_COUNT = 12;
export const MAX_MONTH_COUNT = 48;
export const MAX_INDENT_LEVEL = 4;

const formatMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const parseMonth = (value: string) => {
  const [yearStr, monthStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
};

export const buildMonthColumns = (startMonth: string, monthCount: number): MonthColumn[] => {
  const { year: startYear, month: startMonthIndex } = parseMonth(startMonth);
  const safeCount = Math.max(MIN_MONTH_COUNT, Math.min(MAX_MONTH_COUNT, Math.floor(monthCount)));
  const startDate = new Date(startYear, startMonthIndex - 1, 1);
  const months: MonthColumn[] = [];
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const cursor = new Date(startDate);
  for (let index = 0; index < safeCount; index += 1) {
    months.push({
      key: formatMonthKey(cursor.getFullYear(), cursor.getMonth() + 1),
      label: formatter.format(cursor),
      year: cursor.getFullYear(),
      index
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const createLine = (input: {
  id: string;
  code: string;
  name: string;
  indent?: number;
  nature?: FinancialLineNature;
  aggregation?: FinancialAggregationMode;
  category?: PnlCategory | '';
  notes?: string;
}): FinancialLineItem => ({
  id: input.id,
  code: input.code,
  name: input.name,
  indent: input.indent ?? 0,
  nature: input.nature ?? 'revenue',
  aggregation: input.aggregation ?? 'manual',
  category: input.category ?? '',
  notes: input.notes,
  months: {}
});

const defaultLines: FinancialLineItem[] = [
  createLine({
    id: 'rev-total',
    code: 'REV_TOTAL',
    name: 'Total revenue',
    nature: 'revenue',
    aggregation: 'children'
  }),
  createLine({
    id: 'rev-subscription',
    code: 'REV_SUBSCRIPTION',
    name: 'Subscription / recurring revenue',
    indent: 1,
    nature: 'revenue',
    category: 'Revenue'
  }),
  createLine({
    id: 'rev-services',
    code: 'REV_SERVICES',
    name: 'Services & implementation',
    indent: 1,
    nature: 'revenue',
    category: 'Revenue'
  }),
  createLine({
    id: 'rev-oneoff',
    code: 'REV_ONEOFF',
    name: 'One-off / project revenue',
    indent: 1,
    nature: 'revenue',
    category: 'Revenue'
  }),
  createLine({
    id: 'cogs-total',
    code: 'COGS_TOTAL',
    name: 'Cost of goods sold',
    nature: 'cost',
    aggregation: 'children',
    category: 'COGS'
  }),
  createLine({
    id: 'cogs-personnel',
    code: 'COGS_PERSONNEL',
    name: 'Delivery personnel',
    indent: 1,
    nature: 'cost',
    category: 'COGS'
  }),
  createLine({
    id: 'cogs-other',
    code: 'COGS_OTHER',
    name: 'Vendors & other delivery costs',
    indent: 1,
    nature: 'cost',
    category: 'COGS'
  }),
  createLine({
    id: 'gross-profit',
    code: 'GROSS_PROFIT',
    name: 'Gross profit',
    aggregation: 'cumulative',
    nature: 'summary'
  }),
  createLine({
    id: 'opex-total',
    code: 'OPEX_TOTAL',
    name: 'Operating expenses',
    nature: 'cost',
    aggregation: 'children'
  }),
  createLine({
    id: 'opex-personnel',
    code: 'OPEX_PERSONNEL',
    name: 'Personnel costs',
    indent: 1,
    nature: 'cost',
    aggregation: 'children',
    category: 'Opex: Payroll'
  }),
  createLine({
    id: 'opex-people-sales',
    code: 'OPEX_PEOPLE_SALES',
    name: 'Commercial & sales teams',
    indent: 2,
    nature: 'cost',
    category: 'Opex: Payroll'
  }),
  createLine({
    id: 'opex-people-tech',
    code: 'OPEX_PEOPLE_TECH',
    name: 'Product & engineering',
    indent: 2,
    nature: 'cost',
    category: 'Opex: Payroll'
  }),
  createLine({
    id: 'opex-people-ga',
    code: 'OPEX_PEOPLE_GA',
    name: 'G&A / corporate',
    indent: 2,
    nature: 'cost',
    category: 'Opex: Payroll'
  }),
  createLine({
    id: 'opex-rent',
    code: 'OPEX_RENT',
    name: 'Rent & infrastructure',
    indent: 1,
    nature: 'cost',
    category: 'Opex: Rent'
  }),
  createLine({
    id: 'opex-marketing',
    code: 'OPEX_MARKETING',
    name: 'Marketing programs',
    indent: 1,
    nature: 'cost',
    category: 'Opex: Marketing'
  }),
  createLine({
    id: 'opex-it',
    code: 'OPEX_IT',
    name: 'IT & tooling',
    indent: 1,
    nature: 'cost',
    category: 'Opex: IT'
  }),
  createLine({
    id: 'ebitda',
    code: 'EBITDA',
    name: 'EBITDA',
    aggregation: 'cumulative',
    nature: 'summary'
  }),
  createLine({
    id: 'depreciation',
    code: 'DEPRECIATION',
    name: 'Depreciation & amortization',
    nature: 'cost',
    category: 'Other'
  }),
  createLine({
    id: 'ebit',
    code: 'EBIT',
    name: 'EBIT',
    aggregation: 'cumulative',
    nature: 'summary'
  }),
  createLine({
    id: 'interest',
    code: 'INTEREST_TAXES',
    name: 'Interest & taxes',
    nature: 'cost',
    category: 'Other'
  }),
  createLine({
    id: 'net-income',
    code: 'NET_PROFIT',
    name: 'Net profit',
    aggregation: 'cumulative',
    nature: 'summary'
  })
];

const getDefaultStartMonth = () => {
  const now = new Date();
  return formatMonthKey(now.getFullYear(), now.getMonth() + 1);
};

export const createDefaultBlueprint = (): FinancialBlueprint => ({
  startMonth: getDefaultStartMonth(),
  monthCount: DEFAULT_MONTH_COUNT,
  lines: defaultLines.map((line) => ({
    ...line,
    months: { ...line.months }
  }))
});
