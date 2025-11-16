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

export interface FinancialBlueprintPayload {
  startMonth: string;
  monthCount: number;
  lines: FinancialLineItem[];
}

export interface FinancialBlueprint extends FinancialBlueprintPayload {
  id: string;
  version: number;
  updatedAt: string;
}
