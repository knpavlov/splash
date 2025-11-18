import { randomUUID } from 'crypto';
import type { InitiativeResponse, InitiativeStageKey } from '../initiatives/initiatives.types.js';
import { initiativesService } from '../initiatives/initiatives.module.js';
import { workstreamsService } from '../workstreams/workstreams.module.js';
import { participantsService } from '../participants/participants.module.js';
import { financialsService } from '../financials/financials.module.js';
import { SnapshotsRepository, SnapshotListFilters } from './snapshots.repository.js';
import type { WorkstreamRecord } from '../workstreams/workstreams.types.js';
import type { FinancialBlueprintRecord } from '../financials/financials.types.js';
import type { ProgramSnapshotPayload, ProgramSnapshotSummary, SnapshotDetailLevel, SnapshotSettingsPayload, SessionSnapshotTrigger, StageColumnKey, StageGateSnapshot, StageMetricMap } from './snapshots.types.js';
import type { SnapshotScheduler } from './snapshotScheduler.js';

const stageColumnKeys: StageColumnKey[] = [
  'l0',
  'l1-gate',
  'l1',
  'l2-gate',
  'l2',
  'l3-gate',
  'l3',
  'l4-gate',
  'l4',
  'l5-gate',
  'l5'
];

const createEmptyStageMetricMap = (): StageMetricMap =>
  stageColumnKeys.reduce((acc, key) => {
    acc[key] = { initiatives: 0, impact: 0 };
    return acc;
  }, {} as StageMetricMap);

const parseDate = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveStageColumn = (initiative: InitiativeResponse): StageColumnKey => {
  const stage = initiative.activeStage;
  if (stage === 'l0') {
    return 'l0';
  }
  const stageState = initiative.stageState[stage];
  const status = stageState?.status ?? 'draft';
  if (status === 'approved') {
    return stage as StageColumnKey;
  }
  const gateKey = `${stage}-gate` as StageColumnKey;
  return stageColumnKeys.includes(gateKey) ? gateKey : (stage as StageColumnKey);
};

const clonePlan = (plan: InitiativeResponse['plan'], includeTasks: boolean) => {
  const copy = JSON.parse(JSON.stringify(plan));
  if (includeTasks) {
    return copy;
  }
  return {
    tasks: [],
    settings: copy.settings
  };
};

export class SnapshotsService {
  private scheduler: SnapshotScheduler | null = null;
  private readonly minimumRetentionDays = 30;

  constructor(private readonly repository: SnapshotsRepository) {}

  attachScheduler(scheduler: SnapshotScheduler) {
    this.scheduler = scheduler;
  }

  private async buildProgramSnapshotPayload(detailLevel: SnapshotDetailLevel): Promise<ProgramSnapshotPayload> {
    const [initiatives, workstreams, participants, blueprint] = await Promise.all([
      initiativesService.listInitiatives(),
      workstreamsService.listWorkstreams(),
      participantsService.listParticipants(),
      financialsService
        .getBlueprint()
        .catch((error: unknown) => {
          console.warn('Unable to load financial blueprint for snapshot:', error);
          return null;
        })
    ]);

    const workstreamLookup = new Map<string, WorkstreamRecord>();
    workstreams.forEach((workstream) => {
      workstreamLookup.set(workstream.id, workstream);
    });

    const stageGate = this.buildStageGateSnapshot(initiatives, workstreamLookup);
    const totals = initiatives.reduce(
      (acc, initiative) => {
        acc.recurringBenefits += initiative.totals.recurringBenefits;
        acc.recurringCosts += initiative.totals.recurringCosts;
        acc.oneoffBenefits += initiative.totals.oneoffBenefits;
        acc.oneoffCosts += initiative.totals.oneoffCosts;
        acc.recurringImpact += initiative.totals.recurringImpact;
        return acc;
      },
      {
        recurringBenefits: 0,
        recurringCosts: 0,
        oneoffBenefits: 0,
        oneoffCosts: 0,
        recurringImpact: 0
      }
    );

    const includeFullPlan = detailLevel === 'full';

    const initiativePayload = includeFullPlan
      ? initiatives.map((initiative) => {
          const originalPlan = initiative.plan;
          const plan = clonePlan(originalPlan, includeFullPlan);
          const planTimeline = this.resolvePlanTimeline(originalPlan.tasks);
          const workstream = workstreamLookup.get(initiative.workstreamId);
          return {
            id: initiative.id,
            name: initiative.name,
            workstreamId: initiative.workstreamId,
            workstreamName: workstream?.name ?? null,
            activeStage: initiative.activeStage,
            stageState: initiative.stageState,
            currentStatus: initiative.currentStatus,
            ownerName: initiative.ownerName,
            ownerAccountId: initiative.ownerAccountId,
            l4Date: initiative.l4Date,
            createdAt: initiative.createdAt,
            updatedAt: initiative.updatedAt,
            totals: initiative.totals,
            plan,
            timeline: planTimeline
          };
        })
      : [];

    const participantPayload =
      detailLevel === 'full'
        ? participants.map((participant) => ({
            id: participant.id,
            displayName: participant.displayName,
            role: participant.role,
            hierarchyLevel1: participant.hierarchyLevel1,
            hierarchyLevel2: participant.hierarchyLevel2,
            hierarchyLevel3: participant.hierarchyLevel3,
            createdAt: participant.createdAt,
            updatedAt: participant.updatedAt
          }))
        : [];

    const workstreamPayload =
      detailLevel === 'full'
        ? workstreams.map((workstream) => ({
            id: workstream.id,
            name: workstream.name,
            description: workstream.description
          }))
        : [];

    const financialBlueprint: FinancialBlueprintRecord | null =
      detailLevel === 'full' ? blueprint : null;

    const capturedAt = new Date().toISOString();

    return {
      version: 1,
      capturedAt,
      metrics: {
        initiatives: initiatives.length,
        workstreams: workstreams.length,
        participants: participants.length
      },
      totals,
      financials: {
        blueprint: financialBlueprint
      },
      stageGate,
      initiatives: initiativePayload,
      workstreams: workstreamPayload,
      participants: participantPayload
    };
  }

