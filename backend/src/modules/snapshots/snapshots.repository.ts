import { postgresPool } from '../../shared/database/postgres.client.js';
import { initiativeStageKeys } from '../initiatives/initiatives.types.js';
import type {
  ProgramSnapshotPayload,
  SnapshotCategory,
  SnapshotTrigger,
  StageColumnKey,
  StageMetricMap,
  StageSummaryMap
} from './snapshots.types.js';

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

const createEmptyStageSummary = (): StageSummaryMap =>
  initiativeStageKeys.reduce((acc, stage) => {
    acc[stage] = { initiatives: 0, impact: 0, approved: 0, pendingGate: 0 };
    return acc;
  }, {} as StageSummaryMap);

type SnapshotRow = {
  id: string;
  category: SnapshotCategory;
  trigger: SnapshotTrigger;
  account_id: string | null;
  captured_at: Date;
  payload: ProgramSnapshotPayload | string;
  payload_bytes: number;
  initiative_count: number;
  recurring_impact: string | number;
};

type SnapshotSettingsRow = {
  auto_enabled: boolean;
  retention_days: number;
  timezone: string;
  schedule_hour: number;
  schedule_minute: number;
  kpi_options?: unknown;
  updated_at: Date;
};

export interface SnapshotInsertModel {
  id: string;
  category: SnapshotCategory;
  trigger: SnapshotTrigger;
  accountId?: string | null;
  capturedAt: Date;
  payload: ProgramSnapshotPayload;
  payloadBytes: number;
  initiativeCount: number;
  recurringImpact: number;
}

export interface SnapshotListFilters {
  limit: number;
  from?: Date | null;
  to?: Date | null;
}

export class SnapshotsRepository {
  private readonly settingsId = 1;

  private mapSettings(row: SnapshotSettingsRow) {
    const kpiOptions =
      Array.isArray(row.kpi_options) && row.kpi_options.every((item) => typeof item === 'string')
        ? (row.kpi_options as string[])
        : [];
    return {
      autoEnabled: Boolean(row.auto_enabled),
      retentionDays: Number(row.retention_days ?? 60),
      timezone: typeof row.timezone === 'string' && row.timezone.trim() ? row.timezone.trim() : 'Australia/Sydney',
      scheduleHour: Number.isInteger(row.schedule_hour) ? Number(row.schedule_hour) : 19,
      scheduleMinute: Number.isInteger(row.schedule_minute) ? Number(row.schedule_minute) : 0,
      kpiOptions,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString()
    };
  }

  private mapRow(row: SnapshotRow) {
    const payloadValue = row.payload;
    let payload: ProgramSnapshotPayload;
    if (!payloadValue) {
      const stageMetrics = createEmptyStageMetricMap();
      payload = {
        version: 1,
        capturedAt: row.captured_at instanceof Date ? row.captured_at.toISOString() : new Date().toISOString(),
        metrics: { initiatives: Number(row.initiative_count ?? 0), workstreams: 0, participants: 0 },
        totals: {
          recurringBenefits: 0,
          recurringCosts: 0,
          oneoffBenefits: 0,
          oneoffCosts: 0,
          recurringImpact: typeof row.recurring_impact === 'string' ? Number(row.recurring_impact) : Number(row.recurring_impact ?? 0)
        },
        financials: { blueprint: null },
        stageGate: {
          metrics: stageMetrics,
          totals: { initiatives: 0, impact: 0 },
          workstreams: []
        },
        stageSummary: createEmptyStageSummary(),
        statusSummary: [],
        workstreamSummary: [],
        initiatives: [],
        workstreams: [],
        participants: []
      };
    } else if (typeof payloadValue === 'string') {
      payload = JSON.parse(payloadValue) as ProgramSnapshotPayload;
    } else {
      payload = payloadValue as ProgramSnapshotPayload;
    }
    if (!payload.stageSummary) {
      payload.stageSummary = createEmptyStageSummary();
    }
    if (!payload.statusSummary) {
      payload.statusSummary = [];
    }
    if (!payload.workstreamSummary) {
      payload.workstreamSummary = [];
    }
    return {
      id: row.id,
      category: row.category,
      trigger: row.trigger,
      accountId: row.account_id,
      capturedAt: row.captured_at instanceof Date ? row.captured_at : new Date(row.captured_at),
      payload,
      payloadBytes: Number(row.payload_bytes ?? 0),
      initiativeCount: Number(row.initiative_count ?? 0),
      recurringImpact: typeof row.recurring_impact === 'string' ? Number(row.recurring_impact) : Number(row.recurring_impact ?? 0)
    };
  }

