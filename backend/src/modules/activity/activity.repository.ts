import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  ActivityCommentRow,
  ActivityEventRow,
  ActivityPreferences,
  ActivityPreferencesRow,
  ActivityTimeframeKey
} from './activity.types.js';

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => Boolean(item));
};

const isTimeframeKey = (value: unknown): value is ActivityTimeframeKey =>
  value === 'since-last-login' ||
  value === 'since-last-visit' ||
  value === 'since-yesterday' ||
  value === 'since-7-days' ||
  value === 'since-last-month';

const mapPreferencesRow = (row: ActivityPreferencesRow): ActivityPreferences => ({
  accountId: row.account_id,
  workstreamIds: normalizeStringArray(row.workstream_ids),
  initiativeIds: normalizeStringArray(row.initiative_ids),
  moduleKeys: normalizeStringArray(row.module_keys),
  metricKeys: normalizeStringArray(row.metric_keys),
  defaultTimeframe: isTimeframeKey(row.default_timeframe) ? row.default_timeframe : 'since-last-login',
  lastVisitedAt: row.last_checked_at instanceof Date ? row.last_checked_at.toISOString() : null,
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString()
});

export class ActivityRepository {
  async getPreferences(accountId: string): Promise<ActivityPreferences | null> {
    const result = await postgresPool.query<ActivityPreferencesRow>(
      `SELECT account_id,
              workstream_ids,
              initiative_ids,
              module_keys,
              metric_keys,
              default_timeframe,
              last_checked_at,
              updated_at
         FROM account_activity_preferences
        WHERE account_id = $1
        LIMIT 1;`,
      [accountId]
    );
    const row = result.rows?.[0];
    return row ? mapPreferencesRow(row) : null;
  }

  async upsertPreferences(accountId: string, payload: {
    workstreamIds: string[];
    initiativeIds: string[];
    moduleKeys: string[];
    metricKeys: string[];
    defaultTimeframe: ActivityTimeframeKey;
  }): Promise<ActivityPreferences> {
    const result = await postgresPool.query<ActivityPreferencesRow>(
      `INSERT INTO account_activity_preferences
         (account_id, workstream_ids, initiative_ids, module_keys, metric_keys, default_timeframe, updated_at)
       VALUES ($1, $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6, NOW())
       ON CONFLICT (account_id)
     DO UPDATE
           SET workstream_ids = EXCLUDED.workstream_ids,
               initiative_ids = EXCLUDED.initiative_ids,
               module_keys = EXCLUDED.module_keys,
               metric_keys = EXCLUDED.metric_keys,
               default_timeframe = EXCLUDED.default_timeframe,
               updated_at = NOW()
       RETURNING account_id,
                 workstream_ids,
                 initiative_ids,
                 module_keys,
                 metric_keys,
                 default_timeframe,
                 last_checked_at,
                 updated_at;`,
      [
        accountId,
        payload.workstreamIds,
        payload.initiativeIds,
        payload.moduleKeys,
        payload.metricKeys,
        payload.defaultTimeframe
      ]
    );
    return mapPreferencesRow(result.rows[0]);
  }

  async updateLastChecked(accountId: string, timestamp: Date): Promise<Date> {
    const result = await postgresPool.query<{ last_checked_at: Date }>(
      `INSERT INTO account_activity_preferences (account_id, last_checked_at, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (account_id)
     DO UPDATE
           SET last_checked_at = EXCLUDED.last_checked_at,
               updated_at = NOW()
       RETURNING last_checked_at;`,
      [accountId, timestamp]
    );
    return result.rows?.[0]?.last_checked_at ?? timestamp;
  }

  async getLastLoginAt(accountId: string): Promise<Date | null> {
    const result = await postgresPool.query<{ captured_at: Date }>(
      `SELECT captured_at
         FROM program_snapshots
        WHERE category = 'session'
          AND trigger = 'login'
          AND account_id = $1
     ORDER BY captured_at DESC
        LIMIT 1;`,
      [accountId]
    );
    const row = result.rows?.[0];
    return row?.captured_at instanceof Date ? row.captured_at : null;
  }

  async listEvents(filters: {
    start?: Date | null;
    workstreamIds?: string[];
    initiativeIds?: string[];
    limit?: number;
  }): Promise<ActivityEventRow[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.start) {
      where.push(`events.created_at >= $${idx}`);
      values.push(filters.start);
      idx += 1;
    }
    const workstreamIds = filters.workstreamIds?.filter(Boolean) ?? [];
    if (workstreamIds.length) {
      where.push(`initiatives.workstream_id = ANY($${idx}::uuid[])`);
      values.push(workstreamIds);
      idx += 1;
    }
    const initiativeIds = filters.initiativeIds?.filter(Boolean) ?? [];
    if (initiativeIds.length) {
      where.push(`events.initiative_id = ANY($${idx}::uuid[])`);
      values.push(initiativeIds);
      idx += 1;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit ?? 600, 50), 5000);

    const result = await postgresPool.query<ActivityEventRow>(
      `SELECT events.id,
              events.initiative_id,
              initiatives.workstream_id,
              events.field,
              events.previous_value,
              events.next_value,
              events.event_type,
              events.created_at
         FROM workstream_initiative_events events
         JOIN workstream_initiatives initiatives ON initiatives.id = events.initiative_id
         ${whereSql}
     ORDER BY events.created_at DESC
        LIMIT ${limit};`,
      values
    );
    return result.rows ?? [];
  }

  async listCommentEntries(filters: {
    start: Date;
    workstreamIds?: string[];
    initiativeIds?: string[];
    limit: number;
  }): Promise<ActivityCommentRow[]> {
    const where: string[] = [`messages.created_at >= $1`];
    const values: unknown[] = [filters.start];
    let idx = 2;

    const workstreamIds = filters.workstreamIds?.filter(Boolean) ?? [];
    if (workstreamIds.length) {
      where.push(`initiatives.workstream_id = ANY($${idx}::uuid[])`);
      values.push(workstreamIds);
      idx += 1;
    }

    const initiativeIds = filters.initiativeIds?.filter(Boolean) ?? [];
    if (initiativeIds.length) {
      where.push(`threads.initiative_id = ANY($${idx}::uuid[])`);
      values.push(initiativeIds);
      idx += 1;
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const limit = Math.min(Math.max(filters.limit, 10), 200);

    const result = await postgresPool.query<ActivityCommentRow>(
      `SELECT messages.id AS message_id,
              messages.thread_id,
              threads.initiative_id,
              initiatives.name AS initiative_name,
              initiatives.workstream_id,
              workstreams.name AS workstream_name,
              messages.body,
              messages.author_name,
              messages.created_at,
              messages.parent_id,
              threads.stage_key,
              threads.target_label,
              threads.target_path,
              threads.resolved_at
         FROM initiative_comment_messages messages
         JOIN initiative_comment_threads threads ON threads.id = messages.thread_id
         JOIN workstream_initiatives initiatives ON initiatives.id = threads.initiative_id
         JOIN workstreams ON workstreams.id = initiatives.workstream_id
         ${whereSql}
     ORDER BY messages.created_at DESC
        LIMIT ${limit};`,
      values
    );
    return result.rows ?? [];
  }
}
