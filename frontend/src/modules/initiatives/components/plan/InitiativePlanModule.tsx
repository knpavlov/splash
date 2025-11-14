import { CSSProperties, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../auth/AuthContext';
import styles from '../../../../styles/InitiativePlanModule.module.css';
import {
  InitiativePlanCapacitySegment,
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

interface InitiativePlanModuleProps {
  plan: InitiativePlanModel;
  onChange: (next: InitiativePlanModel) => void;
  readOnly?: boolean;
  onTimelineScroll?: (scrollLeft: number) => void;
  timelineScrollLeft?: number;
}

const ROW_HEIGHT = 60;
const PLAN_HEIGHT_MIN = 320;
const PLAN_HEIGHT_MAX = 900;
const PLAN_HEIGHT_DEFAULT = 440;
const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const TASK_COLOR_PALETTE = ['#5b21b6', '#2563eb', '#0ea5e9', '#10b981', '#f97316', '#ea580c', '#e11d48', '#6d28d9', '#0f172a'];
const DEFAULT_BAR_COLOR = TASK_COLOR_PALETTE[0];
const RESPONSIBLE_PLACEHOLDERS = [
  'Amelia Carter',
  'Noah Patel',
  'Sophia Marin',
  'Leo Fernandez',
  'Isabella Chen',
  'Mason Rivera',
  'Harper Lewis',
  'Ethan Novak',
  'Ava Dimitriou',
  'Lucas Romero',
  'Mila Anders',
  'Jackson Reid',
  'Layla Moretti',
  'Oliver Van Dijk',
  'Chloe Martins',
  'Mateo Silva',
  'Zoe Thompson',
  'Aria Mehta',
  'Benjamin Clarke',
  'Nora Satou'
];
const RESPONSIBLE_PLACEHOLDER_SET = new Set(RESPONSIBLE_PLACEHOLDERS);

type TableColumnId = 'drag' | 'name' | 'description' | 'start' | 'end' | 'responsible' | 'progress' | 'capacity';

interface TableColumnConfig {
  id: TableColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  resizable: boolean;
}

const TABLE_COLUMNS: TableColumnConfig[] = [
  { id: 'drag', label: '', defaultWidth: 36, minWidth: 36, maxWidth: 36, resizable: false },
  { id: 'name', label: 'Task name', defaultWidth: 220, minWidth: 60, maxWidth: 480, resizable: true },
  { id: 'description', label: 'Description', defaultWidth: 240, minWidth: 70, maxWidth: 520, resizable: true },
  { id: 'start', label: 'Start', defaultWidth: 150, minWidth: 50, maxWidth: 260, resizable: true },
  { id: 'end', label: 'End', defaultWidth: 150, minWidth: 50, maxWidth: 260, resizable: true },
  { id: 'responsible', label: 'Responsible', defaultWidth: 200, minWidth: 70, maxWidth: 320, resizable: true },
  { id: 'progress', label: 'Status %', defaultWidth: 140, minWidth: 45, maxWidth: 220, resizable: true },
  { id: 'capacity', label: 'Required capacity', defaultWidth: 180, minWidth: 60, maxWidth: 280, resizable: true }
] as const;

const buildDefaultColumnWidths = () =>
  TABLE_COLUMNS.reduce<Record<TableColumnId, number>>((acc, column) => {
    acc[column.id] = column.defaultWidth;
    return acc;
  }, {} as Record<TableColumnId, number>);

const TABLE_COLUMN_MAP = TABLE_COLUMNS.reduce<Record<TableColumnId, TableColumnConfig>>((acc, column) => {
  acc[column.id] = column;
  return acc;
}, {} as Record<TableColumnId, TableColumnConfig>);

const DEFAULT_COLUMN_ORDER = TABLE_COLUMNS.map((column) => column.id);

const COLUMN_STORAGE_NAMESPACE = 'initiative-plan:columns';

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface CapacityEditorState {
  taskId: string;
}

export const InitiativePlanModule = ({
  plan,
  onChange,
  readOnly = false,
  onTimelineScroll,
  timelineScrollLeft
}: InitiativePlanModuleProps) => {
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan), [plan]);
  const { session } = useAuth();
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(
    () => (normalizedPlan.tasks[0]?.id ? [normalizedPlan.tasks[0].id] : [])
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [capacityEditor, setCapacityEditor] = useState<CapacityEditorState | null>(null);
  const [showCapacityOverlay, setShowCapacityOverlay] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<TableColumnId, number>>(() => buildDefaultColumnWidths());
  const [columnPrefsLoaded, setColumnPrefsLoaded] = useState(false);
  const [columnOrder, setColumnOrder] = useState<TableColumnId[]>(DEFAULT_COLUMN_ORDER);
  const [descriptionTooltip, setDescriptionTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [planHeight, setPlanHeight] = useState(PLAN_HEIGHT_DEFAULT);
  const [planHeightLoaded, setPlanHeightLoaded] = useState(false);
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
  const selectedTaskId = selectedTaskIds[0] ?? null;
  const selectedTaskIdsSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
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
  const scrollSyncSourceRef = useRef<'table' | 'timeline' | null>(null);
  const timelinePanStateRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    columnId: TableColumnId;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);

  const userKey = session?.accountId ?? 'guest';
  const columnStorageKey = useMemo(() => `${COLUMN_STORAGE_NAMESPACE}:${userKey}`, [userKey]);
  const heightStorageKey = useMemo(() => `${COLUMN_STORAGE_NAMESPACE}:height:${userKey}`, [userKey]);
  const columnOrderStorageKey = useMemo(() => `${COLUMN_STORAGE_NAMESPACE}:order:${userKey}`, [userKey]);

  useEffect(() => {
    setColumnPrefsLoaded(false);
    if (typeof window === 'undefined') {
      setColumnPrefsLoaded(true);
      return;
    }
    const defaults = buildDefaultColumnWidths();
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
        for (const column of TABLE_COLUMNS) {
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
  }, [columnStorageKey]);

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
      setColumnOrder(DEFAULT_COLUMN_ORDER);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as TableColumnId[];
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((id): id is TableColumnId => Boolean(TABLE_COLUMN_MAP[id]));
        const seen = new Set<TableColumnId>(filtered);
        const merged = [...filtered, ...DEFAULT_COLUMN_ORDER.filter((id) => !seen.has(id))];
        setColumnOrder(merged);
      }
    } catch {
      setColumnOrder(DEFAULT_COLUMN_ORDER);
    }
  }, [columnOrderStorageKey]);

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

  const pxPerDay = useMemo(() => getZoomScale(normalizedPlan.settings.zoomLevel), [normalizedPlan.settings.zoomLevel]);

  const timelineRange = useMemo(() => buildTimelineRange(normalizedPlan, pxPerDay), [normalizedPlan, pxPerDay]);

  const orderedColumns = useMemo(() => {
    const seen = new Set<TableColumnId>();
    const sequence: TableColumnConfig[] = [];
    columnOrder.forEach((columnId) => {
      if (seen.has(columnId)) {
        return;
      }
      const column = TABLE_COLUMN_MAP[columnId];
      if (column) {
        sequence.push(column);
        seen.add(columnId);
      }
    });
    TABLE_COLUMNS.forEach((column) => {
      if (!seen.has(column.id)) {
        sequence.push(column);
      }
    });
    return sequence;
  }, [columnOrder]);

  const tableGridTemplate = useMemo(
    () =>
      orderedColumns
        .map((column) => {
          const width = columnWidths[column.id] ?? column.defaultWidth;
          return `${width}px`;
        })
        .join(' '),
    [columnWidths, orderedColumns]
  );

  const selectedTask = useMemo(
    () => normalizedPlan.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [normalizedPlan.tasks, selectedTaskId]
  );

  const taskHasChildren = useMemo(() => {
    const map = new Map<string, boolean>();
    normalizedPlan.tasks.forEach((task, index) => {
      const next = normalizedPlan.tasks[index + 1];
      map.set(task.id, Boolean(next && next.indent > task.indent));
    });
    return map;
  }, [normalizedPlan.tasks]);

  const visibleTasks = useMemo(() => {
    const hiddenStack: number[] = [];
    const collapsed = collapsedTaskIds;
    const result: InitiativePlanTask[] = [];
    normalizedPlan.tasks.forEach((task) => {
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
  }, [collapsedTaskIds, normalizedPlan.tasks]);

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
    (next: InitiativePlanModel) => {
      onChange(sanitizePlanModel(next));
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

  const handleAddTask = useCallback(() => {
    if (readOnly) {
      return;
    }
    const baseDate = selectedTask?.startDate ? parseDate(selectedTask.startDate) ?? new Date() : new Date();
    const startDate = formatDateInput(baseDate);
    const endDate = formatDateInput(addDays(baseDate, 7));
    const newTask: InitiativePlanTask = {
      ...createEmptyPlanTask(),
      name: `Activity ${normalizedPlan.tasks.length + 1}`,
      startDate,
      endDate,
      indent: selectedTask?.indent ?? 0
    };
    const tasks = [...normalizedPlan.tasks];
    if (selectedTask) {
      const index = tasks.findIndex((task) => task.id === selectedTask.id);
      tasks.splice(index + 1, 0, newTask);
    } else {
      tasks.push(newTask);
    }
    setTasks(tasks);
    setSelectedTaskId(newTask.id);
  }, [normalizedPlan.tasks, readOnly, selectedTask, setTasks]);

  const handleDeleteTask = useCallback(() => {
    if (readOnly || !selectedTaskId) {
      return;
    }
    const index = normalizedPlan.tasks.findIndex((task) => task.id === selectedTaskId);
    if (index === -1) {
      return;
    }
    const tasks = normalizedPlan.tasks.filter((task) => task.id !== selectedTaskId);
    setTasks(tasks);
    setSelectedTaskId(tasks[Math.max(0, index - 1)]?.id ?? null);
  }, [normalizedPlan.tasks, readOnly, selectedTaskId, setTasks]);

  const handleIndent = useCallback(() => {
    if (readOnly || !selectedTaskId) {
      return;
    }
    const index = normalizedPlan.tasks.findIndex((task) => task.id === selectedTaskId);
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
    updateTask(selectedTaskId, (task) => ({
      ...task,
      indent: nextIndent
    }));
  }, [normalizedPlan.tasks, readOnly, selectedTaskId, updateTask]);

  const handleOutdent = useCallback(() => {
    if (readOnly || !selectedTaskId) {
      return;
    }
    updateTask(selectedTaskId, (task) => ({
      ...task,
      indent: Math.max(0, task.indent - 1)
    }));
  }, [readOnly, selectedTaskId, updateTask]);

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
      if (readOnly) {
        return;
      }
      const column = TABLE_COLUMNS.find((item) => item.id === columnId);
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
    [columnWidths, readOnly]
  );

  const startHeightResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!planHeightLoaded) {
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
    [planHeight, planHeightLoaded]
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
      if (onTimelineScroll) {
        onTimelineScroll(timelineScroll.scrollLeft);
      }
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
  }, [isFullscreen, onTimelineScroll]);

  useEffect(() => {
    if (timelineScrollLeft === null || timelineScrollLeft === undefined) {
      return;
    }
    const timelineScroll = timelineScrollRef.current;
    if (!timelineScroll) {
      return;
    }
    if (Math.abs(timelineScroll.scrollLeft - timelineScrollLeft) > 1) {
      timelineScroll.scrollLeft = timelineScrollLeft;
    }
  }, [timelineScrollLeft]);

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
      if (readOnly) {
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
    [emitChange, normalizedPlan, readOnly]
  );

  const startBarDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, task: InitiativePlanTask, mode: DragMode) => {
      if (readOnly || !task.startDate || !task.endDate) {
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
    [normalizedPlan.tasks, pxPerDay, readOnly, selectedTaskIds, selectedTaskIdsSet, setSelectedTaskId, setTasks]
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
      if (readOnly) {
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
    [readOnly]
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

  const handleTaskFieldChange = useCallback(
    (task: InitiativePlanTask, field: keyof InitiativePlanTask, value: string) => {
      if (readOnly) {
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
        if (field === 'requiredCapacity') {
          if (!value.trim()) {
            return { ...current, requiredCapacity: null, capacityMode: 'fixed', capacitySegments: [] };
          }
          const numeric = Math.max(0, Number(value));
          return {
            ...current,
            requiredCapacity: numeric,
            capacityMode: 'fixed',
            capacitySegments: []
          };
        }
        return { ...current, [field]: value };
      });
    },
    [autoProgressTaskIds, readOnly, updateTask]
  );

  const handleCapacityMenu = useCallback(
    (event: React.MouseEvent, task: InitiativePlanTask) => {
      if (readOnly) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!task.startDate || !task.endDate) {
        setInfoMessage('Set start and end dates before configuring capacity periods.');
        return;
      }
      setCapacityEditor({ taskId: task.id });
    },
    [readOnly]
  );

  const applyCapacitySegments = useCallback(
    (taskId: string, segments: InitiativePlanCapacitySegment[]) => {
      updateTask(taskId, (task) => ({
        ...task,
        capacityMode: segments.length ? 'variable' : 'fixed',
        capacitySegments: segments,
        requiredCapacity: segments.length ? null : task.requiredCapacity
      }));
      setCapacityEditor(null);
    },
    [updateTask]
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
    []
  );

  const renderCapacityOverlay = useCallback(
    (task: InitiativePlanTask) => {
      if (!showCapacityOverlay || !task.startDate || !task.endDate) {
        return null;
      }
      const taskStart = parseDate(task.startDate);
      const taskEnd = parseDate(task.endDate);
      if (!taskStart || !taskEnd) {
        return null;
      }
      const totalDays = Math.max(diffInDays(taskStart, taskEnd) + 1, 1);
      if (task.capacityMode === 'variable' && task.capacitySegments.length) {
        return (
          <div className={styles.capacityOverlayTrack} aria-hidden="true">
            {task.capacitySegments.map((segment) => {
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
      if (task.requiredCapacity !== null) {
        return (
          <div className={`${styles.capacityOverlayTrack} ${styles.capacityOverlaySingle}`} aria-hidden="true">
            <div className={styles.capacityOverlaySegment} style={{ left: 0, width: '100%' }}>
              <span>{task.requiredCapacity}</span>
            </div>
          </div>
        );
      }
      return null;
    },
    [showCapacityOverlay]
  );

  const planSection = (
    <section
      className={`${styles.planContainer} ${isFullscreen ? styles.fullscreenContainer : ''}`}
      ref={containerRef}
    >
      <header className={styles.planHeader}>
        <div>
          <h3>Implementation plan</h3>
          <p className={styles.planSubtitle}>Build a detailed execution plan with a live Gantt chart.</p>
        </div>
        <div className={styles.toolbar}>
          <button type="button" onClick={handleAddTask} disabled={readOnly}>
            + Add
          </button>
          <button type="button" onClick={handleDeleteTask} disabled={readOnly || !selectedTaskId}>
            Delete
          </button>
          <button type="button" onClick={handleIndent} disabled={readOnly || !selectedTaskId}>
            Indent
          </button>
          <button type="button" onClick={handleOutdent} disabled={readOnly || !selectedTaskId}>
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
      </header>
      {infoMessage && (
        <div className={styles.infoBanner}>
          <span>{infoMessage}</span>
          <button type="button" onClick={() => setInfoMessage(null)}>
            ×
          </button>
        </div>
      )}
      <div
        className={styles.planBody}
        style={isFullscreen ? undefined : { height: `${planHeight}px` }}
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
              {orderedColumns.map((column) => (
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
              {visibleTasks.map((task) => {
                const rowDepthClass =
                  task.indent === 0 ? '' : task.indent === 1 ? styles.rowDepth1 : styles.rowDepth2;
                const hasCustomResponsible =
                  !!task.responsible && !RESPONSIBLE_PLACEHOLDER_SET.has(task.responsible);
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
                return (
                  <div
                    key={task.id}
                    className={`${styles.tableRow} ${rowDepthClass} ${
                      selectedTaskIdsSet.has(task.id) ? styles.rowSelected : ''
                    }`}
                    style={{ gridTemplateColumns: tableGridTemplate, height: `${ROW_HEIGHT}px` }}
                    onClick={(event) => handleTaskSelect(task.id, event)}
                    onDragOver={(event) => {
                      if (readOnly || !dragTaskId || dragTaskId === task.id) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => {
                      if (readOnly) {
                        return;
                      }
                      event.preventDefault();
                      if (dragTaskId) {
                        moveTaskBlock(dragTaskId, task.id);
                        setDragTaskId(null);
                      }
                    }}
                  >
                    {orderedColumns.map((column) => {
                      switch (column.id) {
                        case 'drag':
                          return (
                            <button
                              key={`${task.id}-drag`}
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
                        case 'name':
                          return (
                            <div key={`${task.id}-name`} className={styles.taskNameCell}>
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
                                onChange={(event) => handleTaskFieldChange(task, 'name', event.target.value)}
                                onFocus={hideDescriptionTooltip}
                              />
                            </div>
                          );
                        case 'description':
                          return (
                            <div
                              key={`${task.id}-description`}
                              className={styles.cell}
                              onMouseEnter={(event) => showDescriptionTooltip(task.description, event.currentTarget)}
                              onMouseLeave={hideDescriptionTooltip}
                            >
                              <input
                                type="text"
                                value={task.description}
                                disabled={readOnly}
                                placeholder="Short summary"
                                onChange={(event) => handleTaskFieldChange(task, 'description', event.target.value)}
                              />
                            </div>
                          );
                        case 'start':
                          return (
                            <div key={`${task.id}-start`} className={styles.cell}>
                              <input
                                type="date"
                                value={task.startDate ?? ''}
                                disabled={readOnly}
                                onChange={(event) => handleTaskFieldChange(task, 'startDate', event.target.value)}
                              />
                            </div>
                          );
                        case 'end':
                          return (
                            <div key={`${task.id}-end`} className={styles.cell}>
                              <input
                                type="date"
                                value={task.endDate ?? ''}
                                disabled={readOnly}
                                onChange={(event) => handleTaskFieldChange(task, 'endDate', event.target.value)}
                              />
                            </div>
                          );
                        case 'responsible':
                          return (
                            <div key={`${task.id}-responsible`} className={styles.cell}>
                              <select
                                value={task.responsible}
                                disabled={readOnly}
                                onChange={(event) => handleTaskFieldChange(task, 'responsible', event.target.value)}
                              >
                                <option value="">Unassigned</option>
                                {RESPONSIBLE_PLACEHOLDERS.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                                {hasCustomResponsible && (
                                  <option value={task.responsible}>{task.responsible}</option>
                                )}
                              </select>
                            </div>
                          );
                        case 'progress':
                          return (
                            <div key={`${task.id}-progress`} className={`${styles.cell} ${styles.progressCell}`}>
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
                          return (
                            <div key={`${task.id}-capacity`} className={styles.cell}>
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
            <div className={styles.timelineHeader}>
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
              className={styles.timelineGrid}
              style={{
                width: timelineRange.width,
                backgroundSize: `${pxPerDay}px ${ROW_HEIGHT}px`
              }}
            >
            {visibleTasks.map((task) => {
              const hasDates = task.startDate && task.endDate;
              const startDate = hasDates ? parseDate(task.startDate!) : null;
              const rowOffset = startDate ? diffInDays(timelineRange.start, startDate) : 0;
              const endDate = hasDates ? parseDate(task.endDate!) : null;
              const duration = startDate && endDate ? diffInDays(startDate, endDate) + 1 : 1;
              const width = Math.max(duration * pxPerDay, 6);
              const left = rowOffset * pxPerDay;
              const color = task.color ?? DEFAULT_BAR_COLOR;
              const capacityOverlay = hasDates ? renderCapacityOverlay(task) : null;
              const shouldShowBarLabel = !showCapacityOverlay;
              const barDepthClass =
                task.indent === 0
                  ? styles.barRoot
                  : task.indent === 1
                    ? styles.barChild
                    : styles.barGrandchild;
              return (
                <div
                  key={`timeline-${task.id}`}
                  className={styles.timelineRow}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onClick={(event) => handleTaskSelect(task.id, event)}
                >
                  {hasDates ? (
                    <div
                      className={`${styles.timelineBar} ${barDepthClass} ${
                        selectedTaskIdsSet.has(task.id) ? styles.barSelected : ''
                      }`}
                      style={{ left, width, backgroundColor: color }}
                      onDoubleClick={(event) => handleCapacityMenu(event, task)}
                      onPointerDown={(event) => {
                        if (event.ctrlKey || event.metaKey) {
                          event.preventDefault();
                          event.stopPropagation();
                          return;
                        }
                        startBarDrag(event, task, 'move');
                      }}
                      onPointerEnter={(event) => showTimelineTooltip(event, task)}
                      onPointerMove={(event) => showTimelineTooltip(event, task)}
                      onPointerLeave={hideTimelineTooltip}
                      data-timeline-interactive="true"
                    >
                      {capacityOverlay}
                      {!readOnly && (
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
                      {shouldShowBarLabel && <span className={styles.barLabel}>{task.name}</span>}
                    </div>
                  ) : (
                    <span className={styles.timelinePlaceholder}>Set start & end dates</span>
                  )}
                </div>
              );
            })}
          </div>
          {capacityEditor && (
            <CapacityEditorPopover
              task={normalizedPlan.tasks.find((task) => task.id === capacityEditor.taskId) ?? null}
              onClose={() => setCapacityEditor(null)}
              onSubmit={applyCapacitySegments}
              onColorChange={handleColorChange}
            />
          )}
        </div>
      </div>
      </div>
      {!isFullscreen && (
        <div
          className={styles.heightResizer}
          onPointerDown={startHeightResize}
        />
      )}
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
    </>
  );
};

interface CapacityEditorProps {
  task: InitiativePlanTask | null;
  onClose: () => void;
  onSubmit: (taskId: string, segments: InitiativePlanCapacitySegment[]) => void;
  onColorChange: (taskId: string, color: string | null) => void;
}

const CapacityEditorPopover = ({ task, onClose, onSubmit, onColorChange }: CapacityEditorProps) => {
  const [segments, setSegments] = useState<InitiativePlanCapacitySegment[]>(task?.capacitySegments ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    setSegments(task.capacitySegments);
    setError(null);
  }, [task]);

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
    onSubmit(task.id, validated);
  };

  const selectedColor = task.color ?? DEFAULT_BAR_COLOR;

  return createPortal(
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
            <p>Pick a bar color and fine-tune capacity periods.</p>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton}>
            Close
          </button>
        </header>

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
    </div>,
    document.body
  );
};

