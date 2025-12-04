import { initiativeStageKeys, InitiativeStageKey } from '../initiatives/initiatives.types.js';
import { FinancialDynamicsRepository } from './financialDynamics.repository.js';
import {
  FinancialDynamicsPreferences,
  FinancialDynamicsPreferencesUpdate,
  FinancialDynamicsSettings,
  FinancialDynamicsViewMode,
  FinancialDynamicsBaseMode,
  FinancialDynamicsSortMode
} from './financialDynamics.types.js';

const clampViewMode = (value: unknown, fallback: FinancialDynamicsViewMode): FinancialDynamicsViewMode => {
  if (value === 'quarters' || value === 'calendar' || value === 'fiscal') {
    return value;
  }
  return fallback;
};

const clampBaseMode = (value: unknown, fallback: FinancialDynamicsBaseMode): FinancialDynamicsBaseMode => {
  if (value === 'zero') {
    return 'zero';
  }
  if (value === 'baseline') {
    return 'baseline';
  }
  return fallback;
};

const clampSortMode = (value: unknown, fallback: FinancialDynamicsSortMode): FinancialDynamicsSortMode => {
  if (value === 'impact-asc' || value === 'delta' || value === 'name') {
    return value;
  }
  return fallback;
};

const defaultSettings = (): FinancialDynamicsSettings => ({
  viewMode: 'months',
  baseMode: 'baseline',
  stageKeys: [...initiativeStageKeys],
  workstreamIds: [],
  sortMode: 'impact-desc',
  query: '',
  hideZeros: false
});

const sanitizeStageKeys = (value: unknown, fallback: InitiativeStageKey[]): InitiativeStageKey[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const seen = new Set<string>();
  const entries: InitiativeStageKey[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const normalized = entry.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    if (initiativeStageKeys.includes(normalized as InitiativeStageKey)) {
      seen.add(normalized);
      entries.push(normalized as InitiativeStageKey);
    }
  });
  return entries.length ? entries : fallback;
};

const sanitizeWorkstreams = (value: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const seen = new Set<string>();
  const entries: string[] = [];
  value.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    entries.push(normalized);
  });
  return entries;
};

const sanitizeFavorites = (value: unknown, fallback: string[] = []): string[] => {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const entries: string[] = [];
  source.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    entries.push(normalized);
  });
  return entries;
};

const sanitizeSettings = (
  value: unknown,
  fallback: FinancialDynamicsSettings = defaultSettings()
): FinancialDynamicsSettings => {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const payload = value as Partial<FinancialDynamicsSettings>;
  const query =
    typeof payload.query === 'string'
      ? payload.query.trim().slice(0, 120)
      : fallback.query;

  return {
    viewMode: clampViewMode(payload.viewMode, fallback.viewMode),
    baseMode: clampBaseMode(payload.baseMode, fallback.baseMode),
    stageKeys: sanitizeStageKeys(payload.stageKeys, fallback.stageKeys).filter(
      (key, index, list) => list.indexOf(key) === index
    ),
    workstreamIds: sanitizeWorkstreams(payload.workstreamIds, fallback.workstreamIds),
    sortMode: clampSortMode(payload.sortMode, fallback.sortMode),
    query,
    hideZeros: typeof payload.hideZeros === 'boolean' ? payload.hideZeros : fallback.hideZeros
  };
};

export class FinancialDynamicsService {
  constructor(private repository: FinancialDynamicsRepository = new FinancialDynamicsRepository()) {}

  async getPreferences(accountId: string): Promise<FinancialDynamicsPreferences> {
    const row = await this.repository.getPreferences(accountId);
    const settings = sanitizeSettings(row?.settings);
    const favorites = sanitizeFavorites(row?.favorites ?? []);
    const updatedAt =
      row?.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString();

    return {
      accountId,
      settings,
      favorites,
      updatedAt
    };
  }

  async savePreferences(
    accountId: string,
    payload: FinancialDynamicsPreferencesUpdate
  ): Promise<FinancialDynamicsPreferences> {
    const current = await this.getPreferences(accountId);
    const nextSettings = payload.settings
      ? sanitizeSettings(payload.settings, current.settings)
      : current.settings;
    const nextFavorites = payload.favorites
      ? sanitizeFavorites(payload.favorites, current.favorites)
      : current.favorites;

    const row = await this.repository.upsertPreferences(accountId, nextSettings, nextFavorites);
    const updatedAt =
      row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString();

    return {
      accountId,
      settings: nextSettings,
      favorites: nextFavorites,
      updatedAt
    };
  }
}
