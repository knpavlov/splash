import { InitiativeStageKey } from './initiative';
import { FinancialBlueprint } from './financials';

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

export interface StageSummaryEntry {
  initiatives: number;
  impact: number;
  approved: number;
  pendingGate: number;
}

export type StageSummaryMap = Record<InitiativeStageKey, StageSummaryEntry>;

export interface StatusSummaryEntry {
  status: string;
  initiatives: number;
}

export interface WorkstreamSummaryEntry {
  id: string;
  name: string;
  initiatives: number;
  impact: number;
}

export interface ProgramSnapshotPayload {
  version: number;
  capturedAt: string;
  metrics: {
    initiatives: number;
    workstreams: number;
    participants: number;
  };
  totals: {
    recurringBenefits: number;
    recurringCosts: number;
    oneoffBenefits: number;
    oneoffCosts: number;
    recurringImpact: number;
  };
  financials: {
    blueprint: FinancialBlueprint | null;
  };
  stageGate: StageGateSnapshot;
  stageSummary: StageSummaryMap;
  statusSummary: StatusSummaryEntry[];
  workstreamSummary: WorkstreamSummaryEntry[];
  initiatives: unknown[];
  workstreams: unknown[];
  participants: unknown[];
}

export interface ProgramSnapshotSummary {
  id: string;
  capturedAt: string;
  dateKey: string;
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
  dateKey: string;
  trigger: 'auto' | 'manual';
  payload: ProgramSnapshotPayload;
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
