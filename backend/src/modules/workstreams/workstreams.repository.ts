import { randomUUID } from 'crypto';
import { postgresPool } from '../../shared/database/postgres.client.js';
import {
  workstreamGateKeys,
  WorkstreamApprovalRound,
  WorkstreamApproverRequirement,
  WorkstreamRecord,
  WorkstreamRole,
  WorkstreamRoleAssignmentRecord,
  WorkstreamRoleOption,
  WorkstreamWriteModel
} from './workstreams.types.js';

type DbRow = {
  id: string;
  name: string;
  description: string | null;
  gates: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
};

type AssignmentRow = {
  id: string;
  account_id: string;
  workstream_id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
};

const isApprovalRule = (value: unknown): value is WorkstreamApprovalRound['rule'] =>
  value === 'any' || value === 'all' || value === 'majority';

const normalizeApprover = (value: unknown): WorkstreamApproverRequirement | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as { id?: unknown; role?: unknown; accountId?: unknown };
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomUUID();
  const role = typeof source.role === 'string' ? source.role.trim() : null;
  const accountId = typeof source.accountId === 'string' ? source.accountId.trim() : null;
  if (!accountId && !role) {
    return null;
  }
  return { id, accountId, role: role ?? null };
};

const normalizeRound = (value: unknown): WorkstreamApprovalRound | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as { id?: unknown; approvers?: unknown; rule?: unknown };
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomUUID();
  const approversSource = Array.isArray(source.approvers) ? source.approvers : [];
  const approvers = approversSource
    .map((candidate) => normalizeApprover(candidate))
    .filter((approver): approver is WorkstreamApproverRequirement => Boolean(approver));
  const legacyRule =
    approversSource.find((candidate) => candidate && typeof candidate === 'object' && 'rule' in (candidate as any)) ??
    null;
  const roundRuleCandidate =
    source.rule ??
    (legacyRule && typeof (legacyRule as { rule?: unknown }).rule === 'string'
      ? (legacyRule as { rule?: unknown }).rule
      : null);
  const rule = isApprovalRule(roundRuleCandidate) ? (roundRuleCandidate as WorkstreamApprovalRound['rule']) : 'any';
  return { id, approvers: approvers.length ? approvers : [], rule };
};

const normalizeGates = (value: unknown) => {
  const gates = workstreamGateKeys.reduce(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {} as Record<(typeof workstreamGateKeys)[number], WorkstreamApprovalRound[]>
  );

  if (!value || typeof value !== 'object') {
    return gates;
  }

  const source = value as Record<string, unknown>;
  for (const key of workstreamGateKeys) {
    const roundsSource = Array.isArray(source[key]) ? source[key] : [];
    gates[key] = roundsSource
      .map((candidate) => normalizeRound(candidate))
      .filter((round): round is WorkstreamApprovalRound => Boolean(round))
      .map((round) => ({
        ...round,
        approvers: round.approvers.length ? round.approvers : []
      }));
  }

  return gates;
};

const mapRowToWorkstream = (row: DbRow): WorkstreamRecord => ({
  id: row.id,
  name: row.name,
  description: typeof row.description === 'string' ? row.description : '',
  version: Number(row.version ?? 1),
  createdAt: (row.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
  updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date()).toISOString(),
  gates: normalizeGates(row.gates)
});

const isWorkstreamRole = (value: unknown): value is WorkstreamRole =>
  typeof value === 'string' && value.length > 0;

