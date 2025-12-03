import { randomUUID } from 'crypto';
import { WorkstreamsRepository } from './workstreams.repository.js';
import {
  workstreamGateKeys,
  WorkstreamApprovalRound,
  WorkstreamApproverRequirement,
  WorkstreamRole,
  WorkstreamRoleAssignmentRecord,
  workstreamRoleOptions,
  WorkstreamRoleOption,
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

const isApprovalRule = (value: unknown): value is WorkstreamApprovalRound['rule'] =>
  value === 'any' || value === 'all' || value === 'majority';

const normalizeApprover = (value: unknown): WorkstreamApproverRequirement | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const input = value as { id?: unknown; role?: unknown; accountId?: unknown };
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID();
  const role = typeof input.role === 'string' ? input.role.trim() : null;
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : null;
  if (!accountId && !role) {
    return null;
  }
  return { id, accountId, role: role ?? null };
};

const normalizeRound = (value: unknown): WorkstreamApprovalRound | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const input = value as { id?: unknown; approvers?: unknown; rule?: unknown };
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID();
  const approversSource = Array.isArray(input.approvers) ? input.approvers : [];
  const approvers = approversSource
    .map((candidate) => normalizeApprover(candidate))
    .filter((approver): approver is WorkstreamApproverRequirement => Boolean(approver));
  const roundRuleCandidate =
    input.rule ??
    (approversSource.find((item) => item && typeof item === 'object' && 'rule' in (item as Record<string, unknown>)) as
      | { rule?: unknown }
      | undefined)?.rule;
  const rule = isApprovalRule(roundRuleCandidate) ? (roundRuleCandidate as WorkstreamApprovalRound['rule']) : 'any';
  return { id, approvers, rule };
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

const slugifyRoleValue = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
    .trim();

export class WorkstreamsService {
  constructor(private readonly repository: WorkstreamsRepository) {}

  private async loadRoleOptions(): Promise<WorkstreamRoleOption[]> {
    const stored = await this.repository.getRoleOptions();
    if (stored.length) {
      return stored;
    }
    return [...workstreamRoleOptions];
  }

  private sanitizeRoleOptions(options: unknown): WorkstreamRoleOption[] {
    if (!Array.isArray(options)) {
      return [...workstreamRoleOptions];
    }
    const seen = new Set<string>();
    const result: WorkstreamRoleOption[] = [];
    (options as unknown[]).forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const item = entry as { value?: unknown; label?: unknown };
      const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
      const rawValue = typeof item.value === 'string' ? item.value.trim() : '';
      const label = rawLabel || rawValue;
      const value = rawValue || slugifyRoleValue(label) || randomUUID();
      const key = value.toLowerCase();
      if (!label || seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push({ value, label });
    });
    return result.length ? result : [...workstreamRoleOptions];
  }

  private normalizeRoleValue(value: unknown, allowed: Set<string>): WorkstreamRole | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return allowed.has(trimmed) ? trimmed : null;
  }

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

  async getRoleOptions() {
    return this.loadRoleOptions();
  }

  async saveRoleOptions(options: unknown) {
    const normalized = this.sanitizeRoleOptions(options);
    return this.repository.saveRoleOptions(normalized);
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
    const allowed = new Set((await this.loadRoleOptions()).map((item) => item.value));
    const normalizedAssignments = assignments
      .map((assignment) => ({
        workstreamId: typeof assignment.workstreamId === 'string' ? assignment.workstreamId.trim() : '',
        role: this.normalizeRoleValue(assignment.role, allowed)
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

  async listAssignmentsByWorkstream(workstreamId: string) {
    const trimmed = workstreamId.trim();
    if (!trimmed) {
      throw new Error('WORKSTREAM_NOT_FOUND');
    }
    const existingIds = await this.repository.findExistingWorkstreamIds([trimmed]);
    if (!existingIds.includes(trimmed)) {
      throw new Error('WORKSTREAM_NOT_FOUND');
    }
    return this.repository.listAssignmentsByWorkstream(trimmed);
  }
}
