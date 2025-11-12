import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { generateId } from '../../../../shared/ui/generateId';

interface InitiativePlanModuleProps {
  plan: InitiativePlanModel;
  onChange: (next: InitiativePlanModel) => void;
  readOnly?: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 44;
const ZOOM_SCALE = [6, 8, 10, 14, 18, 24, 32];

const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

const parseDate = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_PER_DAY);

const diffInDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

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
  { id: 'name', label: 'Task name', defaultWidth: 220, minWidth: 110, maxWidth: 480, resizable: true },
  { id: 'description', label: 'Description', defaultWidth: 240, minWidth: 130, maxWidth: 520, resizable: true },
  { id: 'start', label: 'Start', defaultWidth: 150, minWidth: 90, maxWidth: 260, resizable: true },
  { id: 'end', label: 'End', defaultWidth: 150, minWidth: 90, maxWidth: 260, resizable: true },
  { id: 'responsible', label: 'Responsible', defaultWidth: 200, minWidth: 130, maxWidth: 320, resizable: true },
  { id: 'progress', label: 'Status %', defaultWidth: 140, minWidth: 80, maxWidth: 220, resizable: true },
  { id: 'capacity', label: 'Required capacity', defaultWidth: 180, minWidth: 110, maxWidth: 280, resizable: true }
] as const;

const buildDefaultColumnWidths = () =>
  TABLE_COLUMNS.reduce<Record<TableColumnId, number>>((acc, column) => {
    acc[column.id] = column.defaultWidth;
    return acc;
  }, {} as Record<TableColumnId, number>);

const COLUMN_STORAGE_NAMESPACE = 'initiative-plan:columns';

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface CapacityEditorState {
  taskId: string;
}

interface TimelineMonthSegment {
  label: string;
  offset: number;
  span: number;
}