const mapAssignmentRow = (row: AssignmentRow): WorkstreamRoleAssignmentRecord | null => {
  if (!isWorkstreamRole(row.role)) {
    return null;
  }
  return {
    id: row.id,
    accountId: row.account_id,
    workstreamId: row.workstream_id,
    role: row.role,
    createdAt: (row.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
    updatedAt: (row.updated_at instanceof Date ? row.updated_at : new Date()).toISOString()
  };
};

const connectClient = async () =>
  (postgresPool as unknown as { connect: () => Promise<any> }).connect();

export class WorkstreamsRepository {
  async getRoleOptions(): Promise<WorkstreamRoleOption[]> {
    const result = await postgresPool.query<{ options: unknown }>(
      'SELECT options FROM workstream_role_options WHERE id = 1 LIMIT 1;'
    );
    const row = result.rows?.[0];
    if (!row || !Array.isArray(row.options)) {
      return [];
    }
    return row.options
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const payload = item as { value?: unknown; label?: unknown };
        const value = typeof payload.value === 'string' ? payload.value.trim() : '';
        const label = typeof payload.label === 'string' ? payload.label.trim() : '';
        if (!value || !label) {
          return null;
        }
        return { value, label };
      })
      .filter((item): item is WorkstreamRoleOption => Boolean(item));
  }

  async saveRoleOptions(options: WorkstreamRoleOption[]): Promise<WorkstreamRoleOption[]> {
    const payload = options.map((option) => ({ value: option.value, label: option.label }));
    await postgresPool.query(
      `INSERT INTO workstream_role_options (id, options, updated_at)
         VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id)
       DO UPDATE SET options = EXCLUDED.options, updated_at = NOW();`,
      [JSON.stringify(payload)]
    );
    return this.getRoleOptions();
  }

  async listWorkstreams(): Promise<WorkstreamRecord[]> {
    const result = await postgresPool.query<DbRow>('SELECT * FROM workstreams ORDER BY updated_at DESC;');
    return (result.rows ?? []).map((row) => mapRowToWorkstream(row));
  }

  async findWorkstream(id: string): Promise<WorkstreamRecord | null> {
    const result = await postgresPool.query<DbRow>('SELECT * FROM workstreams WHERE id = $1 LIMIT 1;', [id]);
    const row = result.rows?.[0];
    return row ? mapRowToWorkstream(row) : null;
  }

  async createWorkstream(model: WorkstreamWriteModel): Promise<WorkstreamRecord> {
    const result = await postgresPool.query<DbRow>(
      `INSERT INTO workstreams (id, name, description, gates, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, 1, NOW(), NOW())
       RETURNING *;`,
      [model.id, model.name, model.description || '', JSON.stringify(model.gates)]
    );
    return mapRowToWorkstream(result.rows[0]);
  }

  async updateWorkstream(
    model: WorkstreamWriteModel,
    expectedVersion: number
  ): Promise<{ type: 'ok'; record: WorkstreamRecord } | { type: 'version-conflict' } | { type: 'not-found' }> {
    const result = await postgresPool.query<DbRow>(
      `UPDATE workstreams
          SET name = $2,
              description = $3,
              gates = $4::jsonb,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1 AND version = $5
        RETURNING *;`,
      [model.id, model.name, model.description || '', JSON.stringify(model.gates), expectedVersion]
    );
    if (!result.rows?.length) {
      const exists = await postgresPool.query('SELECT 1 FROM workstreams WHERE id = $1 LIMIT 1;', [model.id]);
      const existsCount = (exists as { rowCount?: number }).rowCount ?? 0;
      if (existsCount === 0) {
        return { type: 'not-found' };
      }
      return { type: 'version-conflict' };
    }
    return { type: 'ok', record: mapRowToWorkstream(result.rows[0]) };
  }

  async deleteWorkstream(id: string): Promise<boolean> {
    const result = await postgresPool.query('DELETE FROM workstreams WHERE id = $1;', [id]);
    const removedCount = (result as { rowCount?: number }).rowCount ?? 0;
    return removedCount > 0;
  }

  async accountExists(accountId: string): Promise<boolean> {
    const result = await postgresPool.query('SELECT 1 FROM accounts WHERE id = $1 LIMIT 1;', [accountId]);
    const count = (result as { rowCount?: number }).rowCount ?? 0;
    return count > 0;
  }

  async findExistingWorkstreamIds(ids: string[]): Promise<string[]> {
    if (!ids.length) {
      return [];
    }
    const result = await postgresPool.query<{ id: string }>(
      'SELECT id FROM workstreams WHERE id = ANY($1::uuid[])',
      [ids]
    );
    return result.rows?.map((row) => row.id) ?? [];
  }

  async listAssignments(accountId: string): Promise<WorkstreamRoleAssignmentRecord[]> {
    const result = await postgresPool.query<AssignmentRow>(
      `SELECT * FROM workstream_role_assignments
        WHERE account_id = $1
        ORDER BY created_at ASC;`,
      [accountId]
    );
    return (result.rows ?? [])
      .map((row: AssignmentRow) => mapAssignmentRow(row))
      .filter(
        (row: WorkstreamRoleAssignmentRecord | null): row is WorkstreamRoleAssignmentRecord =>
          Boolean(row)
      );
  }

  async listAssignmentsByWorkstream(workstreamId: string): Promise<WorkstreamRoleAssignmentRecord[]> {
    const result = await postgresPool.query<AssignmentRow>(
      `SELECT * FROM workstream_role_assignments
        WHERE workstream_id = $1
        ORDER BY created_at ASC;`,
      [workstreamId]
    );
    return (result.rows ?? [])
      .map((row: AssignmentRow) => mapAssignmentRow(row))
      .filter(
        (row: WorkstreamRoleAssignmentRecord | null): row is WorkstreamRoleAssignmentRecord =>
          Boolean(row)
      );
  }

  async saveAssignments(
    accountId: string,
    assignments: Array<{ workstreamId: string; role: WorkstreamRole | null }>
  ): Promise<WorkstreamRoleAssignmentRecord[]> {
    const client = await connectClient();
    try {
      await client.query('BEGIN');
      for (const assignment of assignments) {
        if (!assignment.workstreamId) {
          continue;
        }
        if (!assignment.role) {
          await client.query(
            'DELETE FROM workstream_role_assignments WHERE account_id = $1 AND workstream_id = $2;',
            [accountId, assignment.workstreamId]
          );
          continue;
        }
        await client.query(
          `INSERT INTO workstream_role_assignments (id, account_id, workstream_id, role, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (account_id, workstream_id)
           DO UPDATE SET role = EXCLUDED.role, updated_at = NOW();`,
          [randomUUID(), accountId, assignment.workstreamId, assignment.role]
        );
      }
      const rows = await client.query(
        `SELECT * FROM workstream_role_assignments
          WHERE account_id = $1
          ORDER BY created_at ASC;`,
        [accountId]
      );
      await client.query('COMMIT');
      return (rows.rows ?? [])
        .map((row: AssignmentRow) => mapAssignmentRow(row))
        .filter(
          (row: WorkstreamRoleAssignmentRecord | null): row is WorkstreamRoleAssignmentRecord =>
            Boolean(row)
        );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
