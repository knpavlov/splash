export type FinancialLineNature = 'revenue' | 'cost' | 'summary';
export type FinancialLineComputation = 'manual' | 'children' | 'cumulative';

export interface FinancialLineItem {
  id: string;
  code: string;
  name: string;
  indent: number;
  nature: FinancialLineNature;
  computation: FinancialLineComputation;
  months: Record<string, number>;
}

export type FinancialRatioFormat = 'percentage' | 'multiple';

export interface FinancialRatioDefinition {
  id: string;
  label: string;
  numeratorCode: string;
  denominatorCode: string;
  format: FinancialRatioFormat;
  precision: number;
  description?: string;
}

export interface FinancialFiscalYearConfig {
  startMonth: number;
  label?: string;
}

export interface FinancialBlueprintModel {
  startMonth: string;
  monthCount: number;
  fiscalYear: FinancialFiscalYearConfig;
  ratios: FinancialRatioDefinition[];
  lines: FinancialLineItem[];
}

export interface FinancialBlueprintRecord extends FinancialBlueprintModel {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
