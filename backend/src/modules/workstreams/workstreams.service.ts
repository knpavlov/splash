import { randomUUID } from 'crypto';
import {
  WorkstreamsRepository
} from './workstreams.repository.js';
import {
  workstreamGateKeys,
  WorkstreamApprovalRound,
  WorkstreamApproverRequirement,
  WorkstreamRole,
  WorkstreamRoleAssignmentRecord,
  workstreamRoleOptions,
  WorkstreamWriteModel
} from './workstreams.types.js';

const buildEmptyGates = () =>
  workstreamGateKeys.reduce(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {} as WorkstreamWriteModel['gates']
  );

const isApprovalRule = (value: unknown): value is WorkstreamApproverRequirement['rule'] =>
  value === 'any' || value === 'all' || value === 'majority';

const normalizeApprover = (value: unknown): WorkstreamApproverRequirement | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const input = value as { id?: unknown; role?: unknown; rule?: unknown };
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID();
  const role = typeof input.role === 'string' ? input.role.trim() : '';
  const rule = isApprovalRule(input.rule) ? input.rule : 'any';
  if (!role) {
    return null;
  }
  return { id, role, rule };
};

const normalizeRound = (value: unknown): WorkstreamApprovalRound | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const input = value as { id?: unknown; approvers?: unknown };
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID();
  const approversSource = Array.isArray(input.approvers) ? input.approvers : [];
  const approvers = approversSource
    .map((candidate) => normalizeApprover(candidate))
    .filter((approver): approver is WorkstreamApproverRequirement => Boolean(approver));
  if (!approvers.length) {
    return null;
  }
  return { id, approvers };
};

const normalizeGates = (value: unknown) => {
  const base = buildEmptyGates();
  if (!value || typeof value !== 'object') {
    return base;
  }
  const source = value as Record<string, unknown>;
  for (const key of workstreamGateKeys) {
    const roundsSource = Array.isArray(source[key]) ? source[key] : [];
    const rounds = roundsSource
      .map((candidate) => normalizeRound(candidate))
      .filter((round): round is WorkstreamApprovalRound => Boolean(round));
    base[key] = rounds;
  }
  return base;
};

const allowedRoleValues = new Set(workstreamRoleOptions.map((item) => item.value));

const normalizeRole = (value: unknown): WorkstreamRole | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return allowedRoleValues.has(trimmed as WorkstreamRole) ? (trimmed as WorkstreamRole) : null;
};

export class WorkstreamsService {
  constructor(private readonly repository: WorkstreamsRepository) {}

  async listWorkstreams() {
    return this.repository.listWorkstreams();
  }

  async getWorkstream(id: string) {
    const record = await this.repository.findWorkstream(id);
    if (!record) {
      throw new Error('NOT_FOUND');
    }
    return record;
  }

  private sanitizeInput(payload: unknown): WorkstreamWriteModel {
    if (!payload || typeof payload !== 'object') {
      throw new Error('INVALID_INPUT');
    }
    const input = payload as {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      gates?: unknown;
    };
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID();
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) {
      throw new Error('INVALID_INPUT');
    }
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const gates = normalizeGates(input.gates);
    return {
      id,
      name,
      description,
      gates
    };
  }

  async createWorkstream(payload: unknown) {
    const sanitized = this.sanitizeInput(payload);
    const existing = await this.repository.findWorkstream(sanitized.id);
    if (existing) {
      throw new Error('INVALID_INPUT');
    }
    return this.repository.createWorkstream(sanitized);
  }

  async updateWorkstream(id: string, payload: unknown, expectedVersion: number) {
    if (!Number.isInteger(expectedVersion)) {
      throw new Error('INVALID_INPUT');
    }
    const basePayload =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const sanitized = this.sanitizeInput({ ...basePayload, id });
    const result = await this.repository.updateWorkstream(sanitized, expectedVersion);
    if (result.type === 'not-found') {
      throw new Error('NOT_FOUND');
    }
    if (result.type === 'version-conflict') {
      throw new Error('VERSION_CONFLICT');
    }
    return result.record;
  }

  async removeWorkstream(id: string) {
    const removed = await this.repository.deleteWorkstream(id);
    if (!removed) {
      throw new Error('NOT_FOUND');
    }
    return id;
  }

  getRoleOptions() {
    return workstreamRoleOptions;
  }

  async listAssignments(accountId: string): Promise<WorkstreamRoleAssignmentRecord[]> {
    const trimmed = accountId.trim();
    if (!trimmed) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    const exists = await this.repository.accountExists(trimmed);
    if (!exists) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    return this.repository.listAssignments(trimmed);
  }

  async saveAssignments(
    accountId: string,
    assignments: Array<{ workstreamId: string; role: WorkstreamRole | null }>
  ): Promise<WorkstreamRoleAssignmentRecord[]> {
    const trimmedId = accountId.trim();
    if (!trimmedId) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    const exists = await this.repository.accountExists(trimmedId);
    if (!exists) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    const normalizedAssignments = assignments
      .map((assignment) => ({
        workstreamId: typeof assignment.workstreamId === 'string' ? assignment.workstreamId.trim() : '',
        role: normalizeRole(assignment.role)
      }))
      .filter((assignment) => assignment.workstreamId);

    const uniqueIds = Array.from(new Set(normalizedAssignments.map((item) => item.workstreamId)));
    if (uniqueIds.length) {
      const existingIds = await this.repository.findExistingWorkstreamIds(uniqueIds);
      if (existingIds.length !== uniqueIds.length) {
        throw new Error('WORKSTREAM_NOT_FOUND');
      }
    }

    return this.repository.saveAssignments(trimmedId, normalizedAssignments);
  }
}