  async getSettings() {
    const result = await postgresPool.query<SnapshotSettingsRow>(
      `SELECT auto_enabled,
              retention_days,
              timezone,
              schedule_hour,
              schedule_minute,
              kpi_options,
              updated_at
         FROM snapshot_settings
        WHERE id = $1
        LIMIT 1;`,
      [this.settingsId]
    );
    const row = result.rows?.[0];
    if (row) {
      return this.mapSettings(row);
    }
    await postgresPool.query(
      `INSERT INTO snapshot_settings (id, auto_enabled, retention_days, timezone, schedule_hour, schedule_minute, kpi_options)
       VALUES ($1, FALSE, 60, 'Australia/Sydney', 19, 0, '[]'::jsonb)
       ON CONFLICT (id) DO NOTHING;`,
      [this.settingsId]
    );
    const fallback = await postgresPool.query<SnapshotSettingsRow>(
      `SELECT auto_enabled,
              retention_days,
              timezone,
              schedule_hour,
              schedule_minute,
              kpi_options,
              updated_at
         FROM snapshot_settings
        WHERE id = $1
        LIMIT 1;`,
      [this.settingsId]
    );
    return this.mapSettings(fallback.rows?.[0] as SnapshotSettingsRow);
  }

  async updateSettings(patch: Partial<Omit<SnapshotSettingsRow, 'updated_at'>>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (patch.auto_enabled !== undefined) {
      fields.push(`auto_enabled = $${++index}`);
      values.push(patch.auto_enabled);
    }
    if (patch.retention_days !== undefined) {
      fields.push(`retention_days = $${++index}`);
      values.push(patch.retention_days);
    }
    if (patch.timezone !== undefined) {
      fields.push(`timezone = $${++index}`);
      values.push(patch.timezone);
    }
    if (patch.schedule_hour !== undefined) {
      fields.push(`schedule_hour = $${++index}`);
      values.push(patch.schedule_hour);
    }
    if (patch.schedule_minute !== undefined) {
      fields.push(`schedule_minute = $${++index}`);
      values.push(patch.schedule_minute);
    }
    if (patch.kpi_options !== undefined) {
      fields.push(`kpi_options = $${++index}`);
      values.push(patch.kpi_options);
    }

    const baseValues = [this.settingsId];
    const queryValues = [...baseValues, ...values];
    const assignments = fields.length ? `${fields.join(', ')}, updated_at = NOW()` : 'updated_at = NOW()';

    const result = await postgresPool.query<SnapshotSettingsRow>(
      `
        UPDATE snapshot_settings
           SET ${assignments}
         WHERE id = $1
        RETURNING auto_enabled,
                  retention_days,
                  timezone,
                  schedule_hour,
                  schedule_minute,
                  kpi_options,
                  updated_at;
      `,
      queryValues
    );
    const row = result.rows?.[0];
    if (row) {
      return this.mapSettings(row);
    }
    return this.getSettings();
  }

