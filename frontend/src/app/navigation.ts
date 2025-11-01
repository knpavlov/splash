import { AccountRole } from '../shared/types/account';

export type NavigationKey =
  | 'cases'
  | 'case-criteria'
  | 'questions'
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
  { key: 'candidates', label: 'Candidate database', roleAccess: ['super-admin', 'admin'] },
  { key: 'evaluation', label: 'Evaluations', roleAccess: ['super-admin', 'admin'] },
  { key: 'interviews', label: 'Interviews', roleAccess: ['super-admin', 'admin', 'user'] },
  { key: 'stats', label: 'Analytics', roleAccess: ['super-admin', 'admin'] },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'] }
];
