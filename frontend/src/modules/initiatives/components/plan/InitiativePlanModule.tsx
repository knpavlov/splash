import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const stringToColor = (value: string) => {
  if (!value) {
    return '#5b21b6';
  }
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

type DragMode = 'move' | 'resize-start' | 'resize-end';

interface CapacityEditorState {
  taskId: string;
  anchorX: number;
  anchorY: number;
}

interface TimelineMonthSegment {
  label: string;
  offset: number;
  span: number;
}

export const InitiativePlanModule = ({ plan, onChange, readOnly = false }: InitiativePlanModuleProps) => {
  const normalizedPlan = useMemo(() => sanitizePlanModel(plan), [plan]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(normalizedPlan.tasks[0]?.id ?? null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [capacityEditor, setCapacityEditor] = useState<CapacityEditorState | null>(null);
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
    const previousIndent = normalizedPlan.tasks[index - 1].indent;
    updateTask(selectedTaskId, (task) => ({
      ...task,
      indent: Math.min(previousIndent + 1, task.indent + 1)
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
        dragStateRef.current = {
          ...state,
          startDate: dragStateRef.current?.startDate ?? task.startDate!,
          endDate: dragStateRef.current?.endDate ?? task.endDate!,
          startX: moveEvent.clientX
        };
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
      if (!task.startDate || !task.endDate) {
        setInfoMessage('Set start and end dates before configuring capacity periods.');
        return;
      }
      const container = timelineRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      setCapacityEditor({ taskId: task.id, anchorX, anchorY });
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

  return (
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
          <div className={styles.tableHeader}>
            <span />
            <span>Task name</span>
            <span>Start</span>
            <span>End</span>
            <span>Responsible</span>
            <span>Status %</span>
            <span>Required capacity</span>
          </div>
          <div className={styles.tableRows}>
            {normalizedPlan.tasks.map((task) => (
              <div
                key={task.id}
                className={`${styles.tableRow} ${selectedTaskId === task.id ? styles.rowSelected : ''}`}
            style={{ height: `${ROW_HEIGHT}px` }}
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
                  <input
                    type="text"
                    value={task.responsible}
                    disabled={readOnly}
                    onChange={(event) => handleTaskFieldChange(task, 'responsible', event.target.value)}
                  />
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
            ))}
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
        <div
          className={styles.resizer}
          onPointerDown={handleSplitDrag}
          role="presentation"
        />
        <div
          className={styles.timelinePanel}
          ref={timelineRef}
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
              const color = task.color ?? stringToColor(task.responsible || task.name);
              return (
                <div
                  key={`timeline-${task.id}`}
                  className={styles.timelineRow}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  {hasDates ? (
                    <div
                      className={`${styles.timelineBar} ${
                        selectedTaskId === task.id ? styles.barSelected : ''
                      }`}
                      style={{ left, width, backgroundColor: color }}
                      onDoubleClick={(event) => handleCapacityMenu(event, task)}
                      onPointerDown={(event) => startBarDrag(event, task, 'move')}
                    >
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
                      <span className={styles.barLabel}>{task.name}</span>
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
              anchor={capacityEditor}
              onSubmit={applyCapacitySegments}
            />
          )}
        </div>
      </div>
    </section>
  );
};

interface CapacityEditorProps {
  task: InitiativePlanTask | null;
  anchor: CapacityEditorState;
  onClose: () => void;
  onSubmit: (taskId: string, segments: InitiativePlanCapacitySegment[]) => void;
}

const CapacityEditorPopover = ({ task, anchor, onClose, onSubmit }: CapacityEditorProps) => {
  const [segments, setSegments] = useState<InitiativePlanCapacitySegment[]>(task?.capacitySegments ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSegments(task?.capacitySegments ?? []);
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

  return (
    <div
      className={styles.capacityPopover}
      style={{ left: anchor.anchorX, top: anchor.anchorY }}
    >
      <header>
        <strong>Capacity periods</strong>
        <button type="button" onClick={onClose}>
          ×
        </button>
      </header>
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
    </div>
  );
};
