import type { InitiativeStageKey } from '../initiatives/initiatives.types.js';

export type FinancialDynamicsViewMode = 'months' | 'quarters' | 'calendar' | 'fiscal';
export type FinancialDynamicsBaseMode = 'zero' | 'baseline';
export type FinancialDynamicsSortMode = 'impact-desc' | 'impact-asc' | 'delta' | 'name';

export interface FinancialDynamicsSettings {
  viewMode: FinancialDynamicsViewMode;
  baseMode: FinancialDynamicsBaseMode;
  stageKeys: InitiativeStageKey[];
  workstreamIds: string[];
  sortMode: FinancialDynamicsSortMode;
  query: string;
  hideZeros: boolean;
}

export interface FinancialDynamicsPreferences {
  accountId: string;
  settings: FinancialDynamicsSettings;
  favorites: string[];
  updatedAt: string;
}

export interface FinancialDynamicsPreferencesUpdate {
  settings?: Partial<FinancialDynamicsSettings>;
  favorites?: string[];
}

export interface FinancialDynamicsPreferencesRow extends Record<string, unknown> {
  account_id: string;
  settings: Record<string, unknown> | null;
  favorites: string[] | null;
  updated_at: Date;
}
