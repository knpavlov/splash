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
  UserCog,
  Settings,
  Camera,
  FileText,
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
  | 'financial-tree'
  | 'portfolio-plan'
  | 'financial-dynamics'
  | 'financials'
  | 'kpis'
  | 'general-settings'
  | 'snapshot-settings'
  | 'initiative-logs'
  | 'taiga';

export type NavigationGroupKey = 'program' | 'dashboards' | 'settings';

export interface NavigationItem {
  key: NavigationKey;
  label: string;
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
  { key: 'activity', label: "What's new", roleAccess: ['super-admin', 'admin', 'user'], icon: Activity },
  { key: 'workstreams', label: 'Workstreams', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Workflow },
  { key: 'participants', label: 'Participants', roleAccess: ['super-admin', 'admin'], group: 'program', icon: Users },
  { key: 'financials', label: 'Financials', roleAccess: ['super-admin', 'admin'], group: 'program', icon: DollarSign },
  { key: 'kpis', label: 'KPIs', roleAccess: ['super-admin', 'admin'], group: 'program', disabled: true, icon: Target },
  { key: 'initiatives', label: 'Initiatives', roleAccess: ['super-admin', 'admin'], icon: Layers },
  { key: 'approvals', label: 'Approvals', roleAccess: ['super-admin', 'admin', 'user'], icon: CheckSquare },
  {
    key: 'stage-gate-dashboard',
    label: 'Stage-gate pipeline',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: LayoutDashboard
  },
  {
    key: 'financial-dynamics',
    label: 'P&L dynamics',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: TrendingUp
  },
  {
    key: 'portfolio-plan',
    label: 'Portfolio plan',
    roleAccess: ['super-admin', 'admin'],
    group: 'dashboards',
    icon: Map
  },
  { key: 'deadline-dashboard', label: 'Deadline radar', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Clock },
  { key: 'capacity-heatmap', label: 'Capacity heatmap', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Grid },
  { key: 'financial-tree', label: 'P&L tree', roleAccess: ['super-admin', 'admin'], group: 'dashboards', icon: Network },
  { key: 'accounts', label: 'Account management', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: UserCog },
  { key: 'general-settings', label: 'General settings', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: Settings },
  {
    key: 'snapshot-settings',
    label: 'Snapshot settings',
    roleAccess: ['super-admin', 'admin'],
    group: 'settings',
    hidden: true,
    icon: Camera
  },
  { key: 'initiative-logs', label: 'Initiative log', roleAccess: ['super-admin', 'admin'], group: 'settings', icon: FileText },
  { key: 'taiga', label: 'Taiga', roleAccess: ['super-admin', 'admin', 'user'], hidden: true }
];

