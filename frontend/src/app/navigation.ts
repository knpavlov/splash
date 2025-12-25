import { AccountRole } from '../shared/types/account';
import {
  Activity,
  Users,
  Workflow,
  DollarSign,
  Target,
  Layers,
  CheckSquare,
  LayoutDashboard,
  TrendingUp,
  Map,
  Clock,
  Grid,
  Network,
  ShieldAlert,
  UserCog,
  Settings,
  Camera,
  FileText,
  History,
  Anchor,
  LucideIcon
} from 'lucide-react';

export type NavigationKey =
  | 'activity'
  | 'workstreams'
  | 'initiatives'
  | 'approvals'
  | 'participants'
  | 'accounts'
  | 'stage-gate-dashboard'
  | 'capacity-heatmap'
  | 'deadline-dashboard'
  | 'task-status-history'
  | 'financial-tree'
  | 'portfolio-plan'
  | 'financial-dynamics'
  | 'iceberg-dashboard'
  | 'risk-dashboard'
  | 'financials'
  | 'kpis'
  | 'general-settings'
  | 'snapshot-settings'
  | 'initiative-logs'
  | 'taiga'
  | 'laika'
  | 'laiten';

export type NavigationGroupKey = 'program' | 'dashboards' | 'settings';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
  shortLabel?: string;
  roleAccess: AccountRole[];
  group?: NavigationGroupKey;
  disabled?: boolean;
  hidden?: boolean;
  icon?: LucideIcon;
}

export const navigationGroups: { id: NavigationGroupKey; label: string; collapsed?: boolean }[] = [
  { id: 'program', label: 'Program setup', collapsed: false },
  { id: 'dashboards', label: 'Dashboards', collapsed: false },
  { id: 'settings', label: 'Settings', collapsed: false }
];

export const navigationItems: NavigationItem[] = [
  { key: 'activity', label: "What's new", shortLabel: 'New', roleAccess: ['super-admin', 'admin', 'user'], icon: Activity },
  { key: 'workstreams', label: 'Workstreams', shortLabel: 'Streams', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Workflow },
  { key: 'participants', label: 'Participants', shortLabel: 'Team', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Users },
  { key: 'financials', label: 'Financials', shortLabel: 'Finance', roleAccess: ['super-admin', 'admin'], group: 'program', icon: DollarSign },
  { key: 'kpis', label: 'KPIs', shortLabel: 'KPIs', roleAccess: ['super-admin', 'admin'], group: 'program', disabled: true, icon: Target },
  { key: 'initiatives', label: 'Initiatives', shortLabel: 'Init.', roleAccess: ['super-admin', 'admin'], icon: Layers },
  { key: 'approvals', label: 'Approvals', shortLabel: 'Approve', roleAccess: ['super-admin', 'admin', 'user'], icon: CheckSquare },
  {
    key: 'stage-gate-dashboard',
    label: 'Stage-gate pipeline',
    shortLabel: 'Pipeline',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: LayoutDashboard
  },
  {
    key: 'financial-dynamics',
    label: 'P&L dynamics',
    shortLabel: 'P&L',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: TrendingUp
  },
  {
    key: 'iceberg-dashboard',
    label: 'Iceberg chart',
    shortLabel: 'Iceberg',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: Anchor
  },
  {
    key: 'portfolio-plan',
    label: 'Portfolio plan',
    shortLabel: 'Plan',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: Map
  },
  { key: 'deadline-dashboard', label: 'Deadline radar', shortLabel: 'Dates', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Clock },
  { key: 'task-status-history', label: 'Task history', shortLabel: 'History', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: History },
  { key: 'capacity-heatmap', label: 'Capacity heatmap', shortLabel: 'Load', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Grid },
  { key: 'financial-tree', label: 'P&L tree', shortLabel: 'Tree', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Network },
  { key: 'risk-dashboard', label: 'Risk matrix', shortLabel: 'Risks', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: ShieldAlert },
  { key: 'accounts', label: 'Account management', shortLabel: 'Accounts', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: UserCog },
  { key: 'general-settings', label: 'General settings', shortLabel: 'Settings', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: Settings },
  {
    key: 'snapshot-settings',
    label: 'Snapshot settings',
    shortLabel: 'Snaps',
    roleAccess: ['super-admin', 'admin'],
    group: 'settings',
    hidden: true,
    icon: Camera
  },
  { key: 'initiative-logs', label: 'Initiative log', shortLabel: 'Logs', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: FileText },
  { key: 'taiga', label: 'Taiga', roleAccess: ['super-admin', 'admin', 'user'], hidden: true },
  { key: 'laika', label: 'Laika', roleAccess: ['super-admin', 'admin', 'user'], hidden: true },
  { key: 'laiten', label: 'Laiten', roleAccess: ['super-admin', 'admin', 'user'], hidden: true }
];