export const InitiativePlanModule = ({ plan, onChange, readOnly = false }: InitiativePlanModuleProps) => {
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan), [plan]);
  const { session } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(normalizedPlan.tasks[0]?.id ?? null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [capacityEditor, setCapacityEditor] = useState<CapacityEditorState | null>(null);
  const [showCapacityOverlay, setShowCapacityOverlay] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<TableColumnId, number>>(() => buildDefaultColumnWidths());
  const [columnPrefsLoaded, setColumnPrefsLoaded] = useState(false);
  const [descriptionTooltip, setDescriptionTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const dragStateRef = useRef<{
    taskId: string;
    mode: DragMode;
    startX: number;
    startDate: string;
    endDate: string;
    pxPerDay: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{
    columnId: TableColumnId;
    startX: number;
    startWidth: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);

  const columnStorageKey = useMemo(
    () => `${COLUMN_STORAGE_NAMESPACE}:${session?.accountId ?? 'guest'}`,
    [session?.accountId]
  );

  useEffect(() => {
    if (!selectedTaskId && normalizedPlan.tasks.length) {
      setSelectedTaskId(normalizedPlan.tasks[0].id);
    } else if (selectedTaskId) {
      const exists = normalizedPlan.tasks.some((task) => task.id === selectedTaskId);
      if (!exists) {
        setSelectedTaskId(normalizedPlan.tasks[0]?.id ?? null);
      }
    }
  }, [normalizedPlan.tasks, selectedTaskId]);

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

  const pxPerDay = useMemo(
    () => ZOOM_SCALE[clamp(normalizedPlan.settings.zoomLevel, PLAN_ZOOM_MIN, PLAN_ZOOM_MAX)],
    [normalizedPlan.settings.zoomLevel]
  );

  const timelineRange = useMemo(() => {
    const datedTasks = normalizedPlan.tasks.filter((task) => task.startDate && task.endDate);
    let start = new Date();
    let end = addDays(start, 14);
    if (datedTasks.length) {
      start = datedTasks
        .map((task) => parseDate(task.startDate)!)
        .reduce((acc, date) => (date < acc ? date : acc));
      end = datedTasks
        .map((task) => parseDate(task.endDate)!)
        .reduce((acc, date) => (date > acc ? date : acc));
      start = addDays(start, -3);
      end = addDays(end, 3);
    }
    const totalDays = Math.max(diffInDays(start, end), 0) + 1;
    const months: TimelineMonthSegment[] = [];
    let cursor = new Date(start);
    let monthStartIndex = 0;
    let currentLabel = `${cursor.toLocaleString('en-US', { month: 'short' })} ${cursor.getFullYear()}`;
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const next = addDays(start, dayIndex);
      const label = `${next.toLocaleString('en-US', { month: 'short' })} ${next.getFullYear()}`;
      if (label !== currentLabel) {
        months.push({ label: currentLabel, offset: monthStartIndex, span: dayIndex - monthStartIndex });
        monthStartIndex = dayIndex;
        currentLabel = label;
      }
      cursor = next;
    }
    months.push({ label: currentLabel, offset: monthStartIndex, span: totalDays - monthStartIndex });
    const days = Array.from({ length: totalDays }, (_, index) => {
      const date = addDays(start, index);
      return {
        label: date.getDate().toString(),
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      };
    });
    return {
      start,
      end,
      totalDays,
      months,
      days,
      width: totalDays * pxPerDay
    };
  }, [normalizedPlan.tasks, pxPerDay]);

  const tableGridTemplate = useMemo(
    () =>
      TABLE_COLUMNS.map((column) => {
        const width = columnWidths[column.id] ?? column.defaultWidth;
        return `${width}px`;
      }).join(' '),
    [columnWidths]
  );

  const selectedTask = useMemo(
    () => normalizedPlan.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [normalizedPlan.tasks, selectedTaskId]
  );

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

  const hideDescriptionTooltip = useCallback(() => {
    setDescriptionTooltip(null);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      hideDescriptionTooltip();
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [hideDescriptionTooltip]);

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
      dragStateRef.current = {
        taskId: task.id,
        mode,
        startX: event.clientX,
        startDate: task.startDate!,
        endDate: task.endDate!,
        pxPerDay
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
        updateTask(state.taskId, (taskToUpdate) => {
          const start = parseDate(state.startDate)!;
          const end = parseDate(state.endDate)!;
          if (state.mode === 'move') {
            const newStart = formatDateInput(addDays(start, deltaDays));
            const newEnd = formatDateInput(addDays(end, deltaDays));
            return { ...taskToUpdate, startDate: newStart, endDate: newEnd };
          }
          if (state.mode === 'resize-start') {
            const candidate = addDays(start, deltaDays);
            if (candidate > end) {
              return taskToUpdate;
            }
            return { ...taskToUpdate, startDate: formatDateInput(candidate) };
          }
          const candidate = addDays(end, deltaDays);
          if (candidate < start) {
            return taskToUpdate;
          }
          return { ...taskToUpdate, endDate: formatDateInput(candidate) };
        });
      };
      const handleUp = () => {
        dragStateRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [pxPerDay, readOnly, updateTask]
  );

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
    [readOnly, updateTask]
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

  const handleTimelineWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (readOnly) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      event.preventDefault();
      if (event.deltaY === 0) {
        return;
      }
      handleZoom(event.deltaY < 0 ? 1 : -1);
    },
    [handleZoom, readOnly]
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

  return (
    <>
    <section className={styles.planContainer} ref={containerRef}>
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
      <div className={styles.planBody}>
        <div
          className={styles.tablePanel}
          style={{ width: `${normalizedPlan.settings.splitRatio * 100}%` }}
        >
          <div className={styles.tableScroll}>
            <div
              className={styles.tableHeader}
              style={{ gridTemplateColumns: tableGridTemplate }}
            >
              {TABLE_COLUMNS.map((column) => (
                <div key={`header-${column.id}`} className={styles.columnHeader}>
                  {column.label && <span>{column.label}</span>}
                  {column.resizable && (
                    <span
                      className={styles.columnResizer}
                      onPointerDown={(event) => startColumnResize(event, column.id)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div
              className={styles.tableRows}
              onScroll={hideDescriptionTooltip}
              onMouseLeave={hideDescriptionTooltip}
            >
              {normalizedPlan.tasks.map((task) => {
              const rowDepthClass =
                task.indent === 0 ? '' : task.indent === 1 ? styles.rowDepth1 : styles.rowDepth2;
              const hasCustomResponsible =
                !!task.responsible && !RESPONSIBLE_PLACEHOLDER_SET.has(task.responsible);
                return (
                <div
                  key={task.id}
                  className={`${styles.tableRow} ${rowDepthClass} ${
                    selectedTaskId === task.id ? styles.rowSelected : ''
                  }`}
                  style={{ gridTemplateColumns: tableGridTemplate, height: `${ROW_HEIGHT}px` }}
                  onClick={() => setSelectedTaskId(task.id)}
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
                  <button
                    type="button"
                    className={styles.dragHandle}
                    draggable={!readOnly}
                  onDragStart={(event) => {
                    setDragTaskId(task.id);
                    event.dataTransfer.setData('text/plain', task.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragTaskId(null)}
                >
                  ⋮⋮
                </button>
                <div className={styles.taskNameCell}>
                  <span style={{ marginLeft: task.indent * 16 }} className={styles.indentGuide} />
                  <input
                    type="text"
                    value={task.name}
                    disabled={readOnly}
                    onChange={(event) => handleTaskFieldChange(task, 'name', event.target.value)}
                    onFocus={hideDescriptionTooltip}
                  />
                </div>
                <div
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
                <div className={styles.cell}>
                  <input
                    type="date"
                    value={task.startDate ?? ''}
                    disabled={readOnly}
                    onChange={(event) => handleTaskFieldChange(task, 'startDate', event.target.value)}
                  />
                </div>
                <div className={styles.cell}>
                  <input
                    type="date"
                    value={task.endDate ?? ''}
                    disabled={readOnly}
                    onChange={(event) => handleTaskFieldChange(task, 'endDate', event.target.value)}
                  />
                </div>
                <div className={styles.cell}>
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
                <div className={styles.cell}>
                  <input
                    type="number"
                    value={task.progress}
                    min={0}
                    max={100}
                    disabled={readOnly}
                    onChange={(event) => handleTaskFieldChange(task, 'progress', event.target.value)}
                  />
                </div>
                <div className={styles.cell}>
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
          onWheel={handleTimelineWheel}
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
            {normalizedPlan.tasks.map((task) => {
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
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  {hasDates ? (
                    <div
                      className={`${styles.timelineBar} ${barDepthClass} ${
                        selectedTaskId === task.id ? styles.barSelected : ''
                      }`}
                      style={{ left, width, backgroundColor: color }}
                      onDoubleClick={(event) => handleCapacityMenu(event, task)}
                      onPointerDown={(event) => startBarDrag(event, task, 'move')}
                    >
                      {capacityOverlay}
                      {!readOnly && (
                        <>
                          <span
                            className={`${styles.barHandle} ${styles.handleLeft}`}
                            onPointerDown={(event) => startBarDrag(event, task, 'resize-start')}
                          />
                          <span
                            className={`${styles.barHandle} ${styles.handleRight}`}
                            onPointerDown={(event) => startBarDrag(event, task, 'resize-end')}
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
    </section>
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
