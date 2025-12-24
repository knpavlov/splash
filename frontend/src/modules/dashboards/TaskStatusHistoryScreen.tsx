import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Info, X, ExternalLink, Filter } from 'lucide-react';
import styles from '../../styles/TaskStatusHistoryScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativeStatusReport } from '../../shared/types/initiative';
import { initiativesApi } from '../initiatives/services/initiativesApi';

interface TaskStatusPoint {
  id: string;
  date: Date;
  comment: string;
  author: string | null;
  dueStatus: 'normal' | 'warning' | 'overdue';
  reportId: string;
}

interface TaskWithHistory {
  id: string;
  name: string;
  description: string;
  responsible: string;
  startDate: Date | null;
  endDate: Date | null;
  progress: number;
  statusPoints: TaskStatusPoint[];
  isCompleted: boolean;
}

interface GlobalTimelineRange {
  start: Date;
  end: Date;
  totalDays: number;
}

interface PopupState {
  taskId: string;
  pointId: string;
  x: number;
  y: number;
}

interface ModalState {
  task: TaskWithHistory;
}

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: Date | null): string => {
  if (!value) return 'Not set';
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatShortDate = (value: Date): string => {
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const diffInDays = (a: Date, b: Date): number => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((a.getTime() - b.getTime()) / msPerDay);
};

const clampProgress = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const WARNING_DAYS = 7;
const PIXELS_PER_DAY = 14;
const MIN_TIMELINE_WIDTH = 1000;

type TaskFilter = 'all' | 'incomplete' | 'completed' | 'overdue' | 'with-reports';

export const TaskStatusHistoryScreen = () => {
  const { list: initiatives, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [statusReports, setStatusReports] = useState<InitiativeStatusReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [popupState, setPopupState] = useState<PopupState | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const taskRowsContainerRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const filteredWorkstreams = useMemo(
    () => workstreams.filter((ws) => initiatives.some((init) => init.workstreamId === ws.id)),
    [workstreams, initiatives]
  );

  const filteredInitiatives = useMemo(
    () =>
      initiatives.filter((item) => {
        if (workstreamFilter !== 'all' && item.workstreamId !== workstreamFilter) return false;
        return true;
      }),
    [initiatives, workstreamFilter]
  );

  const selectedInitiative = useMemo(
    () => (initiativeFilter !== 'all' ? initiatives.find((init) => init.id === initiativeFilter) : null),
    [initiatives, initiativeFilter]
  );

  useEffect(() => {
    if (initiativeFilter === 'all') {
      setStatusReports([]);
      return;
    }

    setLoadingReports(true);
    void initiativesApi
      .listStatusReports(initiativeFilter)
      .then((reports) => {
        setStatusReports(reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      })
      .catch((error) => {
        console.error('Failed to load status reports', error);
        setStatusReports([]);
      })
      .finally(() => {
        setLoadingReports(false);
      });
  }, [initiativeFilter]);

  useEffect(() => {
    if (workstreamFilter !== 'all' && initiativeFilter !== 'all') {
      const init = initiatives.find((i) => i.id === initiativeFilter);
      if (init && init.workstreamId !== workstreamFilter) {
        setInitiativeFilter('all');
      }
    }
  }, [workstreamFilter, initiativeFilter, initiatives]);

  // Use actuals plan if available, otherwise fall back to regular plan
  const tasksWithHistory = useMemo<TaskWithHistory[]>(() => {
    if (!selectedInitiative) return [];

    const actualsModel = selectedInitiative.plan.actuals;
    const tasks = actualsModel?.tasks ?? selectedInitiative.plan.tasks;
    const filteredTasks = tasks.filter((task) => !task.archived);

    return filteredTasks.map((task) => {
      const statusPoints: TaskStatusPoint[] = [];

      statusReports.forEach((report) => {
        const entry = report.entries.find((e) => e.taskId === task.id);
        if (entry && entry.statusUpdate && entry.statusUpdate.trim()) {
          const dueStatus: 'normal' | 'warning' | 'overdue' =
            entry.dueStatusSnapshot === 'negative'
              ? 'overdue'
              : entry.dueStatusSnapshot === 'warning'
                ? 'warning'
                : 'normal';

          statusPoints.push({
            id: `${report.id}-${task.id}`,
            date: new Date(report.createdAt),
            comment: entry.statusUpdate.trim(),
            author: report.createdByName,
            dueStatus,
            reportId: report.id
          });
        }
      });

      statusPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
      const progress = clampProgress(task.progress);

      return {
        id: task.id,
        name: task.name || 'Untitled task',
        description: task.description,
        responsible: task.responsible,
        startDate: parseDate(task.startDate),
        endDate: parseDate(task.endDate),
        progress,
        statusPoints,
        isCompleted: progress >= 100
      };
    });
  }, [selectedInitiative, statusReports]);

  // Apply task filters
  const filteredTasks = useMemo(() => {
    return tasksWithHistory.filter((task) => {
      switch (taskFilter) {
        case 'incomplete':
          return !task.isCompleted;
        case 'completed':
          return task.isCompleted;
        case 'overdue':
          return task.endDate && task.endDate < today && !task.isCompleted;
        case 'with-reports':
          return task.statusPoints.length > 0;
        default:
          return true;
      }
    });
  }, [tasksWithHistory, taskFilter, today]);

  const tasksWithReports = useMemo(
    () => tasksWithHistory.filter((task) => task.statusPoints.length > 0),
    [tasksWithHistory]
  );

  const globalTimelineRange = useMemo<GlobalTimelineRange>(() => {
    if (filteredTasks.length === 0) {
      const defaultStart = addDays(today, -30);
      const defaultEnd = addDays(today, 30);
      return { start: defaultStart, end: defaultEnd, totalDays: 60 };
    }

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    filteredTasks.forEach((task) => {
      if (task.startDate) {
        if (!minDate || task.startDate < minDate) minDate = task.startDate;
      }
      if (task.endDate) {
        if (!maxDate || task.endDate > maxDate) maxDate = task.endDate;
      }
      task.statusPoints.forEach((point) => {
        if (!minDate || point.date < minDate) minDate = point.date;
        if (!maxDate || point.date > maxDate) maxDate = point.date;
      });
    });

    if (!minDate) minDate = addDays(today, -30);
    if (!maxDate) maxDate = addDays(today, 30);

    if (today < minDate) minDate = today;
    if (today > maxDate) maxDate = today;

    const paddedStart = addDays(minDate, -14);
    const paddedEnd = addDays(maxDate, 21);

    const totalDays = Math.max(diffInDays(paddedEnd, paddedStart), 60);

    return { start: paddedStart, end: paddedEnd, totalDays };
  }, [filteredTasks, today]);

  const timelineWidth = useMemo(() => {
    return Math.max(MIN_TIMELINE_WIDTH, globalTimelineRange.totalDays * PIXELS_PER_DAY);
  }, [globalTimelineRange.totalDays]);

  const getPosition = useCallback(
    (date: Date): number => {
      const dayOffset = diffInDays(date, globalTimelineRange.start);
      return Math.max(0, Math.min(100, (dayOffset / globalTimelineRange.totalDays) * 100));
    },
    [globalTimelineRange]
  );

  const timelineTicks = useMemo(() => {
    const ticks: { date: Date; label: string; position: number }[] = [];
    const tickInterval = Math.max(7, Math.floor(globalTimelineRange.totalDays / 14));
    let tickDate = new Date(globalTimelineRange.start);

    while (tickDate <= globalTimelineRange.end) {
      ticks.push({
        date: new Date(tickDate),
        label: formatShortDate(tickDate),
        position: getPosition(tickDate)
      });
      tickDate = addDays(tickDate, tickInterval);
    }

    return ticks;
  }, [globalTimelineRange, getPosition]);

  const todayPosition = useMemo(() => getPosition(today), [getPosition, today]);

  useEffect(() => {
    if (scrollContainerRef.current && todayPosition > 0 && filteredTasks.length > 0) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const scrollTarget = (todayPosition / 100) * timelineWidth - containerWidth / 3;
      const targetScroll = Math.max(0, scrollTarget);
      scrollContainerRef.current.scrollLeft = targetScroll;
      // Also sync task rows
      const taskTimelines = taskRowsContainerRef.current?.querySelectorAll('[data-timeline-scroll]');
      taskTimelines?.forEach((el) => {
        (el as HTMLElement).scrollLeft = targetScroll;
      });
    }
  }, [todayPosition, timelineWidth, filteredTasks.length]);

  // Sync scroll between header and all task rows
  const handleHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const scrollLeft = e.currentTarget.scrollLeft;
    const taskTimelines = taskRowsContainerRef.current?.querySelectorAll('[data-timeline-scroll]');
    taskTimelines?.forEach((el) => {
      (el as HTMLElement).scrollLeft = scrollLeft;
    });
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }, []);

  const handleTaskTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const scrollLeft = e.currentTarget.scrollLeft;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollLeft;
    }
    const taskTimelines = taskRowsContainerRef.current?.querySelectorAll('[data-timeline-scroll]');
    taskTimelines?.forEach((el) => {
      if (el !== e.currentTarget) {
        (el as HTMLElement).scrollLeft = scrollLeft;
      }
    });
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }, []);

  const stats = useMemo(() => {
    const totalTasks = tasksWithHistory.length;
    const tasksWithUpdates = tasksWithReports.length;
    const totalReports = statusReports.length;
    const overdueTasks = tasksWithHistory.filter(
      (task) => task.endDate && task.endDate < today && !task.isCompleted
    ).length;
    const completedTasks = tasksWithHistory.filter((task) => task.isCompleted).length;

    return { totalTasks, tasksWithUpdates, totalReports, overdueTasks, completedTasks };
  }, [tasksWithHistory, tasksWithReports, statusReports, today]);

  const getTaskDateStatus = useCallback(
    (task: TaskWithHistory): 'normal' | 'warning' | 'overdue' => {
      if (!task.endDate) return 'normal';
      if (task.isCompleted) return 'normal';

      const daysUntilDue = diffInDays(task.endDate, today);
      if (daysUntilDue < 0) return 'overdue';
      if (daysUntilDue <= WARNING_DAYS) return 'warning';
      return 'normal';
    },
    [today]
  );

  const handlePointClick = useCallback((e: React.MouseEvent, taskId: string, pointId: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopupState({
      taskId,
      pointId,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8
    });
  }, []);

  const closePopup = useCallback(() => {
    setPopupState(null);
  }, []);

  const openTaskModal = useCallback((task: TaskWithHistory) => {
    setModalState({ task });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(null);
  }, []);

  const getActivePoint = useCallback(() => {
    if (!popupState) return null;
    const task = filteredTasks.find((t) => t.id === popupState.taskId);
    if (!task) return null;
    return task.statusPoints.find((p) => p.id === popupState.pointId) ?? null;
  }, [popupState, filteredTasks]);

  const renderTaskTimeline = (task: TaskWithHistory) => {
    const taskStartPos = task.startDate ? getPosition(task.startDate) : null;
    const taskEndPos = task.endDate ? getPosition(task.endDate) : null;

    const warningStartDate = task.endDate ? addDays(task.endDate, -WARNING_DAYS) : null;
    const warningStartPos = warningStartDate ? getPosition(warningStartDate) : null;

    return (
      <div className={styles.taskTimelineRow} style={{ width: `${timelineWidth}px` }}>
        <div className={styles.taskTimelineContent}>
          {taskStartPos !== null && taskEndPos !== null && (
            <div
              className={`${styles.taskDurationBar} ${task.isCompleted ? styles.completed : ''}`}
              style={{
                left: `${taskStartPos}%`,
                width: `${Math.max(taskEndPos - taskStartPos, 0.5)}%`
              }}
            >
              {task.progress}%
            </div>
          )}

          <div className={styles.statusZones}>
            {warningStartPos !== null && taskEndPos !== null && !task.isCompleted && (
              <>
                <div
                  className={styles.zoneWarning}
                  style={{
                    position: 'absolute',
                    left: `${Math.max(warningStartPos, 0)}%`,
                    width: `${Math.max(0, Math.min(taskEndPos - warningStartPos, 100 - warningStartPos))}%`
                  }}
                />
                {task.endDate && task.endDate < today && (
                  <div
                    className={styles.zoneOverdue}
                    style={{
                      position: 'absolute',
                      left: `${taskEndPos}%`,
                      width: `${Math.max(0, Math.min(todayPosition - taskEndPos, 100 - taskEndPos))}%`
                    }}
                  />
                )}
              </>
            )}
          </div>

          <div className={styles.statusPoints}>
            {task.statusPoints.map((point) => {
              const pos = getPosition(point.date);
              const isActive = popupState?.taskId === task.id && popupState?.pointId === point.id;

              return (
                <div
                  key={point.id}
                  className={`${styles.statusPoint} ${styles[point.dueStatus]} ${isActive ? styles.active : ''}`}
                  style={{ left: `${pos}%` }}
                  onClick={(e) => handlePointClick(e, task.id, point.id)}
                  title={`${formatDate(point.date)}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderTaskInfoColumn = (task: TaskWithHistory) => {
    const dateStatus = getTaskDateStatus(task);
    const hasReports = task.statusPoints.length > 0;

    return (
      <div className={styles.taskInfoColumn}>
        <div className={styles.taskInfoTop}>
          <div className={styles.taskInfo}>
            <h4 className={styles.taskName}>{task.name}</h4>
            <div className={styles.taskMeta}>
              {task.responsible && (
                <span className={styles.taskMetaItem}>
                  <User size={12} />
                  {task.responsible}
                </span>
              )}
            </div>
          </div>
          {hasReports && (
            <button
              className={styles.viewReportsBtn}
              onClick={() => openTaskModal(task)}
              title="View all status reports"
            >
              <ExternalLink size={14} />
            </button>
          )}
        </div>
        <div className={styles.taskBottomRow}>
          <div className={styles.taskDates}>
            <div className={styles.dateTag}>
              <span className={styles.dateLabel}>Start</span>
              <span className={styles.dateValue}>{formatDate(task.startDate)}</span>
            </div>
            <div className={`${styles.dateTag} ${dateStatus !== 'normal' ? styles[dateStatus] : ''}`}>
              <span className={styles.dateLabel}>End</span>
              <span className={styles.dateValue}>{formatDate(task.endDate)}</span>
            </div>
          </div>
          <span className={`${styles.progressBadge} ${task.isCompleted ? styles.complete : ''}`}>
            {task.progress}%
          </span>
        </div>
        {!hasReports && (
          <div className={styles.noReportsHint}>
            <Info size={14} />
            No reports
          </div>
        )}
      </div>
    );
  };

  // Popup Portal Component
  const renderPopup = () => {
    const point = getActivePoint();
    if (!popupState || !point) return null;

    return createPortal(
      <div className={styles.popupOverlay} onClick={closePopup}>
        <div
          className={styles.popupContainer}
          style={{
            left: `${popupState.x}px`,
            top: `${popupState.y}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className={styles.closePopup} onClick={closePopup}>
            <X size={14} />
          </button>
          <div className={styles.popupHeader}>
            <span className={styles.popupDate}>{formatDate(point.date)}</span>
            <span className={`${styles.popupStatus} ${styles[point.dueStatus]}`}>
              {point.dueStatus === 'overdue'
                ? 'Overdue'
                : point.dueStatus === 'warning'
                  ? 'At risk'
                  : 'On track'}
            </span>
          </div>
          <p className={styles.popupText}>{point.comment}</p>
          {point.author && <div className={styles.popupAuthor}>by {point.author}</div>}
        </div>
      </div>,
      document.body
    );
  };

  // Modal Portal Component for all reports
  const renderModal = () => {
    if (!modalState) return null;
    const { task } = modalState;

    return createPortal(
      <div className={styles.modalOverlay} onClick={closeModal}>
        <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div>
              <h2 className={styles.modalTitle}>{task.name}</h2>
              <p className={styles.modalSubtitle}>
                {task.statusPoints.length} status report{task.statusPoints.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button className={styles.modalCloseBtn} onClick={closeModal}>
              <X size={20} />
            </button>
          </div>
          <div className={styles.modalContent}>
            <div className={styles.reportsTimeline}>
              {task.statusPoints.map((point, index) => (
                <div key={point.id} className={styles.reportCard}>
                  <div className={styles.reportCardHeader}>
                    <span className={styles.reportCardDate}>{formatDate(point.date)}</span>
                    <span className={`${styles.reportCardStatus} ${styles[point.dueStatus]}`}>
                      {point.dueStatus === 'overdue'
                        ? 'Overdue'
                        : point.dueStatus === 'warning'
                          ? 'At risk'
                          : 'On track'}
                    </span>
                  </div>
                  <p className={styles.reportCardText}>{point.comment}</p>
                  {point.author && <div className={styles.reportCardAuthor}>by {point.author}</div>}
                  {index < task.statusPoints.length - 1 && <div className={styles.reportCardConnector} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (!loaded) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          Loading initiatives...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Task Status History</h1>
          <p className={styles.subtitle}>
            Track status report history for tasks based on the Implementation Plan (Actuals).
            Click on timeline points to view comments, or use the button to see all reports.
          </p>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Workstream</label>
          <select value={workstreamFilter} onChange={(e) => setWorkstreamFilter(e.target.value)}>
            <option value="all">All workstreams</option>
            {filteredWorkstreams.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name || 'Untitled workstream'}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Initiative</label>
          <select value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)}>
            <option value="all">Select an initiative...</option>
            {filteredInitiatives.map((init) => (
              <option key={init.id} value={init.id}>
                {init.name || 'Untitled initiative'}
              </option>
            ))}
          </select>
        </div>
        {initiativeFilter !== 'all' && (
          <div className={styles.filterGroup}>
            <label>
              <Filter size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Task filter
            </label>
            <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value as TaskFilter)}>
              <option value="all">All tasks ({tasksWithHistory.length})</option>
              <option value="incomplete">Incomplete ({tasksWithHistory.filter((t) => !t.isCompleted).length})</option>
              <option value="completed">Completed ({stats.completedTasks})</option>
              <option value="overdue">Overdue ({stats.overdueTasks})</option>
              <option value="with-reports">With reports ({stats.tasksWithUpdates})</option>
            </select>
          </div>
        )}
      </div>

      {initiativeFilter === 'all' ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>Select an initiative to view task history</h3>
          <p className={styles.emptyText}>
            Choose an initiative from the dropdown above to see the timeline of status reports for each task.
          </p>
        </div>
      ) : loadingReports ? (
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          Loading status reports...
        </div>
      ) : (
        <>
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalTasks}</span>
              <span className={styles.statLabel}>Total tasks</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.completedTasks}</span>
              <span className={styles.statLabel}>Completed</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.tasksWithUpdates}</span>
              <span className={styles.statLabel}>With reports</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.overdueTasks}</span>
              <span className={styles.statLabel}>Overdue</span>
            </div>
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.report}`} />
              On track
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.warning}`} />
              At risk
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.overdue}`} />
              Overdue
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.taskBarLegend}`} />
              In progress
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.taskBarCompletedLegend}`} />
              Completed
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.warningZone}`} />
              Warning (7d)
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.overdueZone}`} />
              Overdue period
            </div>
          </div>

          <div className={styles.taskListCard}>
            <div className={styles.taskListHeader}>
              <h3 className={styles.taskListTitle}>Tasks in {selectedInitiative?.name || 'this initiative'}</h3>
              <span className={styles.taskCount}>
                Showing {filteredTasks.length} of {tasksWithHistory.length} tasks
              </span>
            </div>

            {filteredTasks.length === 0 ? (
              <div className={styles.empty}>
                <h3 className={styles.emptyTitle}>No tasks match the filter</h3>
                <p className={styles.emptyText}>Try changing the filter or select a different initiative.</p>
              </div>
            ) : (
              <div className={styles.timelineSection}>
                <div className={styles.timelineGrid}>
                  <div className={styles.taskInfoHeader}>Task</div>
                  <div className={styles.timelineHeaderWrapper} ref={scrollContainerRef} onScroll={handleHeaderScroll}>
                    <div className={styles.timelineAxisHeader} style={{ width: `${timelineWidth}px` }}>
                      <div className={styles.todayMarkerHeader} style={{ left: `${todayPosition}%` }} />
                      {timelineTicks.map((tick, index) => (
                        <div
                          key={index}
                          className={styles.axisTick}
                          style={{ left: `${tick.position}%` }}
                        >
                          <div className={styles.axisTickLine} />
                          <span className={styles.axisTickLabel}>{tick.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.taskRows} ref={taskRowsContainerRef}>
                  {filteredTasks.map((task) => (
                    <div key={task.id} className={styles.taskRowWrapper}>
                      {renderTaskInfoColumn(task)}
                      <div
                        className={styles.taskTimelineWrapper}
                        data-timeline-scroll
                        onScroll={handleTaskTimelineScroll}
                      >
                        <div className={styles.taskTimelineColumn}>
                          {renderTaskTimeline(task)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {renderPopup()}
      {renderModal()}
    </div>
  );
};