  async insertSnapshot(model: SnapshotInsertModel) {
    const result = await postgresPool.query<SnapshotRow>(
      `INSERT INTO program_snapshots (
         id,
         category,
         trigger,
         account_id,
         captured_at,
         payload,
         payload_bytes,
         initiative_count,
         recurring_impact,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW())
       RETURNING id,
                 category,
                 trigger,
                 account_id,
                 captured_at,
                 payload,
                 payload_bytes,
                 initiative_count,
                 recurring_impact;`,
      [
        model.id,
        model.category,
        model.trigger,
        model.accountId ?? null,
        model.capturedAt,
        JSON.stringify(model.payload),
        model.payloadBytes,
        model.initiativeCount,
        model.recurringImpact
      ]
    );
    return this.mapRow(result.rows[0]);
  }

  async listProgramSnapshots(filters: SnapshotListFilters) {
    const clauses = [`category = 'program'`];
    const values: unknown[] = [];
    let index = 0;

    if (filters.from) {
      clauses.push(`captured_at >= $${++index}`);
      values.push(filters.from);
    }
    if (filters.to) {
      clauses.push(`captured_at <= $${++index}`);
      values.push(filters.to);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(filters.limit || 30, 120));

    const result = await postgresPool.query<SnapshotRow>(
      `
        SELECT id,
               category,
               trigger,
               account_id,
               captured_at,
               payload,
               payload_bytes,
               initiative_count,
               recurring_impact
          FROM program_snapshots
          ${whereClause}
      ORDER BY captured_at DESC
         LIMIT ${limit};
      `,
      values
    );
    return (result.rows ?? []).map((row) => this.mapRow(row));
  }

  async getSnapshot(id: string) {
    const result = await postgresPool.query<SnapshotRow>(
      `
        SELECT id,
               category,
               trigger,
               account_id,
               captured_at,
               payload,
               payload_bytes,
               initiative_count,
               recurring_impact
          FROM program_snapshots
         WHERE id = $1
         LIMIT 1;
      `,
      [id]
    );
    const row = result.rows?.[0];
    return row ? this.mapRow(row) : null;
  }

  async getLatestAutomaticSnapshot() {
    const result = await postgresPool.query<SnapshotRow>(
      `
        SELECT id,
               category,
               trigger,
               account_id,
               captured_at,
               payload,
               payload_bytes,
               initiative_count,
               recurring_impact
          FROM program_snapshots
         WHERE category = 'program'
           AND trigger = 'auto'
      ORDER BY captured_at DESC
         LIMIT 1;
      `
    );
    const row = result.rows?.[0];
    return row ? this.mapRow(row) : null;
  }

  async getLatestProgramSnapshot() {
    const result = await postgresPool.query<SnapshotRow>(
      `
        SELECT id,
               category,
               trigger,
               account_id,
               captured_at,
               payload,
               payload_bytes,
               initiative_count,
               recurring_impact
          FROM program_snapshots
         WHERE category = 'program'
      ORDER BY captured_at DESC
         LIMIT 1;
      `
    );
    const row = result.rows?.[0];
    return row ? this.mapRow(row) : null;
  }

  async deleteProgramSnapshotsBefore(cutoff: Date) {
    await postgresPool.query(
      `DELETE FROM program_snapshots WHERE category = 'program' AND captured_at < $1;`,
      [cutoff]
    );
  }

  async getStorageStats() {
    const result = await postgresPool.query<{
      category: SnapshotCategory;
      count: string;
      bytes: string;
    }>(
      `
        SELECT category, COUNT(*)::text as count, COALESCE(SUM(payload_bytes), 0)::text as bytes
          FROM program_snapshots
      GROUP BY category;
      `
    );
    const stats = {
      programCount: 0,
      sessionCount: 0,
      programBytes: 0,
      sessionBytes: 0
    };
    for (const row of result.rows ?? []) {
      const count = Number(row.count ?? 0);
      const bytes = Number(row.bytes ?? 0);
      if (row.category === 'program') {
        stats.programCount = count;
        stats.programBytes = bytes;
      } else {
        stats.sessionCount += count;
        stats.sessionBytes += bytes;
      }
    }
    return stats;
  }
}
