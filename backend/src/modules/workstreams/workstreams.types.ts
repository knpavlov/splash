export const workstreamGateKeys = ['l1', 'l2', 'l3', 'l4', 'l5'] as const;
export type WorkstreamGateKey = (typeof workstreamGateKeys)[number];

export type WorkstreamApprovalRule = 'any' | 'all' | 'majority';

export interface WorkstreamApproverRequirement {
  id: string;
  accountId: string | null;
  role?: string | null;
}

export interface WorkstreamApprovalRound {
  id: string;
  rule: WorkstreamApprovalRule;
  approvers: WorkstreamApproverRequirement[];
}

export type WorkstreamGates = Record<WorkstreamGateKey, WorkstreamApprovalRound[]>;

export interface WorkstreamRecord {
  id: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  gates: WorkstreamGates;
}

export interface WorkstreamWriteModel {
  id: string;
  name: string;
  description: string;
  gates: WorkstreamGates;
}

export const workstreamRoleOptions = [
  { value: 'initiative-owner', label: 'Initiative Owner' },
  { value: 'milestone-owner', label: 'Milestone Owner' },
  { value: 'workstream-lead', label: 'Workstream Lead' },
  { value: 'manager-full-viewing-rights', label: 'Manager (Full Viewing Rights)' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'head-of-transformation', label: 'Head of Transformation' },
  { value: 'transformation-lead', label: 'Transformation Lead' },
  { value: 'transformation-office-team-member', label: 'Transformation Office Team Member' },
  { value: 'finance-team-member', label: 'Finance Team Member' },
  { value: 'head-of-finance', label: 'Head of Finance' },
  { value: 'manager-limited-viewing-rights', label: 'Manager (Limited Viewing Rights)' }
] as const;

export type WorkstreamRole = string;

export interface WorkstreamRoleOption {
  value: WorkstreamRole;
  label: string;
}

export interface WorkstreamRoleAssignmentRecord {
  id: string;
  accountId: string;
  workstreamId: string;
  role: WorkstreamRole;
  createdAt: string;
  updatedAt: string;
}
