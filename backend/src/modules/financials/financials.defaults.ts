import { FinancialBlueprintModel, FinancialLineItem } from './financials.types.js';

export const DEFAULT_MONTH_COUNT = 36;
export const MIN_MONTH_COUNT = 12;
export const MAX_MONTH_COUNT = 48;

const createLine = (input: Partial<FinancialLineItem> & { id: string; name: string; code: string }): FinancialLineItem => {
  const computation = input.computation ?? 'manual';
  const defaultNature = computation === 'manual' ? 'revenue' : 'summary';
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

export const createDefaultBlueprintModel = (): FinancialBlueprintModel => ({
  startMonth: new Date().toISOString().slice(0, 7),
  monthCount: DEFAULT_MONTH_COUNT,
  lines: [
    createLine({
      id: 'rev-total',
      code: 'REV_TOTAL',
      name: 'Total revenue',
      computation: 'children',
      nature: 'summary'
    }),
    createLine({
      id: 'rev-subscription',
      code: 'REV_SUBSCRIPTION',
      name: 'Subscription / recurring revenue',
      indent: 1,
      nature: 'revenue'
    }),
    createLine({
      id: 'rev-services',
      code: 'REV_SERVICES',
      name: 'Services & implementation',
      indent: 1,
      nature: 'revenue'
    }),
    createLine({
      id: 'rev-oneoff',
      code: 'REV_ONEOFF',
      name: 'One-off / project revenue',
      indent: 1,
      nature: 'revenue'
    }),
    createLine({
      id: 'cogs-total',
      code: 'COGS_TOTAL',
      name: 'Cost of goods sold',
      computation: 'children',
      nature: 'summary'
    }),
    createLine({
      id: 'cogs-personnel',
      code: 'COGS_PERSONNEL',
      name: 'Delivery personnel',
      indent: 1,
      nature: 'cost'
    }),
    createLine({
      id: 'cogs-other',
      code: 'COGS_OTHER',
      name: 'Vendors & delivery partners',
      indent: 1,
      nature: 'cost'
    }),
    createLine({
      id: 'gross-profit',
      code: 'GROSS_PROFIT',
      name: 'Gross profit',
      computation: 'cumulative',
      nature: 'summary'
    }),
    createLine({
      id: 'opex-total',
      code: 'OPEX_TOTAL',
      name: 'Operating expenses',
      computation: 'children',
      nature: 'summary'
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
      nature: 'cost'
    }),
    createLine({
      id: 'opex-product',
      code: 'OPEX_PRODUCT',
      name: 'Product & engineering',
      indent: 2,
      nature: 'cost'
    }),
    createLine({
      id: 'opex-ga',
      code: 'OPEX_GA',
      name: 'G&A / corporate',
      indent: 2,
      nature: 'cost'
    }),
    createLine({
      id: 'opex-rent',
      code: 'OPEX_RENT',
      name: 'Rent & infrastructure',
      indent: 1,
      nature: 'cost'
    }),
    createLine({
      id: 'opex-marketing',
      code: 'OPEX_MARKETING',
      name: 'Marketing programs',
      indent: 1,
      nature: 'cost'
    }),
    createLine({
      id: 'opex-it',
      code: 'OPEX_IT',
      name: 'IT & tooling',
      indent: 1,
      nature: 'cost'
    }),
    createLine({
      id: 'ebitda',
      code: 'EBITDA',
      name: 'EBITDA',
      computation: 'cumulative',
      nature: 'summary'
    }),
    createLine({
      id: 'depreciation',
      code: 'DEPRECIATION',
      name: 'Depreciation & amortization',
      nature: 'cost'
    }),
    createLine({
      id: 'ebit',
      code: 'EBIT',
      name: 'EBIT',
      computation: 'cumulative',
      nature: 'summary'
    }),
    createLine({
      id: 'interest',
      code: 'INTEREST_TAXES',
      name: 'Interest & taxes',
      nature: 'cost'
    }),
    createLine({
      id: 'net-income',
      code: 'NET_PROFIT',
      name: 'Net profit',
      computation: 'cumulative',
      nature: 'summary'
    })
  ]
});
