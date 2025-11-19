export type ActivityTimeframeKey =
  | 'since-last-login'
  | 'since-last-visit'
  | 'since-yesterday'
  | 'since-7-days'
  | 'since-last-month';

export interface ActivityPreferences {
  accountId: string;
  workstreamIds: string[];
  initiativeIds: string[];
  moduleKeys: string[];
  metricKeys: string[];
  defaultTimeframe: ActivityTimeframeKey;
  lastVisitedAt: string | null;
  updatedAt: string;
}

export interface ActivityTimeframeOption {
  key: ActivityTimeframeKey;
  label: string;
  description: string;
  available: boolean;
  start: string | null;
}

export interface ActivityModuleDefinition {
  key: string;
  label: string;
  description: string;
}

export interface ActivityMetricDefinition {
  key: string;
  label: string;
  description: string;
  category: 'impact' | 'pipeline' | 'execution';
  format: 'currency' | 'count' | 'percentage';
  granularity: 'program' | 'workstream' | 'stage';
}

export interface ActivityMetricBreakdownEntry {
  key: string;
  label: string;
  value: number;
  delta?: number | null;
}

export interface ActivityMetricResult {
  key: string;
  unit: 'currency' | 'count' | 'percentage';
  value: number | null;
  delta?: number | null;
  trend?: 'up' | 'down' | 'flat';
  breakdown?: ActivityMetricBreakdownEntry[];
  missing?: boolean;
}

export interface ActivitySummaryResponse {
  timeframe: {
    key: ActivityTimeframeKey;
    label: string;
    start: string;
    fallback: boolean;
    fallbackReason: string | null;
  };
  filters: {
    workstreamIds: string[];
  };
  metrics: ActivityMetricResult[];
}

export interface ActivityPreferenceBundle {
  preferences: ActivityPreferences;
  timeframes: ActivityTimeframeOption[];
  metricCatalog: ActivityMetricDefinition[];
  moduleCatalog: ActivityModuleDefinition[];
}

export interface ActivityCommentEntry {
  id: string;
  threadId: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  parentId: string | null;
  stageKey: string | null;
  targetLabel: string | null;
  targetPath: string | null;
  resolvedAt: string | null;
}

export interface ActivityCommentFeedResponse {
  timeframe: {
    key: ActivityTimeframeKey;
    label: string;
    start: string;
    fallback: boolean;
    fallbackReason: string | null;
  };
  filters: {
    workstreamIds: string[];
    initiativeIds: string[];
  };
  entries: ActivityCommentEntry[];
}

export interface ActivityPreferencesUpdate {
  workstreamIds?: string[];
  initiativeIds?: string[];
  moduleKeys?: string[];
  metricKeys?: string[];
  defaultTimeframe?: ActivityTimeframeKey;
}