  private resolvePlanTimeline(tasks: InitiativeResponse['plan']['tasks']) {
    let startTs: number | null = null;
    let endTs: number | null = null;
    tasks.forEach((task) => {
      const taskStart = parseDate(task.startDate);
      const taskEnd = parseDate(task.endDate);
      if (taskStart) {
        const ts = taskStart.getTime();
        if (startTs === null || ts < startTs) {
          startTs = ts;
        }
      }
      if (taskEnd) {
        const ts = taskEnd.getTime();
        if (endTs === null || ts > endTs) {
          endTs = ts;
        }
      }
    });
    let durationDays: number | null = null;
    if (startTs !== null && endTs !== null) {
      const diff = endTs - startTs;
      durationDays = Math.max(1, Math.round(diff / 86400000) + 1);
    }
    return {
      startDate: startTs !== null ? new Date(startTs).toISOString() : null,
      endDate: endTs !== null ? new Date(endTs).toISOString() : null,
      durationDays
    };
  }

  private buildStageGateSnapshot(
    initiatives: InitiativeResponse[],
    workstreamLookup: Map<string, WorkstreamRecord>
  ): StageGateSnapshot {
    const metrics = createEmptyStageMetricMap();
    const workstreamMetrics = new Map<string, StageGateSnapshot['workstreams'][number]>();

    initiatives.forEach((initiative) => {
      const column = resolveStageColumn(initiative);
      const impact = initiative.totals.recurringImpact ?? 0;
      metrics[column].initiatives += 1;
      metrics[column].impact += impact;

      const workstreamId = initiative.workstreamId || '__unassigned__';
      let entry = workstreamMetrics.get(workstreamId);
      if (!entry) {
        const workstream = workstreamLookup.get(workstreamId);
        entry = {
          id: workstreamId,
          name: workstream?.name ?? 'Unassigned',
          metrics: createEmptyStageMetricMap(),
          totals: { initiatives: 0, impact: 0 }
        };
        workstreamMetrics.set(workstreamId, entry);
      }
      entry.metrics[column].initiatives += 1;
      entry.metrics[column].impact += impact;
      entry.totals.initiatives += 1;
      entry.totals.impact += impact;
    });

    const totals = stageColumnKeys.reduce(
      (acc, key) => {
        acc.initiatives += metrics[key].initiatives;
        acc.impact += metrics[key].impact;
        return acc;
      },
      { initiatives: 0, impact: 0 }
    );

    return {
      metrics,
      totals,
      workstreams: Array.from(workstreamMetrics.values()).sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  private mapSummary(record: Awaited<ReturnType<SnapshotsRepository['insertSnapshot']>>): ProgramSnapshotSummary {
    return {
      id: record.id,
      capturedAt: record.capturedAt.toISOString(),
      trigger: record.trigger === 'auto' || record.trigger === 'manual' ? record.trigger : 'manual',
      metrics: {
        initiatives: record.initiativeCount,
        impact: record.recurringImpact
      },
      stageGate: record.payload.stageGate,
      totals: record.payload.stageGate.totals,
      payloadSizeBytes: record.payloadBytes
    };
  }

  async captureProgramSnapshot(trigger: 'auto' | 'manual', detailLevel: SnapshotDetailLevel = 'full') {
    const payload = await this.buildProgramSnapshotPayload(detailLevel);
    const payloadText = JSON.stringify(payload);
    const payloadBytes = Buffer.byteLength(payloadText, 'utf8');
    const capturedAt = new Date(payload.capturedAt);
    const record = await this.repository.insertSnapshot({
      id: randomUUID(),
      category: 'program',
      trigger,
      capturedAt,
      payload,
      payloadBytes,
      initiativeCount: payload.metrics.initiatives,
      recurringImpact: payload.totals.recurringImpact
    });

    const settings = await this.repository.getSettings();
    const retentionDays = Math.max(settings.retentionDays, this.minimumRetentionDays);
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    await this.repository.deleteProgramSnapshotsBefore(cutoff);

    return this.mapSummary(record);
  }

  async captureSessionSnapshot(event: SessionSnapshotTrigger, account?: { id?: string | null }) {
    const payload = await this.buildProgramSnapshotPayload('summary');
    const payloadText = JSON.stringify(payload);
    const payloadBytes = Buffer.byteLength(payloadText, 'utf8');
    await this.repository.insertSnapshot({
      id: randomUUID(),
      category: 'session',
      trigger: event,
      accountId: account?.id ?? null,
      capturedAt: new Date(payload.capturedAt),
      payload,
      payloadBytes,
      initiativeCount: payload.metrics.initiatives,
      recurringImpact: payload.totals.recurringImpact
    });
  }

  async listProgramSnapshots(filters: SnapshotListFilters): Promise<ProgramSnapshotSummary[]> {
    const rows = await this.repository.listProgramSnapshots(filters);
    return rows
      .filter((row) => row.category === 'program')
      .map((row) => ({
        id: row.id,
        capturedAt: row.capturedAt.toISOString(),
        trigger: row.trigger === 'auto' || row.trigger === 'manual' ? row.trigger : 'manual',
        metrics: {
          initiatives: row.initiativeCount,
          impact: row.recurringImpact
        },
        stageGate: row.payload.stageGate,
        totals: row.payload.stageGate.totals,
        payloadSizeBytes: row.payloadBytes
      }))
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }

  async getProgramSnapshot(id: string) {
    const record = await this.repository.getSnapshot(id);
    if (!record || record.category !== 'program') {
      return null;
    }
    return {
      id: record.id,
      capturedAt: record.capturedAt.toISOString(),
      trigger: record.trigger === 'auto' || record.trigger === 'manual' ? record.trigger : 'manual',
      payload: record.payload,
      payloadSizeBytes: record.payloadBytes
    };
  }

  async getSettings(): Promise<SnapshotSettingsPayload> {
    const settings = await this.repository.getSettings();
    const stats = await this.repository.getStorageStats();
    const averageProgramBytes =
      stats.programCount > 0 ? Math.round(stats.programBytes / stats.programCount) : 0;
    const lastAuto = await this.repository.getLatestAutomaticSnapshot();
    const schedulerNext = this.scheduler?.getNextRunTime() ?? null;
    return {
      enabled: settings.autoEnabled,
      retentionDays: Math.max(settings.retentionDays, this.minimumRetentionDays),
      timezone: settings.timezone,
      scheduleHour: settings.scheduleHour,
      scheduleMinute: settings.scheduleMinute,
      minimumRetentionDays: this.minimumRetentionDays,
      defaultTimezone: 'Australia/Sydney',
      nextRunAt: schedulerNext ? schedulerNext.toISOString() : null,
      lastAutomaticSnapshot: lastAuto
        ? {
            id: lastAuto.id,
            capturedAt: lastAuto.capturedAt.toISOString(),
            trigger: 'auto',
            metrics: {
              initiatives: lastAuto.initiativeCount,
              impact: lastAuto.recurringImpact
            },
            stageGate: lastAuto.payload.stageGate,
            totals: lastAuto.payload.stageGate.totals,
            payloadSizeBytes: lastAuto.payloadBytes
          }
        : null,
      storage: {
        programCount: stats.programCount,
        sessionCount: stats.sessionCount,
        programBytes: stats.programBytes,
        sessionBytes: stats.sessionBytes,
        averageProgramBytes
      }
    };
  }

  async updateSettings(patch: Partial<{ enabled: boolean; retentionDays: number; timezone: string; scheduleHour: number; scheduleMinute: number }>) {
    const resolved: Partial<{
      auto_enabled: boolean;
      retention_days: number;
      timezone: string;
      schedule_hour: number;
      schedule_minute: number;
    }> = {};

    if (patch.enabled !== undefined) {
      resolved.auto_enabled = Boolean(patch.enabled);
    }
    if (patch.retentionDays !== undefined) {
      const days = Number(patch.retentionDays);
      if (!Number.isFinite(days) || days < this.minimumRetentionDays) {
        throw new Error('INVALID_RETENTION');
      }
      resolved.retention_days = Math.floor(days);
    }
    if (patch.timezone !== undefined) {
      const tz = patch.timezone.trim();
      if (!tz) {
        throw new Error('INVALID_TIMEZONE');
      }
      resolved.timezone = tz;
    }
    if (patch.scheduleHour !== undefined) {
      const hour = Number(patch.scheduleHour);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        throw new Error('INVALID_TIME');
      }
      resolved.schedule_hour = Math.floor(hour);
    }
    if (patch.scheduleMinute !== undefined) {
      const minute = Number(patch.scheduleMinute);
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
        throw new Error('INVALID_TIME');
      }
      resolved.schedule_minute = Math.floor(minute);
    }

    const next = await this.repository.updateSettings(resolved);
    if (this.scheduler) {
      await this.scheduler.refresh();
    }
    return this.getSettings();
  }

  async getRawSettings() {
    return this.repository.getSettings();
  }
}
