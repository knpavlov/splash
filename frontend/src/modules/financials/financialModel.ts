import {
  FinancialBlueprint,
  FinancialFiscalYearConfig,
  FinancialLineComputation,
  FinancialLineItem,
  FinancialLineNature,
  FinancialRatioDefinition
} from '../../shared/types/financials';
import { DEFAULT_FISCAL_YEAR_START_MONTH } from '../../shared/config/finance';

export interface MonthColumn {
  key: string;
  label: string;
  year: number;
  index: number;
}

export const DEFAULT_MONTH_COUNT = 36;
export const MIN_MONTH_COUNT = 12;
export const MAX_MONTH_COUNT = 48;
export const MAX_INDENT_LEVEL = 6;

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
  computation?: FinancialLineComputation;
  months?: Record<string, number>;
}): FinancialLineItem => {
  const computation = input.computation ?? 'manual';
  const defaultNature: FinancialLineNature = computation === 'manual' ? 'revenue' : 'summary';
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    indent: input.indent ?? 0,
    nature: input.nature ?? defaultNature,
    computation,
    months: input.months ?? {}
  };
};

const buildDefaultStartMonth = () => {
  const now = new Date();
  const fiscalStartIndex = DEFAULT_FISCAL_YEAR_START_MONTH - 1;
  const cursor = new Date(now.getFullYear(), fiscalStartIndex, 1);
  if (now.getMonth() < fiscalStartIndex) {
    cursor.setFullYear(cursor.getFullYear() - 1);
  }
  return formatMonthKey(cursor.getFullYear(), cursor.getMonth() + 1);
};

