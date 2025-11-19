import { randomUUID } from 'crypto';
import { postgresPool } from '../../shared/database/postgres.client.js';

interface InitiativeEventRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  initiative_id: string;
  event_type: string;
  field: string;
  previous_value: unknown;
  next_value: unknown;
  actor_account_id: string | null;
  actor_name: string | null;
  created_at: Date;
  workstream_id: string;
  workstream_name: string;
  initiative_name: string;
}

interface ReadMarkerRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  account_id: string;
}

export interface InitiativeLogEntry {
  id: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  eventType: string;
  field: string;
  previousValue: unknown;
  nextValue: unknown;
  actorAccountId: string | null;
  actorName: string | null;
  createdAt: string;
  read: boolean;
}

export interface InitiativeLogFilters {
  limit?: number;
  before?: Date | null;
  after?: Date | null;
  workstreamIds?: string[];
  initiativeIds?: string[];
}

export class InitiativeLogsRepository {
  async listEntries(accountId: string, filters: InitiativeLogFilters): Promise<InitiativeLogEntry[]> {
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.before) {
      whereClauses.push(`events.created_at <= $${idx}`);
      values.push(filters.before);
      idx += 1;
    }
    if (filters.after) {
      whereClauses.push(`events.created_at >= $${idx}`);
      values.push(filters.after);
      idx += 1;
    }
    if (filters.workstreamIds && filters.workstreamIds.length) {
      whereClauses.push(`workstreams.id = ANY($${idx}::uuid[])`);
      values.push(filters.workstreamIds);
      idx += 1;
    }
    if (filters.initiativeIds && filters.initiativeIds.length) {
      whereClauses.push(`initiatives.id = ANY($${idx}::uuid[])`);
      values.push(filters.initiativeIds);
      idx += 1;
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));

    const rows = await postgresPool.query<InitiativeEventRow>(
      `
        SELECT events.id,
               events.event_id,
               events.initiative_id,
               events.event_type,
               events.field,
               events.previous_value,
               events.next_value,
               events.actor_account_id,
               events.actor_name,
               events.created_at,
               workstreams.id as workstream_id,
               workstreams.name as workstream_name,
               initiatives.name as initiative_name
          FROM workstream_initiative_events events
          JOIN workstream_initiatives initiatives ON initiatives.id = events.initiative_id
          JOIN workstreams ON workstreams.id = initiatives.workstream_id
          ${whereSql}
      ORDER BY events.created_at DESC
         LIMIT ${limit};
      `,
      values
    );

    const entries = rows.rows ?? [];
    if (!entries.length) {
      return [];
    }
    const eventIds = entries.map((row) => row.id);
    const readRows = await postgresPool.query<ReadMarkerRow>(
      `SELECT event_id FROM initiative_event_reads WHERE account_id = $1 AND event_id = ANY($2::uuid[])`,
      [accountId, eventIds]
    );
    const readSet = new Set(readRows.rows?.map((row) => row.event_id));

    return entries.map((row) => ({
      id: row.id,
      initiativeId: row.initiative_id,
      initiativeName: row.initiative_name,
      workstreamId: row.workstream_id,
      workstreamName: row.workstream_name,
      eventType: row.event_type,
      field: row.field,
      previousValue: row.previous_value,
      nextValue: row.next_value,
      actorAccountId: row.actor_account_id,
      actorName: row.actor_name,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      read: readSet.has(row.id)
    }));
  }

  async markAsRead(accountId: string, eventIds: string[]) {
    if (!eventIds.length) {
      return;
    }
    const client = await (postgresPool as unknown as { connect: () => Promise<any> }).connect();
    try {
      await client.query('BEGIN');
      for (const eventId of eventIds) {
        await client.query(
          `INSERT INTO initiative_event_reads (id, event_id, account_id, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (event_id, account_id) DO NOTHING;`,
          [randomUUID(), eventId, accountId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
