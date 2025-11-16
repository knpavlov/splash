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
  | 'accounts'
  | 'participants'
  | 'capacity-heatmap'
  | 'financial-tree'
  | 'financials'
  | 'kpis';

export type NavigationGroupKey = 'old' | 'program' | 'dashboards' | 'settings';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
  roleAccess: AccountRole[];
  group?: NavigationGroupKey;
  disabled?: boolean;
}

export const navigationGroups: { id: NavigationGroupKey; label: string; collapsed?: boolean }[] = [
  { id: 'old', label: 'Old', collapsed: true },
  { id: 'program', label: 'Program setup', collapsed: false },
  { id: 'dashboards', label: 'Dashboards', collapsed: false },
  { id: 'settings', label: 'Settings', collapsed: false }
];

export const navigationItems: NavigationItem[] = [
  { key: 'cases', label: 'Case library', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'case-criteria', label: 'Case criteria', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'questions', label: 'Fit questions', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'candidates', label: 'Candidate database', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'stats', label: 'Analytics', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'evaluation', label: 'Evaluations', roleAccess: ['super-admin', 'admin'], group: 'old' },
  { key: 'workstreams', label: 'Workstreams', roleAccess: ['super-admin', 'admin'], group: 'program' },
  { key: 'participants', label: 'Participants', roleAccess: ['super-admin', 'admin'], group: 'program' },
  { key: 'financials', label: 'Financials', roleAccess: ['super-admin', 'admin'], group: 'program' },
  { key: 'kpis', label: 'KPIs', roleAccess: ['super-admin', 'admin'], group: 'program', disabled: true },
  { key: 'initiatives', label: 'Initiatives', roleAccess: ['super-admin', 'admin'] },
  { key: 'approvals', label: 'Approvals', roleAccess: ['super-admin', 'admin', 'user'] },
  { key: 'interviews', label: 'Interviews', roleAccess: ['super-admin', 'admin', 'user'], group: 'old' },
  { key: 'capacity-heatmap', label: 'Capacity heatmap', roleAccess: ['super-admin', 'admin'], group: 'dashboards' },
  { key: 'financial-tree', label: 'P&L tree', roleAccess: ['super-admin', 'admin'], group: 'dashboards' },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'], group: 'settings' }
];
