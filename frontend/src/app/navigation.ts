import { AccountRole } from '../shared/types/account';

export type NavigationKey =
  | 'cases'
  | 'case-criteria'
  | 'questions'
  | 'workstreams'
  | 'initiatives'
  | 'approvals'
  | 'candidates'
  | 'evaluation'
  | 'interviews'
  | 'stats'
  | 'accounts';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
  roleAccess: AccountRole[];
}

export const navigationItems: NavigationItem[] = [
  { key: 'cases', label: 'Case library', roleAccess: ['super-admin', 'admin'] },
  { key: 'case-criteria', label: 'Case criteria', roleAccess: ['super-admin', 'admin'] },
  { key: 'questions', label: 'Fit questions', roleAccess: ['super-admin', 'admin'] },
  { key: 'workstreams', label: 'Workstreams', roleAccess: ['super-admin', 'admin'] },
  { key: 'initiatives', label: 'Initiatives', roleAccess: ['super-admin', 'admin'] },
  { key: 'approvals', label: 'Approvals', roleAccess: ['super-admin', 'admin', 'user'] },
  { key: 'candidates', label: 'Candidate database', roleAccess: ['super-admin', 'admin'] },
  { key: 'evaluation', label: 'Evaluations', roleAccess: ['super-admin', 'admin'] },
  { key: 'interviews', label: 'Interviews', roleAccess: ['super-admin', 'admin', 'user'] },
  { key: 'stats', label: 'Analytics', roleAccess: ['super-admin', 'admin'] },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'] }
];
