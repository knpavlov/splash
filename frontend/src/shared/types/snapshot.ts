export type StageColumnKey =
  | 'l0'
  | 'l1-gate'
  | 'l1'
  | 'l2-gate'
  | 'l2'
  | 'l3-gate'
  | 'l3'
  | 'l4-gate'
  | 'l4'
  | 'l5-gate'
  | 'l5';

export interface StageMetric {
  initiatives: number;
  impact: number;
}

export type StageMetricMap = Record<StageColumnKey, StageMetric>;

export interface StageGateSnapshotWorkstream {
  id: string;
  name: string;
  metrics: StageMetricMap;
  totals: StageMetric;
}

export interface StageGateSnapshot {
  metrics: StageMetricMap;
  totals: StageMetric;
  workstreams: StageGateSnapshotWorkstream[];
}

export interface ProgramSnapshotSummary {
  id: string;
  capturedAt: string;
  trigger: 'auto' | 'manual';
  metrics: {
    initiatives: number;
    impact: number;
  };
  stageGate: StageGateSnapshot;
  totals: StageMetric;
  payloadSizeBytes: number;
}

export interface ProgramSnapshotDetail {
  id: string;
  capturedAt: string;
  trigger: 'auto' | 'manual';
  payload: unknown;
  payloadSizeBytes: number;
}

export interface SnapshotStorageStats {
  programCount: number;
  sessionCount: number;
  programBytes: number;
  sessionBytes: number;
  averageProgramBytes: number;
}

export interface SnapshotSettingsPayload {
  enabled: boolean;
  retentionDays: number;
  minimumRetentionDays: number;
  defaultTimezone: string;
  timezone: string;
  scheduleHour: number;
  scheduleMinute: number;
  nextRunAt: string | null;
  lastAutomaticSnapshot: ProgramSnapshotSummary | null;
  storage: SnapshotStorageStats;
}

export type SnapshotSessionEvent = 'login' | 'logout';
