import { CSSProperties, DragEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../auth/AuthContext';
import { useParticipantsState, usePlanSettingsState } from '../../../../app/state/AppStateContext';
import styles from '../../../../styles/InitiativePlanModule.module.css';
import {
  Initiative,
  InitiativePlanActualsModel,
  InitiativePlanCapacitySegment,
  InitiativePlanAssignee,
  InitiativePlanBaseline,
  InitiativePlanModel,
  InitiativePlanTask
} from '../../../../shared/types/initiative';
import {
  PLAN_SPLIT_MAX,
  PLAN_SPLIT_MIN,
  PLAN_ZOOM_MAX,
  PLAN_ZOOM_MIN,
  PLAN_MAX_INDENT_LEVEL,
  createEmptyPlanTask,
  sanitizePlanModel
} from '../../plan/planModel';
import { addDays, buildTimelineRange, diffInDays, getZoomScale, parseDate } from '../../plan/planTimeline';
import { generateId } from '../../../../shared/ui/generateId';
import { ChevronIcon } from '../../../../components/icons/ChevronIcon';
import { InitiativeResourceLoadModule } from './InitiativeResourceLoadModule';
import { InitiativeStatusReportModule } from './InitiativeStatusReportModule';

interface InitiativePlanModuleProps {
  plan: InitiativePlanModel | InitiativePlanActualsModel;
  initiativeId: string;
  allInitiatives: Initiative[];
  onChange: (next: InitiativePlanModel | InitiativePlanActualsModel) => void;
  readOnly?: boolean;
  focusTaskId?: string | null;
  openFullscreen?: boolean;
  onFocusHandled?: () => void;
  baselinePlan?: InitiativePlanModel | null;
  variant?: 'plan' | 'actuals';
  title?: string;
  subtitle?: string;
  taskFilter?: (task: InitiativePlanTask) => boolean;
  contextColumn?: ContextColumnConfig;
}

const ROW_HEIGHT = 60;
const PLAN_HEIGHT_MIN = 320;
const PLAN_HEIGHT_MAX = 900;
const PLAN_HEIGHT_DEFAULT = 440;
const RESOURCE_HEIGHT_MIN = 220;
const RESOURCE_HEIGHT_MAX = 720;
const RESOURCE_HEIGHT_DEFAULT = 320;
const FULLSCREEN_RESOURCE_MIN_RATIO = 0.25;
const FULLSCREEN_RESOURCE_MAX_RATIO = 0.7;
const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const TASK_COLOR_PALETTE = ['#5b21b6', '#2563eb', '#0ea5e9', '#10b981', '#f97316', '#ea580c', '#e11d48', '#6d28d9', '#0f172a'];
const DEFAULT_BAR_COLOR = TASK_COLOR_PALETTE[0];
const DEFAULT_MILESTONE_OPTIONS = ['Standard', 'Value Step', 'Change Management'];
const VALUE_STEP_LABEL = 'Value Step';
type TableColumnId =
  | 'drag'
  | 'archive'
  | 'name'
  | 'milestoneType'
  | 'description'
  | 'planStart'
  | 'start'
  | 'planEnd'
  | 'end'
  | 'responsible'
  | 'progress'
  | 'capacity'
  | 'context';

interface TableColumnConfig {
  id: TableColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  resizable: boolean;
}

interface ContextColumnConfig {
  label: string;
  value: (task: InitiativePlanTask) => string;
}

const PLAN_COLUMNS: TableColumnConfig[] = [
  { id: 'drag', label: '', defaultWidth: 36, minWidth: 36, maxWidth: 36, resizable: false },
  { id: 'name', label: 'Task name', defaultWidth: 220, minWidth: 60, maxWidth: 480, resizable: true },
  { id: 'milestoneType', label: 'Milestone type', defaultWidth: 170, minWidth: 120, maxWidth: 260, resizable: true },
  { id: 'description', label: 'Description', defaultWidth: 240, minWidth: 70, maxWidth: 520, resizable: true },
  { id: 'start', label: 'Start', defaultWidth: 150, minWidth: 50, maxWidth: 260, resizable: true },
  { id: 'end', label: 'End', defaultWidth: 150, minWidth: 50, maxWidth: 260, resizable: true },
  { id: 'responsible', label: 'Responsible', defaultWidth: 200, minWidth: 70, maxWidth: 320, resizable: true },
  { id: 'progress', label: 'Status %', defaultWidth: 140, minWidth: 45, maxWidth: 220, resizable: true },
  { id: 'capacity', label: 'Required capacity', defaultWidth: 180, minWidth: 60, maxWidth: 280, resizable: true }
] as const;

const ACTUALS_COLUMNS: TableColumnConfig[] = [
  { id: 'drag', label: '', defaultWidth: 32, minWidth: 32, maxWidth: 32, resizable: false },
  { id: 'archive', label: '', defaultWidth: 46, minWidth: 40, maxWidth: 60, resizable: false },
  { id: 'name', label: 'Task name', defaultWidth: 220, minWidth: 60, maxWidth: 480, resizable: true },
  { id: 'milestoneType', label: 'Milestone type', defaultWidth: 160, minWidth: 120, maxWidth: 260, resizable: true },
  { id: 'description', label: 'Description', defaultWidth: 240, minWidth: 70, maxWidth: 520, resizable: true },
  { id: 'planStart', label: 'Plan start', defaultWidth: 130, minWidth: 70, maxWidth: 200, resizable: true },
  { id: 'start', label: 'Actual start', defaultWidth: 150, minWidth: 70, maxWidth: 260, resizable: true },
  { id: 'planEnd', label: 'Plan end', defaultWidth: 130, minWidth: 70, maxWidth: 200, resizable: true },
  { id: 'end', label: 'Actual end', defaultWidth: 150, minWidth: 70, maxWidth: 260, resizable: true },
  { id: 'responsible', label: 'Responsible', defaultWidth: 200, minWidth: 70, maxWidth: 320, resizable: true },
  { id: 'progress', label: 'Status %', defaultWidth: 140, minWidth: 45, maxWidth: 220, resizable: true },
  { id: 'capacity', label: 'Required capacity', defaultWidth: 180, minWidth: 60, maxWidth: 280, resizable: true }
] as const;

const buildDefaultColumnWidths = (columns: TableColumnConfig[]) =>
  columns.reduce<Record<TableColumnId, number>>((acc, column) => {
    acc[column.id] = column.defaultWidth;
    return acc;
  }, {} as Record<TableColumnId, number>);

const buildColumnMap = (columns: TableColumnConfig[]) =>
  columns.reduce<Record<TableColumnId, TableColumnConfig>>((acc, column) => {
    acc[column.id] = column;
    return acc;
  }, {} as Record<TableColumnId, TableColumnConfig>);

const DEFAULT_COLUMN_ORDER_PLAN = PLAN_COLUMNS.map((column) => column.id);
const DEFAULT_COLUMN_ORDER_ACTUALS = ACTUALS_COLUMNS.map((column) => column.id);

const COLUMN_STORAGE_NAMESPACE = {
  plan: 'initiative-plan:columns',
  actuals: 'initiative-plan-actuals:columns'
} as const;

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface CapacityEditorState {
  taskId: string;
  assigneeId: string | null;
}

interface DependencyDraftState {
  fromId: string;
  anchor: 'left' | 'right';
  start: { x: number; y: number };
  current: { x: number; y: number };
  pointerClient: { x: number; y: number };
}

interface DependencyLine {
  from: string;
  to: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface ContextMenuState {
  taskId: string;
  x: number;
  y: number;
}

type ContextMenuAction =
  | 'edit'
  | 'add-above'
  | 'add-below'
  | 'add-milestone'
  | 'add-subtask'
  | 'add-successor'
  | 'add-predecessor'
  | 'convert-milestone'
  | 'split'
  | 'indent'
  | 'outdent'
  | 'delete'
  | 'add-link'
  | 'remove-links';

const isBaselineEmpty = (baseline: InitiativePlanBaseline | null | undefined) => {
  if (!baseline) {
    return true;
  }
  const normalizedMilestone = baseline.milestoneType?.trim().toLowerCase() ?? '';
  const hasMeaningfulMilestone = normalizedMilestone && normalizedMilestone !== 'standard';
  return (
    !(baseline.name && baseline.name.trim()) &&
    !(baseline.description && baseline.description.trim()) &&
    !baseline.startDate &&
    !baseline.endDate &&
    !(baseline.responsible && baseline.responsible.trim()) &&
    !hasMeaningfulMilestone &&
    (baseline.requiredCapacity === null || baseline.requiredCapacity === undefined)
  );
};

const resolveAssignees = (task: InitiativePlanTask): InitiativePlanAssignee[] => {
  if (task.assignees && task.assignees.length) {
    return task.assignees.map((assignee) => ({
      ...assignee,
      capacitySegments: assignee.capacitySegments ?? []
    }));
  }
  return [
    {
      id: `${task.id}-primary`,
      name: task.responsible,
      capacityMode: task.capacityMode,
      requiredCapacity: task.capacityMode === 'fixed' ? task.requiredCapacity : null,
      capacitySegments: task.capacityMode === 'variable' ? task.capacitySegments : []
    }
  ];
};

const syncPrimaryAssignee = (task: InitiativePlanTask, assignees: InitiativePlanAssignee[]) => {
  const resolved = assignees.length ? assignees : resolveAssignees(task);
  const [primary] = resolved;
  const primarySegments = primary?.capacityMode === 'variable' ? [...(primary.capacitySegments ?? [])] : [];
  return {
    ...task,
    assignees: resolved,
    responsible: primary?.name ?? task.responsible,
    capacityMode: primary?.capacityMode ?? task.capacityMode,
    requiredCapacity: primary?.capacityMode === 'fixed' ? primary?.requiredCapacity ?? null : null,
    capacitySegments: primary?.capacityMode === 'variable' ? primarySegments : []
  };
};

type RowKind = 'task' | 'assignee';

interface VisibleRow {
  kind: RowKind;
  key: string;
  task: InitiativePlanTask;
  assignee: InitiativePlanAssignee;
}

export const InitiativePlanModule = ({
  plan,
  initiativeId,
  allInitiatives,
  onChange,
  readOnly = false,
  focusTaskId = null,
  openFullscreen = false,
  onFocusHandled,
  baselinePlan = null,
  variant = 'plan',
  title,
  subtitle,
  taskFilter,
  contextColumn
}: InitiativePlanModuleProps) => {
  const { list: participants } = useParticipantsState();
  const { milestoneTypes, statusReportSettings } = usePlanSettingsState();
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan as InitiativePlanModel), [plan]);
  const baselinePlanNormalized = useMemo(
    () => (baselinePlan ? sanitizePlanModel(baselinePlan) : null),
    [baselinePlan]
  );
  const { session } = useAuth();
  const isActuals = variant === 'actuals';
  const baseColumns = useMemo(() => {
    const columns = isActuals ? [...ACTUALS_COLUMNS] : [...PLAN_COLUMNS];
    if (contextColumn) {
      columns.splice(1, 0, {
        id: 'context',
        label: contextColumn.label,
        defaultWidth: 200,
        minWidth: 140,
        maxWidth: 320,
        resizable: true
      });
    }
    return columns;
  }, [contextColumn, isActuals]);
  const baseColumnMap = useMemo(() => buildColumnMap(baseColumns), [baseColumns]);
  const defaultColumnOrder = useMemo(() => baseColumns.map((column) => column.id), [baseColumns]);
  const resolvedTitle = title ?? (isActuals ? 'Implementation plan - actuals' : 'Implementation plan');
  const resolvedSubtitle =
    subtitle ??
    (isActuals
      ? 'Capture actual delivery, compare against the baseline plan, and visualise variance.'
      : 'Build a detailed execution plan with a live Gantt chart.');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(
    () => (normalizedPlan.tasks[0]?.id ? [normalizedPlan.tasks[0].id] : [])
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [resourceCollapsed, setResourceCollapsed] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [capacityEditor, setCapacityEditor] = useState<CapacityEditorState | null>(null);
  const isCapacityEditorActive = capacityEditor !== null;
  const [showCapacityOverlay, setShowCapacityOverlay] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<TableColumnId, number>>(() =>
    buildDefaultColumnWidths(baseColumns)
  );
  const [columnPrefsLoaded, setColumnPrefsLoaded] = useState(false);
  const [columnOrder, setColumnOrder] = useState<TableColumnId[]>(defaultColumnOrder);
  const [descriptionTooltip, setDescriptionTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [planHeight, setPlanHeight] = useState(PLAN_HEIGHT_DEFAULT);
  const [planHeightLoaded, setPlanHeightLoaded] = useState(false);
  const [resourceHeight, setResourceHeight] = useState(RESOURCE_HEIGHT_DEFAULT);
  const [resourceHeightLoaded, setResourceHeightLoaded] = useState(false);
  const [fullscreenResourceRatio, setFullscreenResourceRatio] = useState(0.4);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [timelineTooltip, setTimelineTooltip] = useState<{
    taskId: string;
    name: string;
    startLabel: string;
    endLabel: string;
    duration: number | null;
    progress: number;
    x: number;
    y: number;
  } | null>(null);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, string>>({});
  const [changeTooltip, setChangeTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const selectedTaskId = selectedTaskIds[0] ?? null;
  const selectedTaskIdsSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const [showBaselines, setShowBaselines] = useState(true);
  const [showArchived, setShowArchived] = useState(true);
  const [showDueSoonOnly, setShowDueSoonOnly] = useState(false);
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [dragColumnId, setDragColumnId] = useState<TableColumnId | null>(null);
  const setSelectedTaskId = useCallback((taskId: string | null) => {
    setSelectedTaskIds(taskId ? [taskId] : []);
  }, []);

  const handleTaskSelect = useCallback(
    (taskId: string, event?: React.MouseEvent | React.PointerEvent) => {
      const isToggle = !!event && (event.metaKey || event.ctrlKey);
      setSelectedTaskIds((prev) => {
        if (isToggle) {
          if (prev.includes(taskId)) {
            const next = prev.filter((id) => id !== taskId);
            return next.length ? next : [taskId];
          }
          return [...prev, taskId];
        }
        if (prev.length === 1 && prev[0] === taskId) {
          return prev;
        }
        return [taskId];
      });
    },
    []
  );

  const dragStateRef = useRef<{
    taskIds: string[];
    mode: DragMode;
    startX: number;
    pxPerDay: number;
    taskSnapshots: Record<
      string,
      {
        startDate: string;
        endDate: string;
        capacitySegments: InitiativePlanCapacitySegment[];
      }
    >;
    baseTasks: InitiativePlanTask[];
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const tableRowsRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineCanvasRef = useRef<HTMLDivElement>(null);
  const resourceScrollRef = useRef<HTMLDivElement>(null);
  const resourceNamesRef = useRef<HTMLDivElement>(null);
  const fullscreenStackRef = useRef<HTMLDivElement>(null);
  const focusRequestRef = useRef<string | null>(null);
  const scrollSyncSourceRef = useRef<'table' | 'timeline' | null>(null);
  const horizontalSyncSourceRef = useRef<'plan' | 'resource' | null>(null);
  const resourceVerticalSyncSourceRef = useRef<'names' | 'timeline' | null>(null);
  const timelinePanStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const barRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dependencyDraft, setDependencyDraft] = useState<DependencyDraftState | null>(null);
  const dependencyLinesRef = useRef<DependencyLine[]>([]);
  const [dependencyLines, setDependencyLines] = useState<DependencyLine[]>([]);
  const dependencyMeasureFrame = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<'add' | 'color' | null>(null);
  const resizeStateRef = useRef<{
    columnId: TableColumnId;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);
  const resourceHeightDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const fullscreenSplitDragRef = useRef<{ startY: number; height: number; ratio: number } | null>(null);
  const focusHandledRef = useRef<string | null>(null);

  const userKey = session?.accountId ?? 'guest';
  const columnNamespace = isActuals ? COLUMN_STORAGE_NAMESPACE.actuals : COLUMN_STORAGE_NAMESPACE.plan;
  const columnStorageKey = useMemo(() => `${columnNamespace}:${userKey}`, [columnNamespace, userKey]);
  const heightStorageKey = useMemo(() => `${columnNamespace}:height:${userKey}`, [columnNamespace, userKey]);
  const resourceHeightStorageKey = useMemo(
    () => `${columnNamespace}:resource-height:${userKey}`,
    [columnNamespace, userKey]
  );
  const columnOrderStorageKey = useMemo(() => `${columnNamespace}:order:${userKey}`, [columnNamespace, userKey]);

  useEffect(() => {
    setColumnPrefsLoaded(false);
    if (typeof window === 'undefined') {
      setColumnPrefsLoaded(true);
      return;
    }
    const defaults = buildDefaultColumnWidths(baseColumns);
    const raw = window.localStorage.getItem(columnStorageKey);
    if (!raw) {
      setColumnWidths(defaults);
      setColumnPrefsLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Record<TableColumnId, number>> | null;
      const sanitized = { ...defaults };
      if (parsed) {
        for (const column of baseColumns) {
          const value = parsed[column.id];
          if (typeof value === 'number' && Number.isFinite(value)) {
            sanitized[column.id] = clamp(value, column.minWidth, column.maxWidth);
          }
        }
      }
      setColumnWidths(sanitized);
    } catch {
      setColumnWidths(defaults);
    } finally {
      setColumnPrefsLoaded(true);
    }
  }, [baseColumns, columnStorageKey]);

  useEffect(() => {
    if (!columnPrefsLoaded || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnWidths));
  }, [columnPrefsLoaded, columnStorageKey, columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem(columnOrderStorageKey);
    if (!raw) {
      setColumnOrder(defaultColumnOrder);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as TableColumnId[];
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((id): id is TableColumnId => Boolean(baseColumnMap[id]));
        const seen = new Set<TableColumnId>(filtered);
        const merged = [...filtered, ...defaultColumnOrder.filter((id) => !seen.has(id))];
        setColumnOrder(merged);
      }
    } catch {
      setColumnOrder(defaultColumnOrder);
    }
  }, [baseColumnMap, columnOrderStorageKey, defaultColumnOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder));
  }, [columnOrder, columnOrderStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setPlanHeightLoaded(true);
      return;
    }
    const raw = window.localStorage.getItem(heightStorageKey);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        setPlanHeight(clamp(parsed, PLAN_HEIGHT_MIN, PLAN_HEIGHT_MAX));
      }
    }
    setPlanHeightLoaded(true);
  }, [heightStorageKey]);

  useEffect(() => {
    if (!planHeightLoaded || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(heightStorageKey, String(planHeight));
  }, [planHeightLoaded, heightStorageKey, planHeight]);

  useEffect(() => {
    setResourceHeightLoaded(false);
    if (typeof window === 'undefined') {
      setResourceHeightLoaded(true);
      return;
    }
    const raw = window.localStorage.getItem(resourceHeightStorageKey);
    if (!raw) {
      setResourceHeight(RESOURCE_HEIGHT_DEFAULT);
      setResourceHeightLoaded(true);
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      setResourceHeight(RESOURCE_HEIGHT_DEFAULT);
      setResourceHeightLoaded(true);
      return;
    }
    setResourceHeight(clamp(numeric, RESOURCE_HEIGHT_MIN, RESOURCE_HEIGHT_MAX));
    setResourceHeightLoaded(true);
  }, [resourceHeightStorageKey]);

  useEffect(() => {
    if (!resourceHeightLoaded || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(resourceHeightStorageKey, String(resourceHeight));
  }, [resourceHeightLoaded, resourceHeightStorageKey, resourceHeight]);

  const pxPerDay = useMemo(() => getZoomScale(normalizedPlan.settings.zoomLevel), [normalizedPlan.settings.zoomLevel]);

  const upcomingWindow = statusReportSettings.upcomingWindowDays || 14;

  const isTaskDueSoon = useCallback(
    (task: InitiativePlanTask) => {
      const endDate = task.endDate ?? task.baseline?.endDate ?? null;
      const parsed = parseDate(endDate);
      if (!parsed) {
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return diffInDays(today, parsed) <= upcomingWindow;
    },
    [upcomingWindow]
  );

  const workingTasks = useMemo(() => {
    let tasks = isActuals && !showArchived ? normalizedPlan.tasks.filter((task) => !task.archived) : normalizedPlan.tasks;
    if (isActuals && showDueSoonOnly) {
      tasks = tasks.filter((task) => isTaskDueSoon(task));
    }
    if (isActuals && showCompletedOnly) {
      tasks = tasks.filter((task) => (task.progress ?? 0) >= 100);
    }
    if (taskFilter) {
      tasks = tasks.filter(taskFilter);
    }
    return tasks;
  }, [isActuals, normalizedPlan.tasks, showArchived, showCompletedOnly, showDueSoonOnly, isTaskDueSoon, taskFilter]);

  const timelineRange = useMemo(() => {
    const rangeTasks =
      isActuals && showBaselines && baselinePlanNormalized
        ? [...workingTasks, ...baselinePlanNormalized.tasks]
        : workingTasks;
    const source = rangeTasks.length ? rangeTasks : workingTasks;
    return buildTimelineRange(source, pxPerDay);
  }, [baselinePlanNormalized, isActuals, pxPerDay, showBaselines, workingTasks]);

  const orderedColumns = useMemo(() => {
    const seen = new Set<TableColumnId>();
    const sequence: TableColumnConfig[] = [];
    columnOrder.forEach((columnId) => {
      if (seen.has(columnId)) {
        return;
      }
      const column = baseColumnMap[columnId];
      if (column) {
        sequence.push(column);
        seen.add(columnId);
      }
    });
    baseColumns.forEach((column) => {
      if (!seen.has(column.id)) {
        sequence.push(column);
      }
    });
    return sequence;
  }, [baseColumnMap, baseColumns, columnOrder]);

  const visibleColumns = useMemo(
    () =>
      orderedColumns.filter((column) => {
        if (!isActuals) {
          return true;
        }
        if (!showBaselines && (column.id === 'planStart' || column.id === 'planEnd')) {
          return false;
        }
        return true;
      }),
    [isActuals, orderedColumns, showBaselines]
  );

  const tableGridTemplate = useMemo(
    () =>
      visibleColumns
        .map((column) => {
          const width = columnWidths[column.id] ?? column.defaultWidth;
          return `${width}px`;
        })
        .join(' '),
    [columnWidths, visibleColumns]
  );

  const selectedTask = useMemo(
    () => normalizedPlan.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [normalizedPlan.tasks, selectedTaskId]
  );
  const participantOptions = useMemo(
    () =>
      participants
        .map((participant) => participant.displayName?.trim())
        .filter((name): name is string => Boolean(name))
        .sort((a, b) => a.localeCompare(b)),
    [participants]
  );
  const participantNameSet = useMemo(() => {
    const set = new Set<string>();
    participantOptions.forEach((name) => set.add(name.toLowerCase()));
    return set;
  }, [participantOptions]);

  const taskHasChildren = useMemo(() => {
    const map = new Map<string, boolean>();
    workingTasks.forEach((task, index) => {
      const next = workingTasks[index + 1];
      map.set(task.id, Boolean(next && next.indent > task.indent));
    });
    return map;
  }, [workingTasks]);

  const visibleTasks = useMemo(() => {
    const hiddenStack: number[] = [];
    const collapsed = collapsedTaskIds;
    const result: InitiativePlanTask[] = [];
    workingTasks.forEach((task) => {
      while (hiddenStack.length && task.indent <= hiddenStack[hiddenStack.length - 1]) {
        hiddenStack.pop();
      }
      if (hiddenStack.length) {
        return;
      }
      result.push(task);
      if (collapsed.has(task.id)) {
        hiddenStack.push(task.indent);
      }
    });
    return result;
  }, [collapsedTaskIds, workingTasks]);

  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    visibleTasks.forEach((task) => {
      const assignees = resolveAssignees(task);
      assignees.forEach((assignee, index) => {
        rows.push({
          kind: index === 0 ? 'task' : 'assignee',
          key: index === 0 ? task.id : `${task.id}:${assignee.id}`,
          task,
          assignee
        });
      });
    });
    return rows;
  }, [visibleTasks]);

  const rowIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    visibleRows.forEach((row, index) => {
      if (row.kind === 'task') {
        map.set(row.task.id, index);
      }
    });
    return map;
  }, [visibleRows]);

  const ensureTaskAncestorsExpanded = useCallback(
    (taskId: string) => {
      const targetIndex = normalizedPlan.tasks.findIndex((task) => task.id === taskId);
      if (targetIndex === -1) {
        return;
      }
      const ancestors: string[] = [];
      let currentIndent = normalizedPlan.tasks[targetIndex].indent;
      for (let index = targetIndex - 1; index >= 0 && currentIndent > 0; index -= 1) {
        const candidate = normalizedPlan.tasks[index];
        if (candidate.indent < currentIndent) {
          ancestors.push(candidate.id);
          currentIndent = candidate.indent;
        }
      }
      if (!ancestors.length) {
        return;
      }
      setCollapsedTaskIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        ancestors.forEach((ancestorId) => {
          if (next.has(ancestorId)) {
            next.delete(ancestorId);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    [normalizedPlan.tasks]
  );

  useEffect(() => {
    setSelectedTaskIds((prev) => {
      if (!visibleTasks.length) {
        return [];
      }
      const visibleSet = new Set(visibleTasks.map((task) => task.id));
      const filtered = prev.filter((id) => visibleSet.has(id));
      if (filtered.length === prev.length) {
        if (!filtered.length) {
          return [visibleTasks[0].id];
        }
        return prev;
      }
      return filtered.length ? filtered : [visibleTasks[0].id];
    });
  }, [visibleTasks]);

  useEffect(() => {
    if (!focusTaskId) {
      focusRequestRef.current = null;
      return;
    }
    const exists = normalizedPlan.tasks.some((task) => task.id === focusTaskId);
    if (!exists) {
      onFocusHandled?.();
      return;
    }
    focusRequestRef.current = focusTaskId;
    setIsCollapsed(false);
    ensureTaskAncestorsExpanded(focusTaskId);
    setSelectedTaskIds([focusTaskId]);
  }, [ensureTaskAncestorsExpanded, focusTaskId, normalizedPlan.tasks, onFocusHandled]);

  useEffect(() => {
    if (openFullscreen) {
      setIsFullscreen(true);
    }
  }, [openFullscreen]);

  useEffect(() => {
    setCollapsedTaskIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((taskId) => {
        const exists = normalizedPlan.tasks.some((task) => task.id === taskId);
        if (exists && taskHasChildren.get(taskId)) {
          next.add(taskId);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [normalizedPlan.tasks, taskHasChildren]);

  const emitChange = useCallback(
    (next: InitiativePlanModel | InitiativePlanActualsModel) => {
      onChange(sanitizePlanModel(next as InitiativePlanModel));
    },
    [onChange]
  );

  const setTasks = useCallback(
    (tasks: InitiativePlanTask[]) => {
      emitChange({
        ...normalizedPlan,
        tasks
      });
    },
    [emitChange, normalizedPlan]
  );

  const updateTask = useCallback(
    (taskId: string, updater: (task: InitiativePlanTask) => InitiativePlanTask) => {
      const tasks = normalizedPlan.tasks.map((task) => (task.id === taskId ? updater(task) : task));
      setTasks(tasks);
    },
    [normalizedPlan.tasks, setTasks]
  );

  const updateTaskAssignees = useCallback(
    (taskId: string, updater: (assignees: InitiativePlanAssignee[]) => InitiativePlanAssignee[]) => {
      updateTask(taskId, (current) => {
        const currentAssignees = resolveAssignees(current);
        let nextAssignees = updater(currentAssignees);
        if (!nextAssignees.length) {
          nextAssignees = currentAssignees;
        }
        const normalized = nextAssignees.map((assignee, index) => ({
          id: assignee.id || `${current.id}-${index}`,
          name: assignee.name ?? '',
          capacityMode: assignee.capacityMode ?? 'fixed',
          requiredCapacity: assignee.capacityMode === 'variable' ? null : assignee.requiredCapacity ?? null,
          capacitySegments: assignee.capacityMode === 'variable' ? assignee.capacitySegments ?? [] : []
        }));
        return syncPrimaryAssignee(current, normalized);
      });
    },
    [updateTask]
  );

  const handleAddAssignee = useCallback(
    (taskId: string) => {
      if (readOnly) {
        return;
      }
      updateTaskAssignees(taskId, (assignees) => [
        ...assignees,
        {
          id: generateId(),
          name: '',
          capacityMode: 'fixed',
          requiredCapacity: 0,
          capacitySegments: []
        }
      ]);
    },
    [readOnly, updateTaskAssignees]
  );

  const handleRemoveAssignee = useCallback(
    (taskId: string, assigneeId: string) => {
      if (readOnly) {
        return;
      }
      updateTaskAssignees(taskId, (assignees) => {
        if (assignees[0]?.id === assigneeId) {
          return assignees;
        }
        return assignees.filter((assignee) => assignee.id !== assigneeId);
      });
    },
    [readOnly, updateTaskAssignees]
  );

  const handleAssigneeNameChange = useCallback(
    (taskId: string, assigneeId: string, name: string) => {
      if (readOnly) {
        return;
      }
      updateTaskAssignees(taskId, (assignees) =>
        assignees.map((assignee, index) => {
          if (assignee.id === assigneeId || (index === 0 && assigneeId === taskId)) {
            return { ...assignee, name };
          }
          return assignee;
        })
      );
    },
    [readOnly, updateTaskAssignees]
  );

  const handleAssigneeCapacityChange = useCallback(
    (taskId: string, assigneeId: string, value: string) => {
      if (readOnly) {
        return;
      }
      updateTaskAssignees(taskId, (assignees) =>
        assignees.map((assignee, index) => {
          if (assignee.id === assigneeId || (index === 0 && assigneeId === taskId)) {
            const numeric = value.trim() ? Math.max(0, Number(value)) : null;
            return {
              ...assignee,
              capacityMode: 'fixed',
              requiredCapacity: numeric,
              capacitySegments: []
            };
          }
          return assignee;
        })
      );
    },
    [readOnly, updateTaskAssignees]
  );

  const buildNewTask = useCallback(
    (anchorTask: InitiativePlanTask | null, overrides: Partial<InitiativePlanTask> = {}) => {
      const baseDate = anchorTask?.startDate ? parseDate(anchorTask.startDate) ?? new Date() : new Date();
      const startDate = formatDateInput(baseDate);
      const endDate = formatDateInput(addDays(baseDate, 7));
      return {
        ...createEmptyPlanTask(),
        name: overrides.name ?? `Activity ${normalizedPlan.tasks.length + 1}`,
        startDate,
        endDate,
        indent: overrides.indent ?? anchorTask?.indent ?? 0,
        ...overrides
      };
    },
    [normalizedPlan.tasks.length]
  );

  const handleAddTask = useCallback(() => {
    if (readOnly) {
      return;
    }
    const newTask = buildNewTask(selectedTask ?? null);
    const tasks = [...normalizedPlan.tasks];
    if (selectedTask) {
      const index = tasks.findIndex((task) => task.id === selectedTask.id);
      tasks.splice(index + 1, 0, newTask);
    } else {
      tasks.push(newTask);
    }
    setTasks(tasks);
    setSelectedTaskId(newTask.id);
  }, [buildNewTask, normalizedPlan.tasks, readOnly, selectedTask, setTasks, setSelectedTaskId]);

  const focusTaskNameInput = useCallback(
    (taskId: string) => {
      const tableRows = tableRowsRef.current;
      if (!tableRows) {
        return;
      }
      const targetIndex = rowIndexByTaskId.get(taskId);
      if (targetIndex === undefined) {
        return;
      }
      const rowTop = targetIndex * ROW_HEIGHT;
      const visibleStart = tableRows.scrollTop;
      const visibleEnd = visibleStart + tableRows.clientHeight;
      if (rowTop < visibleStart || rowTop + ROW_HEIGHT > visibleEnd) {
        tableRows.scrollTo({ top: Math.max(0, rowTop - ROW_HEIGHT), behavior: 'smooth' });
      }
      requestAnimationFrame(() => {
        const input = tableRows.querySelector<HTMLInputElement>(`input[data-task-name-input="${taskId}"]`);
        if (input) {
          input.focus();
          input.select();
        }
      });
    },
    [rowIndexByTaskId]
  );

  const openCapacityEditorForTask = useCallback(
    (taskId: string) => {
      if (readOnly) {
        return;
      }
      const task = normalizedPlan.tasks.find((item) => item.id === taskId);
      if (!task) {
        return;
      }
      if (!task.startDate || !task.endDate) {
        setInfoMessage('Set start and end dates before configuring capacity periods.');
        return;
      }
      const assignees = resolveAssignees(task);
      const primaryAssignee = assignees[0]?.id ?? null;
      setCapacityEditor({ taskId: task.id, assigneeId: primaryAssignee });
    },
    [normalizedPlan.tasks, readOnly, setCapacityEditor, setInfoMessage]
  );

  const handleIndent = useCallback(
    (taskId?: string | null) => {
      const targetId = taskId ?? selectedTaskId;
      if (readOnly || !targetId) {
        return;
      }
      const index = normalizedPlan.tasks.findIndex((task) => task.id === targetId);
      if (index <= 0) {
        setInfoMessage('Indent requires a preceding task.');
        return;
      }
      const currentIndent = normalizedPlan.tasks[index].indent;
      if (currentIndent >= PLAN_MAX_INDENT_LEVEL) {
        setInfoMessage('Task is already at the deepest level.');
        return;
      }
      let parentIndent: number | null = null;
      for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = normalizedPlan.tasks[i];
        if (candidate.indent <= currentIndent) {
          parentIndent = candidate.indent;
          break;
        }
      }
      if (parentIndent === null) {
        setInfoMessage('Indent requires a shallower parent above.');
        return;
      }
      const nextIndent = Math.min(parentIndent + 1, PLAN_MAX_INDENT_LEVEL);
      if (nextIndent <= currentIndent) {
        setInfoMessage('No valid parent to indent under.');
        return;
      }
      updateTask(targetId, (task) => ({
        ...task,
        indent: nextIndent
      }));
    },
    [normalizedPlan.tasks, readOnly, selectedTaskId, updateTask]
  );

  const handleOutdent = useCallback(
    (taskId?: string | null) => {
      const targetId = taskId ?? selectedTaskId;
      if (readOnly || !targetId) {
        return;
      }
      updateTask(targetId, (task) => ({
        ...task,
        indent: Math.max(0, task.indent - 1)
      }));
    },
    [readOnly, selectedTaskId, updateTask]
  );

  const moveTaskBlock = useCallback(
    (sourceId: string, targetId: string | null) => {
      if (sourceId === targetId) {
        return;
      }
      const tasks = [...normalizedPlan.tasks];
      const sourceIndex = tasks.findIndex((task) => task.id === sourceId);
      const targetIndex = targetId ? tasks.findIndex((task) => task.id === targetId) : tasks.length;
      if (sourceIndex === -1 || targetIndex === -1) {
        return;
      }
      const sourceIndent = tasks[sourceIndex].indent;
      let blockEnd = sourceIndex + 1;
      while (blockEnd < tasks.length && tasks[blockEnd].indent > sourceIndent) {
        blockEnd += 1;
      }
      if (targetIndex >= sourceIndex && targetIndex < blockEnd) {
        return;
      }
      const block = tasks.slice(sourceIndex, blockEnd);
      const remaining = [...tasks.slice(0, sourceIndex), ...tasks.slice(blockEnd)];
      let insertIndex = targetIndex;
      if (targetIndex > sourceIndex) {
        insertIndex -= block.length;
      }
      if (insertIndex < 0) {
        insertIndex = 0;
      }
      if (insertIndex > remaining.length) {
        insertIndex = remaining.length;
      }
      remaining.splice(insertIndex, 0, ...block);
      setTasks(remaining);
    },
    [normalizedPlan.tasks, setTasks]
  );

  const handleZoom = useCallback(
    (delta: number) => {
      if (readOnly) {
        return;
      }
      const nextZoom = clamp(normalizedPlan.settings.zoomLevel + delta, PLAN_ZOOM_MIN, PLAN_ZOOM_MAX);
      emitChange({
        ...normalizedPlan,
        settings: {
          ...normalizedPlan.settings,
          zoomLevel: nextZoom
        }
      });
    },
    [emitChange, normalizedPlan, readOnly]
  );

  const startColumnResize = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>, columnId: TableColumnId) => {
      if (readOnly || isCapacityEditorActive) {
        return;
      }
      const column = baseColumnMap[columnId];
      if (!column || !column.resizable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startWidth = columnWidths[columnId] ?? column.defaultWidth;
      const startX = event.clientX;
      resizeStateRef.current = {
        columnId,
        startX,
        startWidth,
        minWidth: column.minWidth,
        maxWidth: column.maxWidth
      };
      const handleMove = (moveEvent: PointerEvent) => {
        const state = resizeStateRef.current;
        if (!state) {
          return;
        }
        const delta = moveEvent.clientX - state.startX;
        const nextWidth = clamp(state.startWidth + delta, state.minWidth, state.maxWidth);
        setColumnWidths((prev) => {
          if (prev[state.columnId] === nextWidth) {
            return prev;
          }
          return {
            ...prev,
            [state.columnId]: nextWidth
          };
        });
      };
      const handleUp = () => {
        resizeStateRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [baseColumnMap, columnWidths, isCapacityEditorActive, readOnly]
  );

  const startHeightResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!planHeightLoaded || isCapacityEditorActive) {
        return;
      }
      event.preventDefault();
      hideDescriptionTooltip();
      const startY = event.clientY;
      const startHeight = planHeight;
      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientY - startY;
        setPlanHeight(clamp(startHeight + delta, PLAN_HEIGHT_MIN, PLAN_HEIGHT_MAX));
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [isCapacityEditorActive, planHeight, planHeightLoaded]
  );

  const startResourceHeightResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isFullscreen || resourceCollapsed || !resourceHeightLoaded || isCapacityEditorActive) {
        return;
      }
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = resourceHeight;
      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientY - startY;
        setResourceHeight(clamp(startHeight + delta, RESOURCE_HEIGHT_MIN, RESOURCE_HEIGHT_MAX));
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [isCapacityEditorActive, isFullscreen, resourceCollapsed, resourceHeight, resourceHeightLoaded]
  );

  const startFullscreenSplitDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isFullscreen || resourceCollapsed || isCapacityEditorActive) {
        return;
      }
      const stack = fullscreenStackRef.current;
      if (!stack) {
        return;
      }
      event.preventDefault();
      const rect = stack.getBoundingClientRect();
      fullscreenSplitDragRef.current = {
        startY: event.clientY,
        height: rect.height,
        ratio: fullscreenResourceRatio
      };
      const handleMove = (moveEvent: PointerEvent) => {
        const state = fullscreenSplitDragRef.current;
        if (!state) {
          return;
        }
        const delta = moveEvent.clientY - state.startY;
        const nextRatio = clamp(
          state.ratio - delta / Math.max(state.height, 1),
          FULLSCREEN_RESOURCE_MIN_RATIO,
          FULLSCREEN_RESOURCE_MAX_RATIO
        );
        setFullscreenResourceRatio(nextRatio);
      };
      const handleUp = () => {
        fullscreenSplitDragRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [fullscreenResourceRatio, isCapacityEditorActive, isFullscreen, resourceCollapsed]
  );

  const hideDescriptionTooltip = useCallback(() => {
    setDescriptionTooltip(null);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (resourceCollapsed) {
      return;
    }
    const timelineScroll = timelineScrollRef.current;
    const resourceScroll = resourceScrollRef.current;
    if (!timelineScroll || !resourceScroll) {
      return;
    }
    let animationFrame: number | null = null;
    const resetSyncFlag = () => {
      horizontalSyncSourceRef.current = null;
    };
    const scheduleReset = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        resetSyncFlag();
        animationFrame = null;
      });
    };
    const handleTimelineScroll = () => {
      if (horizontalSyncSourceRef.current === 'resource') {
        resetSyncFlag();
        return;
      }
      horizontalSyncSourceRef.current = 'plan';
      resourceScroll.scrollLeft = timelineScroll.scrollLeft;
      scheduleReset();
    };
    const handleResourceScroll = () => {
      if (horizontalSyncSourceRef.current === 'plan') {
        resetSyncFlag();
        return;
      }
      horizontalSyncSourceRef.current = 'resource';
      timelineScroll.scrollLeft = resourceScroll.scrollLeft;
      scheduleReset();
    };
    timelineScroll.addEventListener('scroll', handleTimelineScroll);
    resourceScroll.addEventListener('scroll', handleResourceScroll);
    return () => {
      timelineScroll.removeEventListener('scroll', handleTimelineScroll);
      resourceScroll.removeEventListener('scroll', handleResourceScroll);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isFullscreen, resourceCollapsed]);

  useEffect(() => {
    const tableRows = tableRowsRef.current;
    const timelineScroll = timelineScrollRef.current;
    if (!tableRows || !timelineScroll) {
      return;
    }

    let animationFrame: number | null = null;
    const resetSyncFlag = () => {
      scrollSyncSourceRef.current = null;
    };
    const scheduleFlagReset = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        resetSyncFlag();
        animationFrame = null;
      });
    };

    const handleTableScroll = () => {
      if (scrollSyncSourceRef.current === 'timeline') {
        resetSyncFlag();
        return;
      }
      scrollSyncSourceRef.current = 'table';
      timelineScroll.scrollTop = tableRows.scrollTop;
      scheduleFlagReset();
    };

    const handleTimelineScroll = () => {
      if (scrollSyncSourceRef.current === 'table') {
        resetSyncFlag();
        return;
      }
      scrollSyncSourceRef.current = 'timeline';
      tableRows.scrollTop = timelineScroll.scrollTop;
      scheduleFlagReset();
    };

    tableRows.addEventListener('scroll', handleTableScroll);
    timelineScroll.addEventListener('scroll', handleTimelineScroll);
    return () => {
      tableRows.removeEventListener('scroll', handleTableScroll);
      timelineScroll.removeEventListener('scroll', handleTimelineScroll);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (resourceCollapsed) {
      return;
    }
    const namesScroll = resourceNamesRef.current;
    const timelineScroll = resourceScrollRef.current;
    if (!namesScroll || !timelineScroll) {
      return;
    }
    let animationFrame: number | null = null;
    const resetSync = () => {
      resourceVerticalSyncSourceRef.current = null;
    };
    const scheduleReset = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        resetSync();
        animationFrame = null;
      });
    };
    const handleNamesScroll = () => {
      if (resourceVerticalSyncSourceRef.current === 'timeline') {
        resetSync();
        return;
      }
      resourceVerticalSyncSourceRef.current = 'names';
      timelineScroll.scrollTop = namesScroll.scrollTop;
      scheduleReset();
    };
    const handleTimelineScroll = () => {
      if (resourceVerticalSyncSourceRef.current === 'names') {
        resetSync();
        return;
      }
      resourceVerticalSyncSourceRef.current = 'timeline';
      namesScroll.scrollTop = timelineScroll.scrollTop;
      scheduleReset();
    };
    namesScroll.addEventListener('scroll', handleNamesScroll);
    timelineScroll.addEventListener('scroll', handleTimelineScroll);
    return () => {
      namesScroll.removeEventListener('scroll', handleNamesScroll);
      timelineScroll.removeEventListener('scroll', handleTimelineScroll);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [resourceCollapsed]);

  useEffect(() => {
    const pendingId = focusRequestRef.current;
    if (!pendingId) {
      return;
    }
    const targetIndex = rowIndexByTaskId.get(pendingId);
    const targetTask = visibleTasks.find((task) => task.id === pendingId) ?? null;
    if (targetIndex === undefined || targetIndex === -1 || !targetTask) {
      return;
    }
    const tableRows = tableRowsRef.current;
    if (tableRows) {
      const targetTop = targetIndex * ROW_HEIGHT;
      const offset = Math.max(0, targetTop - tableRows.clientHeight / 2 + ROW_HEIGHT / 2);
      tableRows.scrollTo({ top: offset, behavior: 'smooth' });
    }
    const timelineScroll = timelineScrollRef.current;
    if (timelineScroll && targetTask.startDate && targetTask.endDate) {
      const startDate = parseDate(targetTask.startDate);
      const endDate = parseDate(targetTask.endDate);
      if (startDate && endDate) {
        const startOffset = Math.max(0, diffInDays(timelineRange.start, startDate));
        const rawEndOffset = diffInDays(timelineRange.start, endDate) + 1;
        const endOffset = Math.max(startOffset + 1, rawEndOffset);
        const barLeft = startOffset * pxPerDay;
        const barRight = endOffset * pxPerDay;
        const viewStart = timelineScroll.scrollLeft;
        const viewEnd = viewStart + timelineScroll.clientWidth;
        if (barLeft < viewStart || barRight > viewEnd) {
          const desiredScroll = Math.max(0, barLeft - timelineScroll.clientWidth * 0.2);
          timelineScroll.scrollTo({ left: desiredScroll, behavior: 'smooth' });
        }
      }
    }
    focusRequestRef.current = null;
    onFocusHandled?.();
  }, [onFocusHandled, pxPerDay, rowIndexByTaskId, timelineRange, visibleTasks]);

  const showDescriptionTooltip = useCallback(
    (text: string, target: HTMLElement) => {
      if (!text.trim()) {
        return;
      }
      const rect = target.getBoundingClientRect();
      setDescriptionTooltip({
        text,
        x: rect.left,
        y: rect.bottom + 6
      });
    },
    []
  );

  useEffect(() => {
    if (readOnly) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
          return;
        }
      }
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        handleZoom(1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        handleZoom(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleZoom, readOnly]);

  const handleSplitDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (readOnly || isCapacityEditorActive) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const startX = event.clientX;
      const startRatio = normalizedPlan.settings.splitRatio;
      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextRatio = clamp(startRatio + delta / rect.width, PLAN_SPLIT_MIN, PLAN_SPLIT_MAX);
        emitChange({
          ...normalizedPlan,
          settings: {
            ...normalizedPlan.settings,
            splitRatio: nextRatio
          }
        });
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [emitChange, isCapacityEditorActive, normalizedPlan, readOnly]
  );

  const startBarDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, task: InitiativePlanTask, mode: DragMode) => {
      if (readOnly || !task.startDate || !task.endDate || isCapacityEditorActive) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const selectionForDrag =
        mode === 'move'
          ? selectedTaskIdsSet.has(task.id)
            ? selectedTaskIds
            : [task.id]
          : [task.id];
      if (!selectedTaskIdsSet.has(task.id)) {
        setSelectedTaskId(task.id);
      }
      const snapshots: Record<
        string,
        {
          startDate: string;
          endDate: string;
          capacitySegments: InitiativePlanCapacitySegment[];
        }
      > = {};
      selectionForDrag.forEach((taskId) => {
        const sourceTask = normalizedPlan.tasks.find((item) => item.id === taskId);
        if (sourceTask?.startDate && sourceTask?.endDate) {
          snapshots[taskId] = {
            startDate: sourceTask.startDate,
            endDate: sourceTask.endDate,
            capacitySegments: sourceTask.capacitySegments.map((segment) => ({ ...segment }))
          };
        }
      });
      const applicableTaskIds = mode === 'move' ? Object.keys(snapshots) : [task.id];
      if (!applicableTaskIds.length) {
        return;
      }
      dragStateRef.current = {
        taskIds: applicableTaskIds,
        mode,
        startX: event.clientX,
        pxPerDay,
        taskSnapshots: snapshots,
        baseTasks: normalizedPlan.tasks
      };
      const handleMove = (moveEvent: PointerEvent) => {
        const state = dragStateRef.current;
        if (!state) {
          return;
        }
        const delta = moveEvent.clientX - state.startX;
        if (Math.abs(delta) < 2) {
          return;
        }
        const deltaDays = Math.round(delta / state.pxPerDay);
        if (deltaDays === 0) {
          return;
        }
        if (state.mode === 'move') {
          const updatedTasks = state.baseTasks.map((taskToUpdate) => {
            const snapshot = state.taskSnapshots[taskToUpdate.id];
            if (!snapshot) {
              return taskToUpdate;
            }
            const start = parseDate(snapshot.startDate);
            const end = parseDate(snapshot.endDate);
            if (!start || !end) {
              return taskToUpdate;
            }
            const newStart = formatDateInput(addDays(start, deltaDays));
            const newEnd = formatDateInput(addDays(end, deltaDays));
            const nextSegments = snapshot.capacitySegments.length
              ? snapshot.capacitySegments.map((segment) => {
                  const segmentStart = parseDate(segment.startDate);
                  const segmentEnd = parseDate(segment.endDate);
                  if (!segmentStart || !segmentEnd) {
                    return segment;
                  }
                  return {
                    ...segment,
                    startDate: formatDateInput(addDays(segmentStart, deltaDays)),
                    endDate: formatDateInput(addDays(segmentEnd, deltaDays))
                  };
                })
              : snapshot.capacitySegments;
            return {
              ...taskToUpdate,
              startDate: newStart,
              endDate: newEnd,
              capacitySegments: nextSegments
            };
          });
          setTasks(updatedTasks);
          return;
        }
        const targetId = state.taskIds[0];
        const snapshot = state.taskSnapshots[targetId];
        if (!snapshot) {
          return;
        }
        const start = parseDate(snapshot.startDate)!;
        const end = parseDate(snapshot.endDate)!;
        if (state.mode === 'resize-start') {
          const candidate = addDays(start, deltaDays);
          if (candidate > end) {
            return;
          }
          const updatedTasks = state.baseTasks.map((taskToUpdate) =>
            taskToUpdate.id === targetId ? { ...taskToUpdate, startDate: formatDateInput(candidate) } : taskToUpdate
          );
          setTasks(updatedTasks);
          return;
        }
        const candidate = addDays(end, deltaDays);
        if (candidate < start) {
          return;
        }
        const updatedTasks = state.baseTasks.map((taskToUpdate) =>
          taskToUpdate.id === targetId ? { ...taskToUpdate, endDate: formatDateInput(candidate) } : taskToUpdate
        );
        setTasks(updatedTasks);
      };
      const handleUp = () => {
        dragStateRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [
      normalizedPlan.tasks,
      pxPerDay,
      readOnly,
      selectedTaskIds,
      selectedTaskIdsSet,
      setSelectedTaskId,
      setTasks,
      isCapacityEditorActive
    ]
  );

  const progressMeta = useMemo(() => {
    const result = new Map<string, { value: number; isAuto: boolean }>();
    const tasks = normalizedPlan.tasks;
    const clampProgress = (value: number | null | undefined) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return 0;
      }
      return clamp(Math.round(Number(value)), 0, 100);
    };

    const walk = (startIndex: number): { nextIndex: number; value: number } => {
      const task = tasks[startIndex];
      const baseProgress = clampProgress(task.progress);
      let cursor = startIndex + 1;
      let childSum = 0;
      let childCount = 0;

      while (cursor < tasks.length && tasks[cursor].indent > task.indent) {
        const childIndex = cursor;
        const childTask = tasks[childIndex];
        const childResult = walk(childIndex);
        if (childTask.indent === task.indent + 1) {
          childSum += childResult.value;
          childCount += 1;
        }
        cursor = childResult.nextIndex;
      }

      const hasChildren = childCount > 0;
      const value = hasChildren ? Math.round(childSum / Math.max(childCount, 1)) : baseProgress;
      result.set(task.id, { value, isAuto: hasChildren });
      return { nextIndex: Math.max(cursor, startIndex + 1), value };
    };

    let index = 0;
    while (index < tasks.length) {
      const { nextIndex } = walk(index);
      index = nextIndex;
    }

    return result;
  }, [normalizedPlan.tasks]);

  const autoProgressTaskIds = useMemo(() => {
    const set = new Set<string>();
    progressMeta.forEach((meta, taskId) => {
      if (meta.isAuto) {
        set.add(taskId);
      }
    });
    return set;
  }, [progressMeta]);

  useEffect(() => {
    setProgressDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((taskId) => {
        const exists = normalizedPlan.tasks.some((task) => task.id === taskId);
        if (!exists) {
          delete next[taskId];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [normalizedPlan.tasks]);

  const formatTimelineDate = useCallback((value: string | null) => {
    if (!value) {
      return 'Not scheduled';
    }
    const parsed = parseDate(value);
    if (!parsed) {
      return 'Not scheduled';
    }
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  const formatShortDateLabel = useCallback((value: string | null) => {
    if (!value) {
      return 'Not set';
    }
    const parsed = parseDate(value);
    if (!parsed) {
      return 'Not set';
    }
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  const resolveBaselineForTask = useCallback(
    (task: InitiativePlanTask): InitiativePlanBaseline | null => {
      if (!isActuals) {
        return null;
      }
      if (task.baseline) {
        return task.baseline;
      }
      const targetId = task.sourceTaskId ?? task.id;
      const fallback = baselinePlanNormalized?.tasks.find((candidate) => candidate.id === targetId) ?? null;
      if (!fallback) {
        return null;
      }
      return {
        name: fallback.name,
        description: fallback.description,
        startDate: fallback.startDate,
        endDate: fallback.endDate,
        responsible: fallback.responsible,
        milestoneType: fallback.milestoneType,
        requiredCapacity: fallback.requiredCapacity ?? null
      };
    },
    [baselinePlanNormalized, isActuals]
  );

  const isFieldChanged = useCallback(
    (task: InitiativePlanTask, field: keyof InitiativePlanBaseline) => {
      const baseline = resolveBaselineForTask(task);
      if (!baseline || isBaselineEmpty(baseline)) {
        return false;
      }
      switch (field) {
        case 'startDate':
          return baseline.startDate !== task.startDate;
        case 'endDate':
          return baseline.endDate !== task.endDate;
        case 'name':
          return (baseline.name ?? '') !== (task.name ?? '');
        case 'description':
          return (baseline.description ?? '') !== (task.description ?? '');
        case 'responsible':
          return (baseline.responsible ?? '') !== (task.responsible ?? '');
        case 'milestoneType':
          return (baseline.milestoneType ?? '') !== (task.milestoneType ?? '');
        case 'requiredCapacity':
          return (baseline.requiredCapacity ?? null) !== (task.requiredCapacity ?? null);
        default:
          return false;
      }
    },
    [resolveBaselineForTask]
  );

  const isTaskNew = useCallback(
    (task: InitiativePlanTask) => {
      if (!isActuals) {
        return false;
      }
      const baseline = resolveBaselineForTask(task);
      return !baseline || isBaselineEmpty(baseline);
    },
    [isActuals, resolveBaselineForTask]
  );

  const handleSeedFromPlan = useCallback(() => {
    if (!isActuals || readOnly) {
      return;
    }
    if (!baselinePlanNormalized?.tasks.length) {
      setInfoMessage('Add tasks to the implementation plan before copying to actuals.');
      return;
    }
    if (normalizedPlan.tasks.length) {
      const confirmed = window.confirm('Replace existing actuals with a snapshot of the current plan?');
      if (!confirmed) {
        return;
      }
    }
    const seeded = baselinePlanNormalized.tasks.map((task) => ({
      ...task,
      baseline: {
        name: task.name,
        description: task.description,
        startDate: task.startDate,
        endDate: task.endDate,
        responsible: task.responsible,
        milestoneType: task.milestoneType,
        requiredCapacity: task.requiredCapacity ?? null
      },
      sourceTaskId: task.id,
      archived: false
    }));
    setTasks(seeded);
    setSelectedTaskIds(seeded[0]?.id ? [seeded[0].id] : []);
    setInfoMessage('Actuals snapshot created from the plan.');
  }, [
    baselinePlanNormalized,
    isActuals,
    normalizedPlan.tasks.length,
    readOnly,
    setInfoMessage,
    setSelectedTaskIds,
    setTasks
  ]);

  const showTimelineTooltip = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, task: InitiativePlanTask) => {
      const elementRect = event.currentTarget.getBoundingClientRect();
      const startDate = task.startDate ? parseDate(task.startDate) : null;
      const endDate = task.endDate ? parseDate(task.endDate) : null;
      const duration = startDate && endDate ? diffInDays(startDate, endDate) + 1 : null;
      const progressInfo = progressMeta.get(task.id);
      const progressValue = progressInfo ? progressInfo.value : clamp(task.progress ?? 0, 0, 100);
      setTimelineTooltip({
        taskId: task.id,
        name: task.name || 'Untitled task',
        startLabel: formatTimelineDate(task.startDate),
        endLabel: formatTimelineDate(task.endDate),
        duration,
        progress: progressValue,
        x: elementRect.left + elementRect.width / 2,
        y: elementRect.top - 12
      });
    },
    [formatTimelineDate, progressMeta]
  );

  const hideTimelineTooltip = useCallback(() => {
    setTimelineTooltip(null);
  }, []);

  const showChangeDotTooltip = useCallback((text: string, event: React.MouseEvent | React.PointerEvent) => {
    const offset = 10;
    setChangeTooltip({
      text,
      x: event.clientX + offset,
      y: event.clientY - offset
    });
  }, []);

  const updateChangeDotTooltip = useCallback((event: React.MouseEvent | React.PointerEvent) => {
    setChangeTooltip((prev) => {
      if (!prev) {
        return prev;
      }
      const offset = 10;
      return { ...prev, x: event.clientX + offset, y: event.clientY - offset };
    });
  }, []);

  const hideChangeDotTooltip = useCallback(() => setChangeTooltip(null), []);

  const toggleTaskCollapse = useCallback(
    (taskId: string) => {
      if (!taskHasChildren.get(taskId)) {
        return;
      }
      setCollapsedTaskIds((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
        return next;
      });
    },
    [taskHasChildren]
  );

  const handleColumnDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, columnId: TableColumnId) => {
      if (readOnly || isCapacityEditorActive) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.dataset?.resizer === 'true') {
        event.preventDefault();
        return;
      }
      setDragColumnId(columnId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', columnId);
    },
    [isCapacityEditorActive, readOnly]
  );

  const handleColumnDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, targetId: TableColumnId) => {
      if (!dragColumnId || dragColumnId === targetId) {
        return;
      }
      event.preventDefault();
      setColumnOrder((prev) => {
        const sourceIndex = prev.indexOf(dragColumnId);
        const targetIndex = prev.indexOf(targetId);
        if (sourceIndex === -1 || targetIndex === -1) {
          return prev;
        }
        const next = [...prev];
        next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, dragColumnId);
        return next;
      });
    },
    [dragColumnId]
  );

  const handleColumnDragEnd = useCallback(() => {
    setDragColumnId(null);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      hideDescriptionTooltip();
      hideTimelineTooltip();
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [hideDescriptionTooltip, hideTimelineTooltip]);

  useEffect(() => {
    if (readOnly) {
      return;
    }
    if (!progressMeta.size) {
      return;
    }
    let changed = false;
    const nextTasks = normalizedPlan.tasks.map((task) => {
      const meta = progressMeta.get(task.id);
      if (meta?.isAuto && task.progress !== meta.value) {
        changed = true;
        return {
          ...task,
          progress: meta.value
        };
      }
      return task;
    });
    if (changed) {
      setTasks(nextTasks);
    }
  }, [normalizedPlan.tasks, progressMeta, readOnly, setTasks]);

  const valueStepMetrics = useMemo(() => {
    if (!isActuals) {
      return null;
    }
    const actualValueStep =
      normalizedPlan.tasks.find(
        (task) => (task.milestoneType ?? '').toLowerCase() === VALUE_STEP_LABEL.toLowerCase()
      ) ?? null;
    const baseline = actualValueStep ? resolveBaselineForTask(actualValueStep) : null;
    const plannedEndValue = baseline?.endDate ?? null;
    const actualEndDate = actualValueStep?.endDate ? parseDate(actualValueStep.endDate) : null;
    const plannedEndDate = plannedEndValue ? parseDate(plannedEndValue) : null;
    const daysToValue = actualEndDate ? diffInDays(new Date(), actualEndDate) : null;
    const monthsToValue = daysToValue === null ? null : Math.max(0, Math.round(daysToValue / 30));
    const deviation = actualEndDate && plannedEndDate ? diffInDays(plannedEndDate, actualEndDate) : null;
    return {
      actualEndDate,
      plannedEndDate,
      monthsToValue,
      deviation
    };
  }, [isActuals, normalizedPlan.tasks, resolveBaselineForTask]);

  const handleTaskFieldChange = useCallback(
    (task: InitiativePlanTask, field: keyof InitiativePlanTask, value: string) => {
      if (readOnly) {
        return;
      }
      if (field === 'responsible') {
        const primaryId = resolveAssignees(task)[0]?.id ?? task.id;
        handleAssigneeNameChange(task.id, primaryId, value);
        return;
      }
      if (field === 'requiredCapacity') {
        const primaryId = resolveAssignees(task)[0]?.id ?? task.id;
        handleAssigneeCapacityChange(task.id, primaryId, value);
        return;
      }
      if (field === 'milestoneType') {
        const options = milestoneTypes.length ? milestoneTypes : DEFAULT_MILESTONE_OPTIONS;
        const trimmed = value.trim();
        const normalized =
          options.find((item) => item.toLowerCase() === trimmed.toLowerCase()) ??
          (trimmed || options[0] || 'Standard');
        const isValueStep = normalized.toLowerCase() === VALUE_STEP_LABEL.toLowerCase();
        const fallback =
          options.find((item) => item.toLowerCase() !== VALUE_STEP_LABEL.toLowerCase()) ??
          options[0] ??
          'Standard';
        const updatedTasks = normalizedPlan.tasks.map((current) => {
          if (current.id === task.id) {
            return { ...current, milestoneType: normalized };
          }
          if (isValueStep && (current.milestoneType ?? '').toLowerCase() === VALUE_STEP_LABEL.toLowerCase()) {
            return { ...current, milestoneType: fallback };
          }
          return current;
        });
        if (isValueStep) {
          setInfoMessage('Only one Value Step can be assigned. Previous selection was reset.');
        }
        setTasks(updatedTasks);
        return;
      }
      updateTask(task.id, (current) => {
        if (field === 'startDate' || field === 'endDate') {
          const dateValue = value ? value : null;
          let nextStart = current.startDate;
          let nextEnd = current.endDate;
          if (field === 'startDate') {
            nextStart = dateValue;
            if (nextStart && nextEnd && parseDate(nextStart)! > parseDate(nextEnd)!) {
              nextEnd = nextStart;
            }
          } else {
            nextEnd = dateValue;
            if (nextStart && nextEnd && parseDate(nextEnd)! < parseDate(nextStart)!) {
              nextStart = nextEnd;
            }
          }
          return { ...current, startDate: nextStart, endDate: nextEnd };
        }
        if (field === 'progress') {
          if (autoProgressTaskIds.has(task.id)) {
            return current;
          }
          const numeric = clamp(Number(value) || 0, 0, 100);
          return { ...current, progress: numeric };
        }
        if (field === 'name') {
          return { ...current, name: value };
        }
        if (field === 'description') {
          return { ...current, description: value };
        }
        return { ...current, [field]: value };
      });
    },
    [
      autoProgressTaskIds,
      handleAssigneeCapacityChange,
      handleAssigneeNameChange,
      milestoneTypes,
      normalizedPlan.tasks,
      readOnly,
      setInfoMessage,
      setTasks,
      updateTask
    ]
  );

  const handleCapacityMenu = useCallback(
    (event: React.MouseEvent, task: InitiativePlanTask, assigneeId: string | null = null) => {
      if (readOnly) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!task.startDate || !task.endDate) {
        setInfoMessage('Set start and end dates before configuring capacity periods.');
        return;
      }
      setCapacityEditor({ taskId: task.id, assigneeId });
    },
    [readOnly]
  );

  const applyCapacitySegments = useCallback(
    (taskId: string, assigneeId: string | null, segments: InitiativePlanCapacitySegment[]) => {
      const targetId = assigneeId ?? taskId;
      const capacityMode: InitiativePlanTask['capacityMode'] = segments.length ? 'variable' : 'fixed';
      updateTaskAssignees(taskId, (assignees) =>
        assignees.map((assignee, index) => {
          if (assignee.id === targetId || (index === 0 && targetId === taskId)) {
            return {
              ...assignee,
              capacityMode,
              capacitySegments: capacityMode === 'variable' ? segments : [],
              requiredCapacity: capacityMode === 'variable' ? null : assignee.requiredCapacity ?? 0
            };
          }
          return assignee;
        })
      );
      setCapacityEditor(null);
    },
    [updateTaskAssignees]
  );

  const handleColorChange = useCallback(
    (taskId: string, color: string | null) => {
      updateTask(taskId, (task) => ({
        ...task,
        color
      }));
    },
    [updateTask]
  );

  useEffect(() => {
    if (readOnly) {
      return;
    }
    const timeline = timelineRef.current;
    if (!timeline) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY === 0) {
        return;
      }
      handleZoom(event.deltaY < 0 ? 1 : -1);
    };
    timeline.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      timeline.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoom, readOnly]);

  const handleTimelinePanStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isCapacityEditorActive) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      const scrollEl = timelineScrollRef.current;
      if (!scrollEl) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && target.closest('[data-timeline-interactive="true"]')) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startScrollLeft = scrollEl.scrollLeft;
      const startScrollTop = scrollEl.scrollTop;
      scrollEl.classList.add(styles.timelinePanning);
      timelinePanStateRef.current = {
        startX,
        startY,
        scrollLeft: startScrollLeft,
        scrollTop: startScrollTop
      };
      const handleMove = (moveEvent: PointerEvent) => {
        const state = timelinePanStateRef.current;
        if (!state) {
          return;
        }
        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;
        scrollEl.scrollLeft = state.scrollLeft - dx;
        scrollEl.scrollTop = state.scrollTop - dy;
      };
      const handleUp = () => {
        timelinePanStateRef.current = null;
        scrollEl.classList.remove(styles.timelinePanning);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [isCapacityEditorActive]
  );

  const renderCapacityOverlay = useCallback(
    (task: InitiativePlanTask, assignee?: InitiativePlanAssignee) => {
      if (!showCapacityOverlay || !task.startDate || !task.endDate) {
        return null;
      }
      const taskStart = parseDate(task.startDate);
      const taskEnd = parseDate(task.endDate);
      if (!taskStart || !taskEnd) {
        return null;
      }
      const source = assignee ?? task;
      const totalDays = Math.max(diffInDays(taskStart, taskEnd) + 1, 1);
      if (source.capacityMode === 'variable' && source.capacitySegments.length) {
        return (
          <div className={styles.capacityOverlayTrack} aria-hidden="true">
            {source.capacitySegments.map((segment) => {
              const segmentStart = parseDate(segment.startDate);
              const segmentEnd = parseDate(segment.endDate);
              if (!segmentStart || !segmentEnd) {
                return null;
              }
              const offset = Math.max(diffInDays(taskStart, segmentStart), 0);
              const span = Math.max(diffInDays(segmentStart, segmentEnd) + 1, 1);
              const left = (offset / totalDays) * 100;
              const width = (span / totalDays) * 100;
              return (
                <div
                  key={segment.id}
                  className={styles.capacityOverlaySegment}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <span>{segment.capacity}</span>
                </div>
              );
            })}
          </div>
        );
      }
      if (source.requiredCapacity !== null) {
        return (
          <div className={`${styles.capacityOverlayTrack} ${styles.capacityOverlaySingle}`} aria-hidden="true">
            <div className={styles.capacityOverlaySegment} style={{ left: 0, width: '100%' }}>
              <span>{source.requiredCapacity}</span>
            </div>
          </div>
        );
      }
      return null;
    },
    [showCapacityOverlay]
  );

  const dependencyLinesEqual = (a: DependencyLine[], b: DependencyLine[]) => {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      const left = a[i];
      const right = b[i];
      if (
        left.from !== right.from ||
        left.to !== right.to ||
        left.start.x !== right.start.x ||
        left.start.y !== right.start.y ||
        left.end.x !== right.end.x ||
        left.end.y !== right.end.y
      ) {
        return false;
      }
    }
    return true;
  };

  const measureDependencies = useCallback(() => {
    const canvasEl = timelineCanvasRef.current;
    if (!canvasEl || !timelineScrollRef.current) {
      return;
    }
    const canvasRect = canvasEl.getBoundingClientRect();
    const resolveAnchor = (taskId: string, anchor: 'left' | 'right') => {
      const bar = barRefs.current.get(taskId);
      if (!bar) {
        return null;
      }
      const barRect = bar.getBoundingClientRect();
      const handle = bar.querySelector(
        `.${styles.linkHandle}.${anchor === 'left' ? styles.linkHandleLeft : styles.linkHandleRight}`
      ) as HTMLElement | null;
      const handleRect = handle?.getBoundingClientRect();
      const centerX =
        handleRect && typeof handleRect.left === 'number'
          ? handleRect.left + handleRect.width / 2
          : anchor === 'left'
            ? barRect.left
            : barRect.right;
      const centerY =
        handleRect && typeof handleRect.top === 'number'
          ? handleRect.top + handleRect.height / 2
          : barRect.top + barRect.height / 2;
      return {
        x: centerX - canvasRect.left,
        y: centerY - canvasRect.top
      };
    };
    const nextLines: { from: string; to: string; start: { x: number; y: number }; end: { x: number; y: number } }[] =
      [];
    normalizedPlan.tasks.forEach((task) => {
      const targetBar = barRefs.current.get(task.id);
      if (!targetBar) {
        return;
      }
      const dependencies = task.dependencies ?? [];
      const targetRect = targetBar.getBoundingClientRect();
      dependencies.forEach((fromId) => {
        const sourceAnchor = resolveAnchor(fromId, 'right');
        if (!sourceAnchor) {
          return;
        }
        const targetAnchor = resolveAnchor(task.id, 'left');
        nextLines.push({
          from: fromId,
          to: task.id,
          start: sourceAnchor,
          end: targetAnchor ?? {
            x: targetRect.left - canvasRect.left,
            y: targetRect.top + targetRect.height / 2 - canvasRect.top
          }
        });
      });
    });
    if (dependencyDraft) {
      const anchor = resolveAnchor(dependencyDraft.fromId, dependencyDraft.anchor);
      const current = {
        x: dependencyDraft.pointerClient.x - canvasRect.left,
        y: dependencyDraft.pointerClient.y - canvasRect.top
      };
      setDependencyDraft((prev) =>
        prev
          ? {
              ...prev,
              start: anchor ?? prev.start,
              current
            }
          : prev
      );
    }
    if (!dependencyLinesEqual(nextLines, dependencyLinesRef.current)) {
      dependencyLinesRef.current = nextLines;
      setDependencyLines(nextLines);
    }
  }, [dependencyDraft, dependencyLinesEqual, normalizedPlan.tasks, pxPerDay, visibleRows.length]);

  const scheduleDependencyMeasure = useCallback(() => {
    if (dependencyMeasureFrame.current !== null) {
      cancelAnimationFrame(dependencyMeasureFrame.current);
    }
    dependencyMeasureFrame.current = requestAnimationFrame(() => {
      measureDependencies();
      dependencyMeasureFrame.current = null;
    });
  }, [measureDependencies]);

  useLayoutEffect(() => {
    scheduleDependencyMeasure();
  }, [scheduleDependencyMeasure]);

  useEffect(() => {
    const handle = () => scheduleDependencyMeasure();
    const scrollEl = timelineScrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handle);
    }
    window.addEventListener('resize', handle);
    return () => {
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', handle);
      }
      window.removeEventListener('resize', handle);
      if (dependencyMeasureFrame.current !== null) {
        cancelAnimationFrame(dependencyMeasureFrame.current);
        dependencyMeasureFrame.current = null;
      }
    };
  }, [scheduleDependencyMeasure]);

  const insertTaskRelative = useCallback(
    (
      taskId: string,
      position: 'above' | 'below',
      options: {
        indentOffset?: number;
        forceIndent?: number;
        milestone?: boolean;
        name?: string;
        linkDirection?: 'successor' | 'predecessor' | null;
      } = {}
    ) => {
      if (readOnly) {
        return null;
      }
      const anchorIndex = normalizedPlan.tasks.findIndex((task) => task.id === taskId);
      if (anchorIndex === -1) {
        return null;
      }
      const anchorTask = normalizedPlan.tasks[anchorIndex];
      const indent = options.forceIndent ?? clamp(anchorTask.indent + (options.indentOffset ?? 0), 0, PLAN_MAX_INDENT_LEVEL);
      const anchorStart = anchorTask.startDate ? parseDate(anchorTask.startDate) : null;
      const baseDate = anchorStart ?? new Date();
      const milestoneDate = formatDateInput(baseDate);
      const newTask = buildNewTask(anchorTask, {
        indent,
        name: options.name,
        milestoneType: options.milestone ? anchorTask.milestoneType ?? 'Standard' : undefined,
        startDate: options.milestone ? milestoneDate : undefined,
        endDate: options.milestone ? milestoneDate : undefined
      });
      const tasks = [...normalizedPlan.tasks];
      const insertIndex = position === 'above' ? anchorIndex : anchorIndex + 1;
      tasks.splice(insertIndex, 0, newTask);
      if (options.linkDirection === 'successor') {
        tasks[insertIndex] = {
          ...tasks[insertIndex],
          dependencies: Array.from(new Set([...(tasks[insertIndex].dependencies ?? []), anchorTask.id]))
        };
      } else if (options.linkDirection === 'predecessor') {
        const targetIndex = tasks.findIndex((item) => item.id === anchorTask.id);
        if (targetIndex !== -1) {
          tasks[targetIndex] = {
            ...tasks[targetIndex],
            dependencies: Array.from(new Set([...(tasks[targetIndex].dependencies ?? []), newTask.id]))
          };
        }
      }
      setTasks(tasks);
      setSelectedTaskId(newTask.id);
      scheduleDependencyMeasure();
      return newTask.id;
    },
    [buildNewTask, normalizedPlan.tasks, readOnly, scheduleDependencyMeasure, setSelectedTaskId, setTasks]
  );

  const handleDeleteTaskById = useCallback(
    (taskId: string | null) => {
      if (readOnly || !taskId) {
        return;
      }
      const index = normalizedPlan.tasks.findIndex((task) => task.id === taskId);
      if (index === -1) {
        return;
      }
      const tasks = normalizedPlan.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          dependencies: (task.dependencies ?? []).filter((id) => id !== taskId)
        }));
      setTasks(tasks);
      setSelectedTaskId(tasks[Math.max(0, index - 1)]?.id ?? null);
      scheduleDependencyMeasure();
    },
    [normalizedPlan.tasks, readOnly, scheduleDependencyMeasure, setSelectedTaskId, setTasks]
  );

  const handleDeleteTask = useCallback(() => handleDeleteTaskById(selectedTaskId), [handleDeleteTaskById, selectedTaskId]);

  const finishDependencyDraft = useCallback(
    (targetTaskId: string | null) => {
      setDependencyDraft((prev) => {
        if (!prev) {
          return null;
        }
        if (targetTaskId && targetTaskId !== prev.fromId) {
          updateTask(targetTaskId, (task) => {
            const next = new Set(task.dependencies ?? []);
            next.add(prev.fromId);
            return { ...task, dependencies: Array.from(next) };
          });
        }
        return null;
      });
      scheduleDependencyMeasure();
    },
    [scheduleDependencyMeasure, updateTask]
  );

  const beginDependencyDraft = useCallback(
    (taskId: string, anchor: 'left' | 'right', startPoint?: { x: number; y: number }) => {
      const canvasEl = timelineCanvasRef.current;
      const barEl = barRefs.current.get(taskId);
      if (!canvasEl || !barEl) {
        return;
      }
      const canvasRect = canvasEl.getBoundingClientRect();
      const barRect = barEl.getBoundingClientRect();
      const handle = barEl.querySelector(
        `.${styles.linkHandle}.${anchor === 'left' ? styles.linkHandleLeft : styles.linkHandleRight}`
      ) as HTMLElement | null;
      const handleRect = handle?.getBoundingClientRect();
      const defaultCenter = {
        x:
          (handleRect ? handleRect.left + handleRect.width / 2 : anchor === 'left' ? barRect.left : barRect.right) -
          canvasRect.left,
        y:
          (handleRect ? handleRect.top + handleRect.height / 2 : barRect.top + barRect.height / 2) - canvasRect.top
      };
      const start = startPoint ?? defaultCenter;
      const pointerClient = startPoint
        ? { x: startPoint.x + canvasRect.left, y: startPoint.y + canvasRect.top }
        : {
            x: handleRect ? handleRect.left + handleRect.width / 2 : anchor === 'left' ? barRect.left : barRect.right,
            y: handleRect ? handleRect.top + handleRect.height / 2 : barRect.top + barRect.height / 2
          };
      setDependencyDraft({ fromId: taskId, anchor, start, current: start, pointerClient });
      const handleMove = (moveEvent: PointerEvent) => {
        const activeRect = timelineCanvasRef.current?.getBoundingClientRect() ?? canvasRect;
        const nextPoint = {
          x: moveEvent.clientX - activeRect.left,
          y: moveEvent.clientY - activeRect.top
        };
        setDependencyDraft((prev) =>
          prev
            ? { ...prev, current: nextPoint, pointerClient: { x: moveEvent.clientX, y: moveEvent.clientY } }
            : prev
        );
      };
      const handleUp = (upEvent: PointerEvent) => {
        const target = (upEvent.target as HTMLElement | null)?.closest('[data-dependency-target="true"]') as
          | HTMLElement
          | null;
        const targetTask = target?.getAttribute('data-task-id') ?? null;
        finishDependencyDraft(targetTask);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [finishDependencyDraft]
  );

  const startDependencyDraft = useCallback(
    (event: React.PointerEvent, taskId: string, anchor: 'left' | 'right' = 'right') => {
      event.preventDefault();
      event.stopPropagation();
      const canvasRect = timelineCanvasRef.current?.getBoundingClientRect();
      const targetRect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
      const startPoint =
        canvasRect && targetRect
          ? {
              x: targetRect.left + targetRect.width / 2 - canvasRect.left,
              y: targetRect.top + targetRect.height / 2 - canvasRect.top
            }
          : undefined;
      beginDependencyDraft(taskId, anchor, startPoint);
    },
    [beginDependencyDraft]
  );

  const handleRemoveAllDependencies = useCallback(
    (taskId: string) => {
      const nextTasks = normalizedPlan.tasks.map((task) => {
        if (task.id === taskId) {
          if (!task.dependencies?.length) {
            return task;
          }
          return { ...task, dependencies: [] };
        }
        const filtered = (task.dependencies ?? []).filter((id) => id !== taskId);
        if (filtered.length === (task.dependencies ?? []).length) {
          return task;
        }
        return { ...task, dependencies: filtered };
      });
      setTasks(nextTasks);
      scheduleDependencyMeasure();
    },
    [normalizedPlan.tasks, scheduleDependencyMeasure, setTasks]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setOpenSubmenu(null);
  }, []);

  const handleContextAction = useCallback(
    (taskId: string, action: ContextMenuAction) => {
      switch (action) {
        case 'edit':
          setSelectedTaskId(taskId);
          focusTaskNameInput(taskId);
          break;
        case 'add-above':
          insertTaskRelative(taskId, 'above');
          break;
        case 'add-below':
          insertTaskRelative(taskId, 'below');
          break;
        case 'add-milestone':
          insertTaskRelative(taskId, 'below', { milestone: true, name: 'Milestone' });
          break;
        case 'add-subtask':
          insertTaskRelative(taskId, 'below', { indentOffset: 1 });
          break;
        case 'add-successor':
          insertTaskRelative(taskId, 'below', { linkDirection: 'successor' });
          break;
        case 'add-predecessor':
          insertTaskRelative(taskId, 'above', { linkDirection: 'predecessor' });
          break;
        case 'convert-milestone':
          updateTask(taskId, (task) => {
            const start = task.startDate ? parseDate(task.startDate) : null;
            const end = task.endDate ? parseDate(task.endDate) : null;
            const pivot = start ?? end ?? new Date();
            const pivotString = formatDateInput(pivot);
            return {
              ...task,
              startDate: task.startDate ?? pivotString,
              endDate: pivotString,
              milestoneType: task.milestoneType ?? 'Standard'
            };
          });
          break;
        case 'split':
          openCapacityEditorForTask(taskId);
          break;
        case 'indent':
          handleIndent(taskId);
          break;
        case 'outdent':
          handleOutdent(taskId);
          break;
        case 'delete':
          handleDeleteTaskById(taskId);
          break;
        case 'add-link':
          beginDependencyDraft(taskId, 'right');
          break;
        case 'remove-links':
          handleRemoveAllDependencies(taskId);
          break;
        default:
          break;
      }
      closeContextMenu();
    },
    [
      beginDependencyDraft,
      closeContextMenu,
      focusTaskNameInput,
      handleDeleteTaskById,
      handleIndent,
      handleOutdent,
      handleRemoveAllDependencies,
      insertTaskRelative,
      openCapacityEditorForTask,
      parseDate,
      formatDateInput,
      setSelectedTaskId,
      updateTask
    ]
  );

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDependencyDraft(null);
        closeContextMenu();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeContextMenu]);

  const handleRemoveDependency = useCallback(
    (fromId: string, toId: string) => {
      updateTask(toId, (task) => ({
        ...task,
        dependencies: (task.dependencies ?? []).filter((id) => id !== fromId)
      }));
    },
    [updateTask]
  );

  const infoBanner =
    !isCollapsed && infoMessage ? (
      <div className={styles.infoBanner}>
        <span>{infoMessage}</span>
        <button type="button" onClick={() => setInfoMessage(null)}>
          x
        </button>
      </div>
    ) : null;

  const actualsDashboard = isActuals ? (
    <div className={styles.metricsBar}>
      <div className={styles.metricCard}>
        <span className={styles.metricLabel}>Value step completion</span>
        <strong>
          {valueStepMetrics?.actualEndDate
            ? formatShortDateLabel(valueStepMetrics.actualEndDate.toISOString().slice(0, 10))
            : 'Not set'}
        </strong>
        {valueStepMetrics?.plannedEndDate && (
          <span className={styles.metricSub}>
            Baseline: {formatShortDateLabel(valueStepMetrics.plannedEndDate.toISOString().slice(0, 10))}
          </span>
        )}
      </div>
      <div className={styles.metricCard}>
        <span className={styles.metricLabel}>Months to value</span>
        <strong>{valueStepMetrics?.monthsToValue ?? '�'}</strong>
      </div>
      <div className={styles.metricCard}>
        <span className={styles.metricLabel}>Schedule variance</span>
        <strong
          className={
            valueStepMetrics?.deviation !== null && valueStepMetrics?.deviation !== undefined
              ? valueStepMetrics.deviation <= 0
                ? styles.metricPositive
                : styles.metricNegative
              : undefined
          }
        >
          {valueStepMetrics?.deviation !== null && valueStepMetrics?.deviation !== undefined
            ? `${Math.abs(valueStepMetrics.deviation)}d ${valueStepMetrics.deviation <= 0 ? 'ahead' : 'behind'}`
            : '�'}
        </strong>
      </div>
    </div>
  ) : null;
  const statusReportModule = isActuals ? (
    <InitiativeStatusReportModule
      plan={normalizedPlan}
      initiativeId={initiativeId}
      readOnly={readOnly}
    />
  ) : null;
  let stackedContent: React.ReactNode = null;
  const renderResourceModule = (heightValue: number | null) => (
    <InitiativeResourceLoadModule
      plan={normalizedPlan}
      initiativeId={initiativeId}
      initiatives={allInitiatives}
      timelineRange={timelineRange}
      pxPerDay={pxPerDay}
      scrollRef={resourceScrollRef}
      namesScrollRef={resourceNamesRef}
      splitRatio={normalizedPlan.settings.splitRatio}
      height={heightValue}
      isCollapsed={resourceCollapsed}
      onToggle={() => setResourceCollapsed((prev) => !prev)}
    />
  );

  if (!isCollapsed) {
    const planBodyElement = (
      <div
        className={styles.planBody}
        style={isFullscreen ? { height: '100%' } : { height: `${planHeight}px` }}
      >
        <div
          className={styles.tablePanel}
          style={{ width: `${normalizedPlan.settings.splitRatio * 100}%` }}
        >
          <div
            className={styles.tableScroll}
            onScroll={hideDescriptionTooltip}
            onMouseLeave={hideDescriptionTooltip}
          >
            <div
              className={styles.tableHeader}
              style={{ gridTemplateColumns: tableGridTemplate }}
            >
              {visibleColumns.map((column) => (
                <div
                  key={`header-${column.id}`}
                  className={`${styles.columnHeader} ${
                    dragColumnId === column.id ? styles.columnHeaderDragging : ''
                  }`}
                  draggable={!readOnly}
                  onDragStart={(event) => handleColumnDragStart(event, column.id)}
                  onDragOver={(event) => handleColumnDragOver(event, column.id)}
                  onDrop={(event) => handleColumnDragOver(event, column.id)}
                  onDragEnd={handleColumnDragEnd}
                >
                  {column.label && <span>{column.label}</span>}
                  {column.resizable && (
                    <span
                      className={styles.columnResizer}
                      data-resizer="true"
                      onPointerDown={(event) => startColumnResize(event, column.id)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className={styles.tableRows} ref={tableRowsRef}>
              {visibleRows.map((row) => {
                const task = row.task;
                const assignee = row.assignee;
                const isPrimaryRow = row.kind === 'task';
                const assigneesForTask = resolveAssignees(task);
                const rowDepthClass =
                  task.indent === 0 ? '' : task.indent === 1 ? styles.rowDepth1 : styles.rowDepth2;
                const baseline = resolveBaselineForTask(task);
                const hasCustomResponsible =
                  !!assignee.name &&
                  !participantNameSet.has(assignee.name.trim().toLowerCase());
                const isArchived = Boolean(task.archived);
                const hasChildren = taskHasChildren.get(task.id);
                const isCollapsed = collapsedTaskIds.has(task.id);
                const progressInfo = progressMeta.get(task.id);
                const baseProgressValue = progressInfo ? progressInfo.value : clamp(task.progress ?? 0, 0, 100);
                const isAutoProgress = progressInfo?.isAuto ?? false;
                const draftValue = progressDrafts[task.id];
                const effectiveProgress =
                  draftValue !== undefined ? clamp(Number(draftValue) || 0, 0, 100) : baseProgressValue;
                const progressAngle = (effectiveProgress / 100) * 360;
                const dialColor = isAutoProgress ? '#7c3aed' : '#2563eb';
                const progressDialStyle: CSSProperties = {
                  backgroundImage: `conic-gradient(${dialColor} 0deg ${progressAngle}deg, rgba(148, 163, 184, 0.25) ${progressAngle}deg 360deg)`
                };
                const inputDisplayValue =
                  draftValue !== undefined ? draftValue : String(Number.isFinite(baseProgressValue) ? baseProgressValue : 0);
                const hasNameChange = isPrimaryRow && isActuals && isFieldChanged(task, 'name');
                const hasDescChange = isPrimaryRow && isActuals && isFieldChanged(task, 'description');
                const hasResponsibleChange = isPrimaryRow && isActuals && isFieldChanged(task, 'responsible');
                const hasStartChange = isPrimaryRow && isActuals && isFieldChanged(task, 'startDate');
                const hasEndChange = isPrimaryRow && isActuals && isFieldChanged(task, 'endDate');
                const hasMilestoneChange = isPrimaryRow && isActuals && isFieldChanged(task, 'milestoneType');
                const hasCapacityChange = isPrimaryRow && isActuals && isFieldChanged(task, 'requiredCapacity');
                const isNewTask = isPrimaryRow && isTaskNew(task);
                return (
                  <div
                    key={row.key}
                    className={`${styles.tableRow} ${rowDepthClass} ${!isPrimaryRow ? styles.assigneeRow : ''} ${isArchived ? styles.rowArchived : ''} ${
                      selectedTaskIdsSet.has(task.id) ? styles.rowSelected : ''
                    }`}
                    style={{ gridTemplateColumns: tableGridTemplate, height: `${ROW_HEIGHT}px` }}
                    onClick={(event) => handleTaskSelect(task.id, event)}
                    onDragOver={(event) => {
                      if (!isPrimaryRow || readOnly || !dragTaskId || dragTaskId === task.id) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      if (readOnly || !isPrimaryRow) {
                        return;
                      }
                      event.preventDefault();
                      if (dragTaskId) {
                        moveTaskBlock(dragTaskId, task.id);
                        setDragTaskId(null);
                      }
                    }}
                  >
                    {visibleColumns.map((column) => {
                      switch (column.id) {
                        case 'drag':
                          if (!isPrimaryRow) {
                            return <div key={`${row.key}-drag`} className={styles.cell} />;
                          }
                          return (
                            <button
                              key={`${row.key}-drag`}
                              type="button"
                              className={styles.dragHandle}
                              draggable={!readOnly}
                              onDragStart={(event) => {
                                setDragTaskId(task.id);
                                event.dataTransfer.setData('text/plain', task.id);
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setDragTaskId(null)}
                              aria-label="Drag to reorder"
                            >
                              <span aria-hidden="true">??</span>
                            </button>
                          );
                        case 'archive':
                          if (!isPrimaryRow) {
                            return <div key={`${row.key}-archive`} className={styles.cell} />;
                          }
                          return (
                            <div key={`${row.key}-archive`} className={styles.cell}>
                              <button
                                type="button"
                                className={`${styles.archiveButton} ${isArchived ? styles.archiveButtonActive : ''}`}
                                disabled={readOnly}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateTask(task.id, (current) => ({ ...current, archived: !current.archived }));
                                }}
                                title={isArchived ? 'Unarchive task' : 'Archive task'}
                              >
                                <span aria-hidden="true">{isArchived ? '?' : '?'}</span>
                              </button>
                            </div>
                          );
                        case 'context': {
                          const value = contextColumn ? contextColumn.value(task) : '';
                          return (
                            <div
                              key={`${row.key}-context`}
                              className={`${styles.cell} ${!isPrimaryRow ? styles.inheritedCell : ''}`}
                            >
                              <span className={styles.groupBadge} title={value || undefined}>
                                {value || '-'}
                              </span>
                            </div>
                          );
                        }
                        case 'name':
                          if (!isPrimaryRow) {
                            return (
                              <div key={`${row.key}-name`} className={`${styles.cell} ${styles.assigneeNameCell}`}>
                                <span className={styles.assigneeBullet} aria-hidden="true" />
                                <div className={styles.assigneeNameText}>
                                  <span className={styles.assigneeHint}>Additional responsible</span>
                                  <strong>{assignee.name || 'Unassigned'}</strong>
                                  <span className={styles.assigneeParent}>Inherits "{task.name || 'Untitled task'}"</span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={`${row.key}-name`}
                              className={`${styles.taskNameCell} ${hasNameChange ? styles.cellChanged : ''}`}
                              title={baseline ? `Baseline: ${baseline.name || 'Untitled task'}` : undefined}
                            >
                              {hasChildren ? (
                                <button
                                  type="button"
                                  className={`${styles.collapseToggle} ${
                                    isCollapsed ? styles.collapseToggleCollapsed : ''
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleTaskCollapse(task.id);
                                  }}
                                  aria-label={isCollapsed ? 'Expand task children' : 'Collapse task children'}
                                  aria-expanded={!isCollapsed}
                                >
                                  <span className={styles.collapseIcon} />
                                </button>
                              ) : (
                                <span className={styles.collapseSpacer} />
                              )}
                              <span style={{ marginLeft: task.indent * 16 }} className={styles.indentGuide} />
                                <input
                                  type="text"
                                  value={task.name}
                                  disabled={readOnly}
                                  data-task-name-input={task.id}
                                  onChange={(event) => handleTaskFieldChange(task, 'name', event.target.value)}
                                  onFocus={hideDescriptionTooltip}
                                  onKeyDown={(event) => event.stopPropagation()}
                                />
              {hasNameChange && (
                <span
                  className={styles.changeDot}
                  aria-hidden="true"
                  onMouseEnter={(event) => showChangeDotTooltip(baseline ? `Baseline: ${baseline.name || 'Untitled task'}` : 'Changed from baseline', event)}
                  onMouseMove={updateChangeDotTooltip}
                  onMouseLeave={hideChangeDotTooltip}
                />
              )}
              {isNewTask && <span className={styles.newBadge}>New</span>}
            </div>
          );
                        case 'milestoneType': {
                          if (!isPrimaryRow) {
                            return (
                              <div key={`${row.key}-milestone`} className={`${styles.cell} ${styles.inheritedCell}`}>
                                <span className={styles.inheritedText}>From task</span>
                              </div>
                            );
                          }
                          const options = milestoneTypes.length ? milestoneTypes : DEFAULT_MILESTONE_OPTIONS;
                          const currentValue =
                            options.find(
                              (option) => option.toLowerCase() === (task.milestoneType ?? '').toLowerCase()
                            ) ??
                            task.milestoneType ??
                            options[0] ??
                            'Standard';
                          return (
                            <div
                              key={`${row.key}-milestone`}
                              className={`${styles.cell} ${hasMilestoneChange ? styles.cellChanged : ''}`}
                              title={baseline?.milestoneType ? `Baseline: ${baseline.milestoneType}` : undefined}
                            >
                              <select
                                value={currentValue}
                                disabled={readOnly}
                                onChange={(event) => handleTaskFieldChange(task, 'milestoneType', event.target.value)}
                              >
                                {options.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              {hasMilestoneChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.milestoneType ? `Baseline: ${baseline.milestoneType}` : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        }
                        case 'description':
                          return (
                            <div
                              key={`${row.key}-description`}
                              className={`${styles.cell} ${hasDescChange ? styles.cellChanged : ''}`}
                              onMouseEnter={(event) => showDescriptionTooltip(task.description, event.currentTarget)}
                              onMouseLeave={hideDescriptionTooltip}
                              title={baseline?.description ? `Baseline: ${baseline.description}` : undefined}
                            >
                              {isPrimaryRow ? (
                                <input
                                  type="text"
                                  value={task.description}
                                  disabled={readOnly}
                                  placeholder="Short summary"
                                  onChange={(event) => handleTaskFieldChange(task, 'description', event.target.value)}
                                  onKeyDown={(event) => event.stopPropagation()}
                                />
                              ) : (
                                <span className={styles.inheritedText}>From parent task</span>
                              )}
                              {hasDescChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.description ? `Baseline: ${baseline.description}` : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        case 'planStart': {
                          const baselineStart = baseline?.startDate ?? null;
                          const label = formatShortDateLabel(baselineStart);
                          return (
                            <div key={`${row.key}-planStart`} className={styles.cell}>
                              <span className={styles.baselineValue}>{label}</span>
                            </div>
                          );
                        }
                        case 'start':
                          return (
                            <div
                              key={`${row.key}-start`}
                              className={`${styles.cell} ${hasStartChange ? styles.cellChanged : ''}`}
                              title={baseline?.startDate ? `Baseline: ${formatShortDateLabel(baseline.startDate)}` : undefined}
                            >
                              {isPrimaryRow ? (
                                <input
                                  type="date"
                                  value={task.startDate ?? ''}
                                  disabled={readOnly}
                                  onChange={(event) => handleTaskFieldChange(task, 'startDate', event.target.value)}
                                />
                              ) : (
                                <span className={styles.inheritedText}>Aligned to parent</span>
                              )}
                              {hasStartChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.startDate
                                        ? `Baseline: ${formatShortDateLabel(baseline.startDate)}`
                                        : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        case 'planEnd': {
                          const baselineEnd = baseline?.endDate ?? null;
                          const label = formatShortDateLabel(baselineEnd);
                          return (
                            <div key={`${row.key}-planEnd`} className={styles.cell}>
                              <span className={styles.baselineValue}>{label}</span>
                            </div>
                          );
                        }
                        case 'end':
                          return (
                            <div
                              key={`${row.key}-end`}
                              className={`${styles.cell} ${hasEndChange ? styles.cellChanged : ''}`}
                              title={baseline?.endDate ? `Baseline: ${formatShortDateLabel(baseline.endDate)}` : undefined}
                            >
                              {isPrimaryRow ? (
                                <input
                                  type="date"
                                  value={task.endDate ?? ''}
                                  disabled={readOnly}
                                  onChange={(event) => handleTaskFieldChange(task, 'endDate', event.target.value)}
                                />
                              ) : (
                                <span className={styles.inheritedText}>Aligned to parent</span>
                              )}
                              {hasEndChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.endDate
                                        ? `Baseline: ${formatShortDateLabel(baseline.endDate)}`
                                        : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        case 'responsible': {
                          const hasCustomResponsible =
                            !!assignee.name &&
                            !participantNameSet.has(assignee.name.trim().toLowerCase());
                          if (!isPrimaryRow) {
                            return (
                              <div
                                key={`${row.key}-responsible`}
                                className={`${styles.cell} ${styles.assigneeResponsible}`}
                              >
                                <select
                                  value={assignee.name}
                                  disabled={readOnly}
                                  onChange={(event) =>
                                    handleAssigneeNameChange(task.id, assignee.id, event.target.value)
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {participantOptions.map((name) => (
                                    <option key={name} value={name}>
                                      {name}
                                    </option>
                                  ))}
                                  {hasCustomResponsible && <option value={assignee.name}>{assignee.name}</option>}
                                </select>
                                <div className={styles.assigneeActions}>
                                  <button
                                    type="button"
                                    className={styles.linkButton}
                                    disabled={readOnly}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveAssignee(task.id, assignee.id);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          }
                            return (
                              <div
                                key={`${row.key}-responsible`}
                                className={`${styles.cell} ${styles.assigneeResponsible} ${hasResponsibleChange ? styles.cellChanged : ''}`}
                              >
                                <select
                                  value={task.responsible}
                                  disabled={readOnly}
                                  onChange={(event) => handleTaskFieldChange(task, 'responsible', event.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {participantOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                                {hasCustomResponsible && (
                                  <option value={task.responsible}>{task.responsible}</option>
                                )}
                              </select>
                              <div className={styles.assigneeActions}>
                                <button
                                  type="button"
                                  className={`${styles.linkButton} ${styles.actionButtonPrimary}`}
                                  disabled={readOnly}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAddAssignee(task.id);
                                  }}
                                >
                                  + Add co-owner
                                </button>
                                {assigneesForTask.length > 1 && (
                                  <span className={styles.assigneePill}>
                                    {assigneesForTask.length - 1} additional
                                  </span>
                                )}
                              </div>
                              {hasResponsibleChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.responsible
                                        ? `Baseline: ${baseline.responsible}`
                                        : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        }
                        case 'progress':
                          if (!isPrimaryRow) {
                            return (
                              <div key={`${row.key}-progress`} className={`${styles.cell} ${styles.inheritedCell}`}>
                                <span className={styles.inheritedText}>From task</span>
                              </div>
                            );
                          }
                          return (
                            <div key={`${row.key}-progress`} className={`${styles.cell} ${styles.progressCell}`}>
                              <div
                                className={`${styles.progressDial} ${isAutoProgress ? styles.progressDialAuto : ''}`}
                                style={progressDialStyle}
                                title={
                                  isAutoProgress
                                    ? 'Completion % is calculated from child tasks'
                                    : 'Edit completion percentage'
                                }
                              >
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  className={styles.progressInput}
                                  value={inputDisplayValue}
                                  disabled={readOnly || isAutoProgress}
                                  onFocus={(event) => {
                                    if (readOnly || isAutoProgress) {
                                      return;
                                    }
                                    event.currentTarget.select();
                                    if (baseProgressValue === 0) {
                                      setProgressDrafts((prev) => ({
                                        ...prev,
                                        [task.id]: ''
                                      }));
                                    }
                                  }}
                                  onChange={(event) => {
                                    if (readOnly || isAutoProgress) {
                                      return;
                                    }
                                    const digitsOnly = event.target.value.replace(/[^0-9]/g, '');
                                    if (task.id in progressDrafts || baseProgressValue === 0) {
                                      setProgressDrafts((prev) => ({
                                        ...prev,
                                        [task.id]: digitsOnly
                                      }));
                                    }
                                    if (!digitsOnly) {
                                      return;
                                    }
                                    handleTaskFieldChange(task, 'progress', digitsOnly);
                                  }}
                                  onBlur={(event) => {
                                    if (readOnly || isAutoProgress) {
                                      return;
                                    }
                                    const digitsOnly = event.target.value.replace(/[^0-9]/g, '');
                                    handleTaskFieldChange(task, 'progress', digitsOnly ? digitsOnly : '0');
                                    if (task.id in progressDrafts || baseProgressValue === 0) {
                                      setProgressDrafts((prev) => {
                                        if (!(task.id in prev)) {
                                          return prev;
                                        }
                                        const nextDrafts = { ...prev };
                                        delete nextDrafts[task.id];
                                        return nextDrafts;
                                      });
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          );
                        case 'capacity':
                          if (!isPrimaryRow) {
                            const isVariable = assignee.capacityMode === 'variable';
                            return (
                              <div
                                key={`${row.key}-capacity`}
                                className={`${styles.cell} ${styles.capacityCell}`}
                              >
                                <input
                                  type="number"
                                  value={isVariable ? '' : assignee.requiredCapacity ?? ''}
                                  placeholder={isVariable ? 'Variable' : '0'}
                                  disabled={readOnly || isVariable}
                                  onChange={(event) =>
                                    handleAssigneeCapacityChange(task.id, assignee.id, event.target.value)
                                  }
                                />
                                <button
                                  type="button"
                                  className={`${styles.linkButton} ${styles.actionButtonPrimary}`}
                                  disabled={readOnly}
                                  onClick={(event) => handleCapacityMenu(event, task, assignee.id)}
                                >
                                  {isVariable ? 'Edit periods' : 'Split load'}
                                </button>
                              </div>
                            );
                          }
                          return (
                              <div
                                key={`${row.key}-capacity`}
                                className={`${styles.cell} ${styles.capacityCell} ${hasCapacityChange ? styles.cellChanged : ''}`}
                                title={
                                  baseline?.requiredCapacity !== undefined && baseline?.requiredCapacity !== null
                                    ? `Baseline: ${baseline.requiredCapacity}`
                                    : undefined
                                }
                            >
                              <input
                                type="number"
                                value={
                                  task.capacityMode === 'variable'
                                    ? ''
                                    : task.requiredCapacity ?? ''
                                }
                                placeholder={task.capacityMode === 'variable' ? 'Variable' : '0'}
                                disabled={readOnly}
                                onChange={(event) => handleTaskFieldChange(task, 'requiredCapacity', event.target.value)}
                              />
                              <button
                                type="button"
                                className={`${styles.linkButton} ${styles.actionButtonPrimary}`}
                                disabled={readOnly}
                                onClick={(event) => handleCapacityMenu(event, task, assignee.id)}
                              >
                                {task.capacityMode === 'variable' ? 'Edit periods' : 'Split load'}
                              </button>
                              {hasCapacityChange && (
                                <span
                                  className={styles.changeDot}
                                  aria-hidden="true"
                                  onMouseEnter={(event) =>
                                    showChangeDotTooltip(
                                      baseline?.requiredCapacity !== undefined && baseline?.requiredCapacity !== null
                                        ? `Baseline: ${baseline.requiredCapacity}`
                                        : 'Changed from baseline',
                                      event
                                    )
                                  }
                                  onMouseMove={updateChangeDotTooltip}
                                  onMouseLeave={hideChangeDotTooltip}
                                />
                              )}
                            </div>
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>
                );
              })}
              {dragTaskId && (
                <div
                  className={styles.dropZone}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveTaskBlock(dragTaskId, null);
                    setDragTaskId(null);
                  }}
                >
                  Drop here to move to end
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          className={styles.resizer}
          onPointerDown={handleSplitDrag}
          role="presentation"
        />
        <div
          className={styles.timelinePanel}
          ref={timelineRef}
        >
          <div
            className={styles.timelineScroll}
            ref={timelineScrollRef}
            onPointerDown={handleTimelinePanStart}
          >
            <div className={styles.timelineHeader} style={{ width: `${timelineRange.width}px` }}>
              <div className={styles.monthRow}>
                {timelineRange.months.map((month) => (
                  <div
                    key={`${month.label}-${month.offset}`}
                    className={styles.monthCell}
                    style={{ width: month.span * pxPerDay }}
                  >
                    {month.label}
                  </div>
                ))}
              </div>
              <div className={styles.dayRow}>
                {timelineRange.days.map((day) => (
                  <div
                    key={day.key}
                    className={styles.dayCell}
                    style={{ width: pxPerDay }}
                  >
                    {day.label}
                  </div>
                ))}
              </div>
            </div>
            <div
              className={styles.timelineCanvas}
              ref={timelineCanvasRef}
              style={{ width: timelineRange.width, height: `${visibleRows.length * ROW_HEIGHT}px` }}
            >
              <div
                className={styles.timelineGrid}
                style={{
                  width: timelineRange.width,
                  height: '100%',
                  backgroundSize: `${pxPerDay}px ${ROW_HEIGHT}px`
                }}
              >
            {visibleRows.map((row) => {
              const task = row.task;
              const assignee = row.assignee;
              const isPrimaryRow = row.kind === 'task';
              const hasDates = task.startDate && task.endDate;
              const startDate = hasDates ? parseDate(task.startDate!) : null;
              const rowOffset = startDate ? diffInDays(timelineRange.start, startDate) : 0;
              const endDate = hasDates ? parseDate(task.endDate!) : null;
              const duration = startDate && endDate ? diffInDays(startDate, endDate) + 1 : 1;
              const width = Math.max(duration * pxPerDay, 6);
              const left = rowOffset * pxPerDay;
              const color = task.color ?? DEFAULT_BAR_COLOR;
              const capacityOverlay = hasDates ? renderCapacityOverlay(task, assignee) : null;
              const shouldShowBarLabel = !showCapacityOverlay;
              const baseline = showBaselines && isPrimaryRow ? resolveBaselineForTask(task) : null;
              const baselineStart = baseline?.startDate ? parseDate(baseline.startDate) : null;
              const baselineEnd = baseline?.endDate ? parseDate(baseline.endDate) : null;
              const baselineHasDates = baselineStart && baselineEnd;
              const baselineDuration =
                baselineStart && baselineEnd ? Math.max(diffInDays(baselineStart, baselineEnd) + 1, 1) : 0;
              const baselineLeft = baselineStart ? diffInDays(timelineRange.start, baselineStart) * pxPerDay : 0;
              const baselineWidth = baselineDuration * pxPerDay;
              const baselineMatchesActual =
                baselineHasDates &&
                task.startDate === baseline?.startDate &&
                task.endDate === baseline?.endDate;
              const isArchived = Boolean(task.archived);
    const barDepthClass =
      task.indent === 0
        ? styles.barRoot
        : task.indent === 1
          ? styles.barChild
          : styles.barGrandchild;
    return (
      <div
        key={`timeline-${row.key}`}
        className={styles.timelineRow}
        style={{ height: `${ROW_HEIGHT}px` }}
        onClick={(event) => handleTaskSelect(task.id, event)}
      >
                  {hasDates ? (
                    <>
                      {baselineHasDates && !baselineMatchesActual && (
                        <div
                          className={`${styles.baselineBar} ${isArchived ? styles.barArchived : ''}`}
                          style={{ left: baselineLeft, width: baselineWidth }}
                          onPointerEnter={(event) => showTimelineTooltip(event, task)}
                          onPointerMove={(event) => showTimelineTooltip(event, task)}
                          onPointerLeave={hideTimelineTooltip}
                        >
                          <span className={styles.baselineBarLabel}>Baseline</span>
                        </div>
                      )}
                    <div
                      className={`${styles.timelineBar} ${barDepthClass} ${!isPrimaryRow ? styles.assigneeBar : ''} ${
                        selectedTaskIdsSet.has(task.id) ? styles.barSelected : ''
                      } ${isArchived ? styles.barArchived : ''}`}
                      style={{ left, width, backgroundColor: color, '--bar-color': color } as CSSProperties}
                      ref={(element) => {
                        if (!isPrimaryRow) {
                          return;
                        }
                        if (element) {
                          barRefs.current.set(task.id, element);
                        } else {
                          barRefs.current.delete(task.id);
                        }
                        scheduleDependencyMeasure();
                      }}
                      onDoubleClick={(event) => handleCapacityMenu(event, task, assignee.id)}
                      onPointerDown={(event) => {
                        if (!isPrimaryRow) {
                          return;
                        }
                        if (event.ctrlKey || event.metaKey || event.button === 2) {
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }
                        startBarDrag(event, task, 'move');
                      }}
                      onPointerUp={() => finishDependencyDraft(task.id)}
                      onPointerEnter={(event) => showTimelineTooltip(event, task)}
                      onPointerMove={(event) => showTimelineTooltip(event, task)}
                      onPointerLeave={hideTimelineTooltip}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({
                          taskId: task.id,
                          x: event.clientX,
                          y: event.clientY
                        });
                      }}
                      data-timeline-interactive="true"
                      data-dependency-target={isPrimaryRow ? 'true' : undefined}
                      data-task-id={task.id}
                    >
                      {capacityOverlay}
                      {isPrimaryRow && !readOnly && (
                        <>
                          <span
                            className={`${styles.barHandle} ${styles.handleLeft}`}
                            onPointerDown={(event) => startBarDrag(event, task, 'resize-start')}
                            data-timeline-interactive="true"
                          />
                          <span
                            className={`${styles.barHandle} ${styles.handleRight}`}
                            onPointerDown={(event) => startBarDrag(event, task, 'resize-end')}
                            data-timeline-interactive="true"
                          />
                        </>
                      )}
                      {isPrimaryRow && (
                        <>
                          <span
                            className={`${styles.linkHandle} ${styles.linkHandleLeft}`}
                            onPointerDown={(event) => startDependencyDraft(event, task.id, 'left')}
                            data-timeline-interactive="true"
                          />
                          <span
                            className={`${styles.linkHandle} ${styles.linkHandleRight}`}
                            onPointerDown={(event) => startDependencyDraft(event, task.id)}
                            data-timeline-interactive="true"
                          />
                        </>
                      )}
                      {shouldShowBarLabel && (
                        <span className={styles.barLabel}>{isPrimaryRow ? task.name : assignee.name || 'Unassigned'}</span>
                      )}
                    </div>
                    </>
                  ) : (
                    <span className={styles.timelinePlaceholder}>Set start & end dates</span>
                  )}
                </div>
              );
            })}
              </div>
              <svg
                className={styles.dependencyLayer}
                style={{ width: `${timelineRange.width}px`, height: `${visibleRows.length * ROW_HEIGHT}px` }}
              >
                <defs>
                  <marker id="dependencyArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                    <path d="M0,1 L10,5 L0,9 Z" fill="#9ca3af" />
                  </marker>
                  <marker id="dependencyArrowDraft" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                    <path d="M0,1 L10,5 L0,9 Z" fill="#cbd5e1" />
                  </marker>
                </defs>
                {dependencyLines.map((line) => {
                  const midX = (line.start.x + line.end.x) / 2;
                  return (
                    <g key={`${line.from}-${line.to}`} className={styles.dependencyPath}>
                      <path
                        d={`M${line.start.x},${line.start.y} C ${midX},${line.start.y} ${midX},${line.end.y} ${line.end.x},${line.end.y}`}
                        markerEnd="url(#dependencyArrow)"
                      />
                      <circle
                        cx={line.end.x}
                        cy={line.end.y}
                        r={6}
                        onClick={() => handleRemoveDependency(line.from, line.to)}
                      />
                    </g>
                  );
                })}
                {dependencyDraft && (
                  <line
                    x1={dependencyDraft.start.x}
                    y1={dependencyDraft.start.y}
                    x2={dependencyDraft.current.x}
                    y2={dependencyDraft.current.y}
                    className={styles.dependencyDraft}
                    markerEnd="url(#dependencyArrowDraft)"
                  />
                )}
              </svg>
            </div>
          {capacityEditor &&
            createPortal(
              (() => {
                const editorTask = normalizedPlan.tasks.find((task) => task.id === capacityEditor.taskId) ?? null;
                const assignees = editorTask ? resolveAssignees(editorTask) : [];
                const primaryAssignee = assignees[0] ?? null;
                const editorAssignee =
                  capacityEditor.assigneeId && editorTask
                    ? assignees.find((item) => item.id === capacityEditor.assigneeId) ?? primaryAssignee
                    : primaryAssignee;
                const canEditColor = Boolean(
                  editorAssignee && primaryAssignee && editorAssignee.id === primaryAssignee.id
                );
                return (
                  <CapacityEditorPopover
                    task={editorTask}
                    assignee={editorAssignee ?? null}
                    canEditColor={canEditColor}
                    onClose={() => setCapacityEditor(null)}
                    onSubmit={applyCapacitySegments}
                    onColorChange={handleColorChange}
                  />
                );
              })(),
              document.body
            )}
          {contextMenu &&
            createPortal(
              (() => {
                const contextTask =
                  normalizedPlan.tasks.find((task) => task.id === contextMenu.taskId) ?? null;
                const hasLinks =
                  !!contextTask &&
                  ((contextTask.dependencies?.length ?? 0) > 0 ||
                    normalizedPlan.tasks.some((task) => (task.dependencies ?? []).includes(contextTask.id)));
                const preferredX =
                  typeof window !== 'undefined' ? Math.min(contextMenu.x, window.innerWidth - 280) : contextMenu.x;
                const preferredY =
                  typeof window !== 'undefined' ? Math.min(contextMenu.y, window.innerHeight - 320) : contextMenu.y;
                const effectiveColor = contextTask?.color ?? DEFAULT_BAR_COLOR;
                return (
                  <div
                    className={styles.contextMenuOverlay}
                    onClick={closeContextMenu}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      closeContextMenu();
                    }}
                  >
                    <div
                      className={styles.contextMenu}
                      style={{ left: preferredX, top: preferredY }}
                      onClick={(event) => event.stopPropagation()}
                      onMouseLeave={() => setOpenSubmenu(null)}
                    >
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'edit')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>✏️</span>
                        <span className={styles.menuLabel}>Edit</span>
                      </button>
                      <div
                        className={`${styles.menuItem} ${styles.hasSubmenu} ${
                          openSubmenu === 'add' ? styles.menuItemActive : ''
                        }`}
                        onMouseEnter={() => setOpenSubmenu('add')}
                      >
                        <div className={styles.menuItemInner}>
                          <span className={styles.menuIcon}>＋</span>
                          <span className={styles.menuLabel}>Add...</span>
                          <span className={styles.menuCaret}>›</span>
                        </div>
                        <div className={`${styles.submenu} ${openSubmenu === 'add' ? styles.submenuOpen : ''}`}>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-above')}
                            disabled={readOnly}
                          >
                            <span>Task above</span>
                          </button>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-below')}
                            disabled={readOnly}
                          >
                            <span>Task below</span>
                          </button>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-milestone')}
                            disabled={readOnly}
                          >
                            <span>Milestone</span>
                          </button>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-subtask')}
                            disabled={readOnly}
                          >
                            <span>Subtask</span>
                          </button>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-successor')}
                            disabled={readOnly}
                          >
                            <span>Successor</span>
                          </button>
                          <button
                            type="button"
                            className={styles.submenuItem}
                            onClick={() => handleContextAction(contextMenu.taskId, 'add-predecessor')}
                            disabled={readOnly}
                          >
                            <span>Predecessor</span>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'convert-milestone')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>◆</span>
                        <span className={styles.menuLabel}>Convert to milestone</span>
                      </button>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'split')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>⇤</span>
                        <span className={styles.menuLabel}>Split</span>
                      </button>
                      <div className={styles.menuSeparator} />
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'indent')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>↳</span>
                        <span className={styles.menuLabel}>Indent</span>
                      </button>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'outdent')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>↰</span>
                        <span className={styles.menuLabel}>Outdent</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.menuItem} ${styles.menuDanger}`}
                        onClick={() => handleContextAction(contextMenu.taskId, 'delete')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>🗑</span>
                        <span className={styles.menuLabel}>Delete</span>
                      </button>
                      <div className={styles.menuSeparator} />
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'add-link')}
                        disabled={readOnly}
                      >
                        <span className={styles.menuIcon}>⛓</span>
                        <span className={styles.menuLabel}>Add dependency</span>
                      </button>
                      <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => handleContextAction(contextMenu.taskId, 'remove-links')}
                        disabled={readOnly || !hasLinks}
                      >
                        <span className={styles.menuIcon}>✕</span>
                        <span className={styles.menuLabel}>Remove dependencies</span>
                      </button>
                      <div
                        className={`${styles.menuItem} ${styles.hasSubmenu} ${
                          openSubmenu === 'color' ? styles.menuItemActive : ''
                        }`}
                        onMouseEnter={() => setOpenSubmenu('color')}
                      >
                        <div className={styles.menuItemInner}>
                          <span className={styles.menuIcon}>🎨</span>
                          <span className={styles.menuLabel}>Color</span>
                          <span
                            className={styles.colorPreview}
                            style={{ backgroundColor: effectiveColor }}
                            aria-hidden="true"
                          />
                        </div>
                        <div
                          className={`${styles.submenu} ${styles.colorSubmenu} ${
                            openSubmenu === 'color' ? styles.submenuOpen : ''
                          }`}
                        >
                          <div className={styles.colorGrid}>
                            {TASK_COLOR_PALETTE.map((swatch) => (
                              <button
                                key={swatch}
                                type="button"
                                className={`${styles.colorSwatch} ${
                                  effectiveColor === swatch ? styles.colorSwatchActive : ''
                                }`}
                                style={{ backgroundColor: swatch }}
                                disabled={readOnly}
                                onClick={() => {
                                  handleColorChange(contextMenu.taskId, swatch);
                                  closeContextMenu();
                                }}
                                aria-label={`Set color ${swatch}`}
                              />
                            ))}
                            <button
                              type="button"
                              className={`${styles.colorSwatch} ${styles.colorSwatchClear}`}
                              disabled={readOnly}
                              onClick={() => {
                                handleColorChange(contextMenu.taskId, null);
                                closeContextMenu();
                              }}
                            >
                              None
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })(),
              document.body
            )}
        </div>
      </div>
      </div>
    );

    stackedContent = isFullscreen ? (
      <>
        {infoBanner}
        <div className={styles.fullscreenStack} ref={fullscreenStackRef}>
          <div
            className={styles.fullscreenPane}
            style={{ flexBasis: `${(1 - fullscreenResourceRatio) * 100}%`, flexGrow: 0, flexShrink: 0 }}
          >
            <div className={styles.fullscreenPaneInner}>
              {isActuals && actualsDashboard}
              {planBodyElement}
            </div>
          </div>
          <div className={styles.fullscreenDivider} onPointerDown={startFullscreenSplitDrag} role="separator" />
          <div
            className={styles.fullscreenPane}
            style={{ flexBasis: `${fullscreenResourceRatio * 100}%`, flexGrow: 0, flexShrink: 0 }}
          >
            <div className={styles.fullscreenPaneInner}>{renderResourceModule(null)}</div>
          </div>
        </div>
        {statusReportModule}
      </>
    ) : (
      <>
        {infoBanner}
        {isActuals && actualsDashboard}
        {planBodyElement}
        <div className={styles.heightResizer} onPointerDown={startHeightResize} />
        {renderResourceModule(resourceHeight)}
        {!resourceCollapsed && (
          <div className={styles.resourceHeightResizer} onPointerDown={startResourceHeightResize} />
        )}
        {statusReportModule}
      </>
    );
  }

  const isCapacityEditorOpen = Boolean(capacityEditor);
  const planSection = (
    <section
      className={`${styles.planContainer} ${isFullscreen ? styles.fullscreenContainer : ''}`}
      ref={containerRef}
    >
      <header className={styles.planHeader}>
        <div className={styles.planHeaderLeft}>
          <button
            className={styles.sectionToggle}
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand implementation plan' : 'Collapse implementation plan'}
          >
            <ChevronIcon direction={isCollapsed ? 'right' : 'down'} size={16} />
          </button>
          <div>
            <h3>{resolvedTitle}</h3>
            <p className={styles.planSubtitle}>{resolvedSubtitle}</p>
          </div>
        </div>
        {!isCollapsed && (
          <div className={styles.toolbar}>
            <button type="button" onClick={handleAddTask} disabled={readOnly}>
              + Add
            </button>
            <button type="button" onClick={handleDeleteTask} disabled={readOnly || !selectedTaskId}>
              Delete
            </button>
            <button type="button" onClick={() => handleIndent()} disabled={readOnly || !selectedTaskId}>
              Indent
            </button>
            <button type="button" onClick={() => handleOutdent()} disabled={readOnly || !selectedTaskId}>
              Outdent
            </button>
            <div className={styles.divider} />
            <button
              type="button"
              onClick={() => handleZoom(1)}
              disabled={readOnly || normalizedPlan.settings.zoomLevel >= PLAN_ZOOM_MAX}
            >
              Zoom in
            </button>
            <button
              type="button"
              onClick={() => handleZoom(-1)}
              disabled={readOnly || normalizedPlan.settings.zoomLevel <= PLAN_ZOOM_MIN}
            >
              Zoom out
            </button>
            <button
              type="button"
              className={showCapacityOverlay ? styles.toggleActive : undefined}
              onClick={() => setShowCapacityOverlay((value) => !value)}
              aria-pressed={showCapacityOverlay}
            >
              {showCapacityOverlay ? 'Hide capacity' : 'Show capacity'}
            </button>
            {isActuals && (
              <>
                <button
                  type="button"
                  onClick={handleSeedFromPlan}
                  disabled={readOnly || !baselinePlanNormalized?.tasks.length}
                  title={
                    !baselinePlanNormalized?.tasks.length ? 'Add tasks to the implementation plan first' : undefined
                  }
                >
                  {normalizedPlan.tasks.length ? 'Refresh actuals from plan' : 'Copy plan to actuals'}
                </button>
                <button
                  type="button"
                  className={showBaselines ? styles.toggleActive : undefined}
                  onClick={() => setShowBaselines((prev) => !prev)}
                >
                  {showBaselines ? 'Hide baseline' : 'Show baseline'}
                </button>
                <button
                  type="button"
                  className={showArchived ? styles.toggleActive : undefined}
                  onClick={() => setShowArchived((prev) => !prev)}
                >
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </button>
                <button
                  type="button"
                  className={showDueSoonOnly ? styles.toggleActive : undefined}
                  onClick={() => setShowDueSoonOnly((prev) => !prev)}
                >
                  {showDueSoonOnly ? 'All tasks' : 'Due soon only'}
                </button>
                <button
                  type="button"
                  className={showCompletedOnly ? styles.toggleActive : undefined}
                  onClick={() => setShowCompletedOnly((prev) => !prev)}
                >
                  {showCompletedOnly ? 'All tasks' : 'Completed only'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                hideDescriptionTooltip();
                setIsFullscreen((value) => !value);
              }}
            >
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          </div>
        )}
      </header>
      {stackedContent}
    </section>
  );

  return (
    <>
      {isFullscreen
        ? createPortal(
            <div className={styles.fullscreenOverlay}>
              <div className={styles.fullscreenInner}>{planSection}</div>
            </div>,
            document.body
          )
        : planSection}
      {timelineTooltip &&
        createPortal(
          <div
            className={styles.timelineTooltip}
            style={{ left: `${timelineTooltip.x}px`, top: `${timelineTooltip.y}px` }}
          >
            <strong>{timelineTooltip.name}</strong>
            <div>
              <span>Start:</span> <em>{timelineTooltip.startLabel}</em>
            </div>
            <div>
              <span>End:</span> <em>{timelineTooltip.endLabel}</em>
            </div>
            <div>
              <span>Duration:</span>{' '}
              <em>
                {timelineTooltip.duration !== null
                  ? `${timelineTooltip.duration} day${timelineTooltip.duration === 1 ? '' : 's'}`
                  : 'Not available'}
              </em>
            </div>
            <div>
              <span>Completion:</span> <em>{timelineTooltip.progress}%</em>
            </div>
          </div>,
          document.body
        )}
      {descriptionTooltip &&
        createPortal(
          <div
            className={styles.descriptionTooltip}
            style={{ left: `${descriptionTooltip.x}px`, top: `${descriptionTooltip.y}px` }}
          >
            {descriptionTooltip.text}
          </div>,
          document.body
        )}
      {changeTooltip &&
        createPortal(
          <div
            className={styles.descriptionTooltip}
            style={{ left: `${changeTooltip.x}px`, top: `${changeTooltip.y}px` }}
          >
            {changeTooltip.text}
          </div>,
          document.body
        )}
    </>
  );
};

interface CapacityEditorProps {
  task: InitiativePlanTask | null;
  assignee: InitiativePlanAssignee | null;
  canEditColor: boolean;
  onClose: () => void;
  onSubmit: (taskId: string, assigneeId: string | null, segments: InitiativePlanCapacitySegment[]) => void;
  onColorChange: (taskId: string, color: string | null) => void;
}

const CapacityEditorPopover = ({ task, assignee, canEditColor, onClose, onSubmit, onColorChange }: CapacityEditorProps) => {
  const [segments, setSegments] = useState<InitiativePlanCapacitySegment[]>(assignee?.capacitySegments ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    setSegments(assignee?.capacitySegments ?? []);
    setError(null);
  }, [assignee, task]);

  if (!task || !task.startDate || !task.endDate) {
    return null;
  }

  const handleFieldChange = (segmentId: string, field: keyof InitiativePlanCapacitySegment, value: string) => {
    setSegments((current) =>
      current.map((segment) => {
        if (segment.id !== segmentId) {
          return segment;
        }
        if (field === 'capacity') {
          const numeric = Math.max(0, Number(value) || 0);
          return { ...segment, capacity: numeric };
        }
        return { ...segment, [field]: value };
      })
    );
  };

  const handleDelete = (segmentId: string) => {
    setSegments((current) => current.filter((segment) => segment.id !== segmentId));
  };

  const handleAdd = () => {
    setSegments((current) => [
      ...current,
      {
        id: generateId(),
        startDate: task.startDate!,
        endDate: task.startDate!,
        capacity: 0
      }
    ]);
  };

  const validate = () => {
    if (!segments.length) {
      setError(null);
      return [];
    }
    const sorted = [...segments].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
    const taskStartDate = parseDate(task.startDate)!;
    const taskEndDate = parseDate(task.endDate)!;
    let lastEnd: Date | null = null;
    for (const segment of sorted) {
      const startDate = parseDate(segment.startDate);
      const endDate = parseDate(segment.endDate);
      if (!startDate || !endDate || endDate < startDate) {
        setError('Each period needs a valid start and end date.');
        return null;
      }
      if (startDate < taskStartDate || endDate > taskEndDate) {
        setError('Periods must stay within the task dates.');
        return null;
      }
      if (lastEnd && startDate.getTime() <= lastEnd.getTime()) {
        setError('Periods must not overlap.');
        return null;
      }
      if (segment.capacity < 0) {
        setError('Capacity must be non-negative.');
        return null;
      }
      lastEnd = endDate;
    }
    setError(null);
    return sorted;
  };

  const handleSubmit = () => {
    const validated = validate();
    if (!validated) {
      return;
    }
    onSubmit(task.id, assignee?.id ?? null, validated);
  };

  const selectedColor = task.color ?? DEFAULT_BAR_COLOR;

  return (
    <div
      className={styles.capacityOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Timeline settings"
      onClick={onClose}
    >
      <div
        className={styles.capacityPopover}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.capacityHeader}>
          <div>
            <strong>Timeline settings</strong>
            <p>{assignee ? `Capacity for ${assignee.name || 'unassigned owner'}` : 'Pick a bar color and fine-tune capacity periods.'}</p>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            Close
          </button>
        </header>

        {canEditColor && (
          <section className={styles.colorSection}>
            <div className={styles.sectionHeader}>
              <span>Bar color</span>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => onColorChange(task.id, null)}
                disabled={!task.color}
              >
                Reset to default
              </button>
            </div>
            <div className={styles.colorPalette}>
              {TASK_COLOR_PALETTE.map((paletteColor) => (
                <button
                  key={paletteColor}
                  type="button"
                  className={`${styles.colorSwatch} ${selectedColor === paletteColor ? styles.swatchSelected : ''}`}
                  style={{ backgroundColor: paletteColor }}
                  onClick={() => onColorChange(task.id, paletteColor)}
                >
                  {selectedColor === paletteColor && <span className={styles.swatchIndicator} />}
                </button>
              ))}
              <label className={styles.customColor}>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(event) => onColorChange(task.id, event.target.value)}
                />
                <span>Custom</span>
              </label>
            </div>
          </section>
        )}

        <section className={styles.capacitySection}>
          <div className={styles.sectionHeader}>
            <span>Variable capacity periods</span>
            <span className={styles.sectionHelp}>Optional: split workload inside task dates</span>
          </div>
          {segments.length === 0 ? (
            <p className={styles.emptyState}>No custom periods. Add one to make this capacity variable.</p>
          ) : (
            <div className={styles.capacityList}>
              {segments.map((segment) => (
                <div key={segment.id} className={styles.capacityRow}>
                  <input
                    type="date"
                    value={segment.startDate}
                    min={task.startDate ?? undefined}
                    max={segment.endDate}
                    onChange={(event) => handleFieldChange(segment.id, 'startDate', event.target.value)}
                  />
                  <input
                    type="date"
                    value={segment.endDate}
                    min={segment.startDate}
                    max={task.endDate ?? undefined}
                    onChange={(event) => handleFieldChange(segment.id, 'endDate', event.target.value)}
                  />
                  <input
                    type="number"
                    value={segment.capacity}
                    min={0}
                    onChange={(event) => handleFieldChange(segment.id, 'capacity', event.target.value)}
                  />
                  <button type="button" onClick={() => handleDelete(segment.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <footer>
            <button type="button" className={styles.linkButton} onClick={handleAdd}>
              + Period
            </button>
            <div className={styles.footerSpacer} />
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.primaryButton} onClick={handleSubmit}>
              Apply
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
};