const buildMonthSeries = (
  startMonth: string,
  monthCount: number,
  generator: (index: number) => number
) => {
  const [yearStr, monthStr] = startMonth.split('-');
  const baseYear = Number(yearStr);
  const baseMonth = Number(monthStr) - 1;
  const cursor = new Date(baseYear, isNaN(baseMonth) ? 0 : baseMonth, 1);
  const series: Record<string, number> = {};
  for (let index = 0; index < monthCount; index += 1) {
    const value = generator(index);
    series[formatMonthKey(cursor.getFullYear(), cursor.getMonth() + 1)] = Math.round(Math.max(0, value));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return series;
};

const createSeriesGenerator = (
  base: number,
  monthlyGrowth: number,
  seasonalAmplitude = 0,
  noiseAmplitude = 0
) => {
  return (index: number) => {
    const growthFactor = 1 + monthlyGrowth * index;
    const seasonal =
      1 + seasonalAmplitude * Math.sin(((index % 12) / 12) * Math.PI * 2 + Math.PI / 6);
    const noise = noiseAmplitude ? Math.sin(index * 1.7) * base * noiseAmplitude : 0;
    return base * growthFactor * seasonal + noise;
  };
};

const createFiscalYearConfig = (): FinancialFiscalYearConfig => ({
  startMonth: DEFAULT_FISCAL_YEAR_START_MONTH,
  label: 'July – June'
});

export const createDefaultRatios = (): FinancialRatioDefinition[] => [
  {
    id: 'ratio-gross-margin',
    label: 'Gross margin',
    numeratorCode: 'GROSS_PROFIT',
    denominatorCode: 'REV_TOTAL',
    format: 'percentage',
    precision: 1,
    description: 'Gross profit divided by total revenue.'
  },
  {
    id: 'ratio-ebitda-margin',
    label: 'EBITDA margin',
    numeratorCode: 'EBITDA',
    denominatorCode: 'REV_TOTAL',
    format: 'percentage',
    precision: 1,
    description: 'EBITDA divided by total revenue.'
  },
  {
    id: 'ratio-ebit-margin',
    label: 'EBIT margin',
    numeratorCode: 'EBIT',
    denominatorCode: 'REV_TOTAL',
    format: 'percentage',
    precision: 1,
    description: 'EBIT divided by total revenue.'
  }
];

const buildDefaultLines = (startMonth: string): FinancialLineItem[] => {
  const recurringRevenue = createSeriesGenerator(450000, 0.008, 0.04, 0.03);
  const usageRevenue = createSeriesGenerator(150000, 0.012, 0.09, 0.04);
  const servicesRevenue = createSeriesGenerator(210000, 0.004, 0.12, 0.05);
  const supportRevenue = createSeriesGenerator(80000, 0.006, 0.05, 0.02);
  const rawMaterials = createSeriesGenerator(90000, 0.006, 0.08, 0.03);
  const deliveryPersonnel = createSeriesGenerator(120000, 0.004, 0.03, 0.02);
  const logisticsVendors = createSeriesGenerator(50000, 0.003, 0.05, 0.02);
  const infrastructure = createSeriesGenerator(40000, 0.005, 0.02, 0.015);
  const salesTeams = createSeriesGenerator(150000, 0.005, 0.03, 0.02);
  const productTeams = createSeriesGenerator(200000, 0.006, 0.02, 0.02);
  const gaTeams = createSeriesGenerator(110000, 0.004, 0.01, 0.01);
  const marketingPrograms = createSeriesGenerator(70000, 0.008, 0.15, 0.05);
  const customerSuccess = createSeriesGenerator(60000, 0.006, 0.04, 0.02);
  const rent = createSeriesGenerator(35000, 0.001, 0.02, 0.005);
  const tooling = createSeriesGenerator(25000, 0.003, 0.02, 0.01);
  const travel = createSeriesGenerator(20000, 0.004, 0.2, 0.05);
  const depreciation = createSeriesGenerator(30000, 0, 0.01, 0.005);
  const interest = createSeriesGenerator(40000, 0.001, 0.03, 0.01);

  return [
    createLine({
      id: 'rev-total',
      code: 'REV_TOTAL',
      name: 'Total revenue',
      computation: 'children'
    }),
    createLine({
      id: 'rev-subscription',
      code: 'REV_SUBSCRIPTION',
      name: 'Subscription / recurring revenue',
      indent: 1,
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, recurringRevenue)
    }),
    createLine({
      id: 'rev-usage',
      code: 'REV_USAGE',
      name: 'Usage & transaction revenue',
      indent: 1,
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, usageRevenue)
    }),
    createLine({
      id: 'rev-services',
      code: 'REV_SERVICES',
      name: 'Services & implementation',
      indent: 1,
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, servicesRevenue)
    }),
    createLine({
      id: 'rev-support',
      code: 'REV_SUPPORT',
      name: 'Support retainers',
      indent: 1,
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, supportRevenue)
    }),
    createLine({
      id: 'cogs-total',
      code: 'COGS_TOTAL',
      name: 'Cost of goods sold',
      computation: 'children'
    }),
    createLine({
      id: 'cogs-raw',
      code: 'COGS_RAW_MATERIALS',
      name: 'Raw materials & components',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, rawMaterials)
    }),
    createLine({
      id: 'cogs-personnel',
      code: 'COGS_PERSONNEL',
      name: 'Delivery personnel',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, deliveryPersonnel)
    }),
    createLine({
      id: 'cogs-logistics',
      code: 'COGS_LOGISTICS',
      name: 'Logistics & partners',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, logisticsVendors)
    }),
    createLine({
      id: 'cogs-infra',
      code: 'COGS_INFRA',
      name: 'Infrastructure & hosting',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, infrastructure)
    }),
    createLine({
      id: 'gross-profit',
      code: 'GROSS_PROFIT',
      name: 'Gross profit',
      computation: 'cumulative'
    }),
    createLine({
      id: 'opex-total',
      code: 'OPEX_TOTAL',
      name: 'Operating expenses',
      computation: 'children'
    }),
    createLine({
      id: 'opex-personnel',
      code: 'OPEX_PERSONNEL',
      name: 'Personnel costs',
      indent: 1,
      computation: 'children',
      nature: 'cost'
    }),
    createLine({
      id: 'opex-sales',
      code: 'OPEX_SALES',
      name: 'Commercial & sales teams',
      indent: 2,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, salesTeams)
    }),
    createLine({
      id: 'opex-product',
      code: 'OPEX_PRODUCT',
      name: 'Product & engineering',
      indent: 2,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, productTeams)
    }),
    createLine({
      id: 'opex-ga',
      code: 'OPEX_GA',
      name: 'G&A / corporate',
      indent: 2,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, gaTeams)
    }),
    createLine({
      id: 'opex-marketing',
      code: 'OPEX_MARKETING',
      name: 'Marketing programs',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, marketingPrograms)
    }),
    createLine({
      id: 'opex-cs',
      code: 'OPEX_CUSTOMER_SUCCESS',
      name: 'Customer success & support',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, customerSuccess)
    }),
    createLine({
      id: 'opex-rent',
      code: 'OPEX_RENT',
      name: 'Rent & facilities',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, rent)
    }),
    createLine({
      id: 'opex-it',
      code: 'OPEX_IT',
      name: 'IT & tooling',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, tooling)
    }),
    createLine({
      id: 'opex-travel',
      code: 'OPEX_TRAVEL',
      name: 'Travel & events',
      indent: 1,
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, travel)
    }),
    createLine({
      id: 'ebitda',
      code: 'EBITDA',
      name: 'EBITDA',
      computation: 'cumulative'
    }),
    createLine({
      id: 'depreciation',
      code: 'DEPRECIATION',
      name: 'Depreciation & amortization',
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, depreciation)
    }),
    createLine({
      id: 'ebit',
      code: 'EBIT',
      name: 'EBIT',
      computation: 'cumulative'
    }),
    createLine({
      id: 'interest',
      code: 'INTEREST_TAXES',
      name: 'Interest & taxes',
      nature: 'cost',
      months: buildMonthSeries(startMonth, DEFAULT_MONTH_COUNT, interest)
    }),
    createLine({
      id: 'net-income',
      code: 'NET_PROFIT',
      name: 'Net profit',
      computation: 'cumulative'
    })
  ];
};

export const createDefaultBlueprint = (): FinancialBlueprint => {
  const startMonth = buildDefaultStartMonth();
  const lines = buildDefaultLines(startMonth);
  const fiscalYear = createFiscalYearConfig();
  const ratios = createDefaultRatios();
  return {
    id: 'local',
    version: 1,
    startMonth,
    monthCount: DEFAULT_MONTH_COUNT,
    fiscalYear,
    ratios,
    updatedAt: new Date().toISOString(),
    lines: lines.map((line) => ({
      ...line,
      months: { ...line.months }
    }))
  };
};
