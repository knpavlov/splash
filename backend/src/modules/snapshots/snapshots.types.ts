import type { FinancialBlueprintRecord } from '../financials/financials.types.js';
import type {
  InitiativePlanModel,
  InitiativeRisk,
  InitiativeStageKey,
  InitiativeStageStateMap,
  InitiativeTotals
} from '../initiatives/initiatives.types.js';

export type SnapshotCategory = 'program' | 'session';
export type ProgramSnapshotTrigger = 'auto' | 'manual';
export type SessionSnapshotTrigger = 'login' | 'logout';
export type SnapshotTrigger = ProgramSnapshotTrigger | SessionSnapshotTrigger;
export type SnapshotDetailLevel = 'full' | 'summary';

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

export interface ProgramSnapshotInitiativeSummary {
  id: string;
  name: string;
  workstreamId: string;
  workstreamName: string | null;
  activeStage: InitiativeStageKey;
  stageState: InitiativeStageStateMap;
  currentStatus: string;
  ownerName: string | null;
  ownerAccountId: string | null;
  l4Date: string | null;
  createdAt: string;
  updatedAt: string;
  totals: InitiativeTotals;
  plan: InitiativePlanModel;
  risks?: InitiativeRisk[];
  timeline: {
    startDate: string | null;
    endDate: string | null;
    durationDays: number | null;
  };
}

export interface ProgramSnapshotWorkstreamSummary {
  id: string;
  name: string;
  description: string;
}

export interface ProgramSnapshotParticipantSummary {
  id: string;
  displayName: string;
  role: string | null;
  hierarchyLevel1: string | null;
  hierarchyLevel2: string | null;
  hierarchyLevel3: string | null;
  createdAt: string;
  updatedAt: string;
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
    blueprint: FinancialBlueprintRecord | null;
  };
  stageGate: StageGateSnapshot;
  stageSummary: StageSummaryMap;
  statusSummary: StatusSummaryEntry[];
  workstreamSummary: WorkstreamSummaryEntry[];
  initiatives: ProgramSnapshotInitiativeSummary[];
  workstreams: ProgramSnapshotWorkstreamSummary[];
  participants: ProgramSnapshotParticipantSummary[];
}

export interface ProgramSnapshotSummary {
  id: string;
  capturedAt: string;
  dateKey: string;
  trigger: ProgramSnapshotTrigger;
  metrics: {
    initiatives: number;
    impact: number;
  };
  stageGate: StageGateSnapshot;
  totals: StageMetric;
  payloadSizeBytes: number;
}

export interface SnapshotSettings {
  enabled: boolean;
  retentionDays: number;
  timezone: string;
  scheduleHour: number;
  scheduleMinute: number;
  kpiOptions?: string[];
}

export interface SnapshotSettingsPayload extends SnapshotSettings {
  minimumRetentionDays: number;
  defaultTimezone: string;
  nextRunAt: string | null;
  lastAutomaticSnapshot: ProgramSnapshotSummary | null;
  storage: SnapshotStorageStats;
}

export interface SnapshotStorageStats {
  programCount: number;
  sessionCount: number;
  programBytes: number;
  sessionBytes: number;
  averageProgramBytes: number;
}

export interface SessionSnapshotPayload {
  version: number;
  capturedAt: string;
  event: SessionSnapshotTrigger;
  metrics: {
    initiatives: number;
    workstreams: number;
    participants: number;
    recurringImpact: number;
  };
}
