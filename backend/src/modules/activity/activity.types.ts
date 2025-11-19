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

export interface ActivityPreferencesRow extends Record<string, unknown> {
  account_id: string;
  workstream_ids: string[] | null;
  initiative_ids: string[] | null;
  module_keys: string[] | null;
  metric_keys: string[] | null;
  default_timeframe: string | null;
  last_checked_at: Date | null;
  updated_at: Date;
}

export interface ActivityPreferencesUpdate {
  workstreamIds?: string[];
  initiativeIds?: string[];
  moduleKeys?: string[];
  metricKeys?: string[];
  defaultTimeframe?: ActivityTimeframeKey;
}

export interface ActivityTimeframeOption {
  key: ActivityTimeframeKey;
  label: string;
  description: string;
  available: boolean;
  start: string | null;
}

export interface ActivityTimeframePayload {
  key: ActivityTimeframeKey;
  label: string;
  start: string;
  fallback: boolean;
  fallbackReason: string | null;
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

export interface ActivitySummaryFilters {
  workstreamIds: string[];
  metricKeys: string[];
}

export interface ActivitySummaryParams {
  timeframe?: ActivityTimeframeKey;
  workstreamIds?: string[];
  metricKeys?: string[];
}

export interface ActivitySummaryResponse {
  timeframe: ActivityTimeframePayload;
  filters: {
    workstreamIds: string[];
  };
  metrics: ActivityMetricResult[];
}

export interface ActivityModuleDefinition {
  key: string;
  label: string;
  description: string;
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
  timeframe: ActivityTimeframePayload;
  filters: {
    workstreamIds: string[];
    initiativeIds: string[];
  };
  entries: ActivityCommentEntry[];
}

export interface ActivityEventRow extends Record<string, unknown> {
  id: string;
  initiative_id: string;
  workstream_id: string;
  field: string;
  previous_value: unknown;
  next_value: unknown;
  event_type: string;
  created_at: Date;
}

export interface ActivityCommentRow extends Record<string, unknown> {
  message_id: string;
  thread_id: string;
  initiative_id: string;
  initiative_name: string;
  workstream_id: string;
  workstream_name: string;
  body: string;
  author_name: string | null;
  created_at: Date;
  parent_id: string | null;
  stage_key: string | null;
  target_label: string | null;
  target_path: string | null;
  resolved_at: Date | null;
}
