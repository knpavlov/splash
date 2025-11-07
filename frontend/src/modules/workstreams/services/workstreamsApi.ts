import { apiRequest } from '../../../shared/api/httpClient';
import {
  approvalRuleOptions,
  defaultWorkstreamRoleOptions,
  Workstream,
  WorkstreamApprovalRound,
  WorkstreamApproverRequirement,
  WorkstreamGateKey,
  workstreamGateKeys,
  WorkstreamRole,
  WorkstreamRoleAssignment,
  WorkstreamRoleOption,
  WorkstreamRoleSelection
} from '../../../shared/types/workstream';

const allowedRoles = new Set(defaultWorkstreamRoleOptions.map((item) => item.value));

const normalizeIso = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
};

const isApprovalRule = (value: unknown): value is WorkstreamApproverRequirement['rule'] =>
  approvalRuleOptions.some((option) => option.value === value);

const normalizeApprover = (value: unknown): WorkstreamApproverRequirement | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { id?: unknown; role?: unknown; rule?: unknown };
  const id = normalizeString(payload.id);
  const role = normalizeString(payload.role);
  const rule = isApprovalRule(payload.rule) ? payload.rule : 'any';
  if (!id || !role) {
    return null;
  }
  return { id, role, rule };
};

const normalizeRound = (value: unknown): WorkstreamApprovalRound | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { id?: unknown; approvers?: unknown };
  const id = normalizeString(payload.id);
  if (!id) {
    return null;
  }
  const approversSource = Array.isArray(payload.approvers) ? payload.approvers : [];
  const approvers = approversSource
    .map((item) => normalizeApprover(item))
    .filter((approver): approver is WorkstreamApproverRequirement => Boolean(approver));
  return { id, approvers };
};

const normalizeGates = (value: unknown) => {
  const base = workstreamGateKeys.reduce(
    (acc, key) => {
      acc[key] = [];
      return acc;
    },
    {} as Record<WorkstreamGateKey, WorkstreamApprovalRound[]>
  );
  if (!value || typeof value !== 'object') {
    return base;
  }
  const payload = value as Record<string, unknown>;
  for (const key of workstreamGateKeys) {
    const source = Array.isArray(payload[key]) ? payload[key] : [];
    base[key] = source
      .map((round) => normalizeRound(round))
      .filter((round): round is WorkstreamApprovalRound => Boolean(round));
  }
  return base;
};

const normalizeWorkstream = (value: unknown): Workstream | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    gates?: unknown;
  };
  const id = normalizeString(payload.id);
  const name = normalizeString(payload.name);
  if (!id || !name) {
    return null;
  }
  const description = normalizeString(payload.description) ?? '';
  const version = typeof payload.version === 'number' ? payload.version : Number(payload.version);
  const createdAt = normalizeIso(payload.createdAt);
  const updatedAt = normalizeIso(payload.updatedAt);
  if (!Number.isInteger(version) || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    name,
    description,
    version,
    createdAt,
    updatedAt,
    gates: normalizeGates(payload.gates)
  };
};

const ensureWorkstream = (value: unknown): Workstream => {
  const record = normalizeWorkstream(value);
  if (!record) {
    throw new Error('Failed to parse workstream payload.');
  }
  return record;
};

const ensureWorkstreamList = (value: unknown): Workstream[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeWorkstream(item)).filter((item): item is Workstream => Boolean(item));
};

const serializeWorkstream = (workstream: Workstream) => ({
  ...workstream,
  gates: workstreamGateKeys.reduce(
    (acc, key) => {
      acc[key] = workstream.gates[key]?.map((round) => ({
        ...round,
        approvers: round.approvers.map((approver) => ({
          ...approver,
          role: approver.role.trim(),
          rule: approver.rule
        }))
      }));
      return acc;
    },
    {} as Record<WorkstreamGateKey, WorkstreamApprovalRound[]>
  )
});

const normalizeRoleOption = (value: unknown): WorkstreamRoleOption | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as { value?: unknown; label?: unknown };
  const roleValue = typeof payload.value === 'string' ? payload.value.trim() : '';
  const label = typeof payload.label === 'string' ? payload.label.trim() : '';
  if (!roleValue || !label || !allowedRoles.has(roleValue as WorkstreamRole)) {
    return null;
  }
  return { value: roleValue as WorkstreamRole, label };
};

const ensureRoleOptions = (value: unknown): WorkstreamRoleOption[] => {
  if (!Array.isArray(value)) {
    return [...defaultWorkstreamRoleOptions];
  }
  const options = value
    .map((item) => normalizeRoleOption(item))
    .filter((item): item is WorkstreamRoleOption => Boolean(item));
  return options.length ? options : [...defaultWorkstreamRoleOptions];
};

const normalizeRoleAssignment = (value: unknown): WorkstreamRoleAssignment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const payload = value as {
    id?: unknown;
    accountId?: unknown;
    workstreamId?: unknown;
    role?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  const id = normalizeString(payload.id);
  const accountId = normalizeString(payload.accountId);
  const workstreamId = normalizeString(payload.workstreamId);
  const role = normalizeString(payload.role);
  const createdAt = normalizeIso(payload.createdAt);
  const updatedAt = normalizeIso(payload.updatedAt);
  if (!id || !accountId || !workstreamId || !role || !createdAt || !updatedAt) {
    return null;
  }
  if (!allowedRoles.has(role as WorkstreamRole)) {
    return null;
  }
  return {
    id,
    accountId,
    workstreamId,
    role: role as WorkstreamRole,
    createdAt,
    updatedAt
  };
};

const ensureAssignments = (value: unknown): WorkstreamRoleAssignment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeRoleAssignment(item))
    .filter((item): item is WorkstreamRoleAssignment => Boolean(item));
};

export const workstreamsApi = {
  list: async () => ensureWorkstreamList(await apiRequest<unknown>('/workstreams')),
  create: async (workstream: Workstream) =>
    ensureWorkstream(
      await apiRequest<unknown>('/workstreams', {
        method: 'POST',
        body: { workstream: serializeWorkstream(workstream) }
      })
    ),
  update: async (id: string, workstream: Workstream, expectedVersion: number) =>
    ensureWorkstream(
      await apiRequest<unknown>(`/workstreams/${id}`, {
        method: 'PUT',
        body: { workstream: serializeWorkstream(workstream), expectedVersion }
      })
    ),
  remove: async (id: string) =>
    apiRequest<{ id?: unknown }>(`/workstreams/${id}`, { method: 'DELETE' }).then((payload) => {
      const identifier = typeof payload.id === 'string' ? payload.id : id;
      return identifier;
    }),
  roleOptions: async () => ensureRoleOptions(await apiRequest<unknown>('/workstreams/role-options')),
  listAssignments: async (accountId: string) =>
    ensureAssignments(await apiRequest<unknown>(`/accounts/${accountId}/workstream-roles`)),
  saveAssignments: async (accountId: string, roles: WorkstreamRoleSelection[]) =>
    ensureAssignments(
      await apiRequest<unknown>(`/accounts/${accountId}/workstream-roles`, {
        method: 'PUT',
        body: { roles }
      })
    )
};
