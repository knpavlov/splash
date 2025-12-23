import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, User, Folder, Info, ChevronDown, ChevronUp, X } from 'lucide-react';
import styles from '../../styles/TaskStatusHistoryScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativePlanTask, InitiativeStatusReport, InitiativeStatusReportEntry } from '../../shared/types/initiative';
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

export const TaskStatusHistoryScreen = () => {
  const { list: initiatives, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [statusReports, setStatusReports] = useState<InitiativeStatusReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [activePoint, setActivePoint] = useState<{ taskId: string; pointId: string } | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

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

  const tasksWithHistory = useMemo<TaskWithHistory[]>(() => {
    if (!selectedInitiative) return [];

    const tasks = selectedInitiative.plan.tasks.filter((task) => !task.archived);

    return tasks.map((task) => {
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

      return {
        id: task.id,
        name: task.name || 'Untitled task',
        description: task.description,
        responsible: task.responsible,
        startDate: parseDate(task.startDate),
        endDate: parseDate(task.endDate),
        progress: clampProgress(task.progress),
        statusPoints
      };
    });
  }, [selectedInitiative, statusReports]);

  const tasksWithReports = useMemo(
    () => tasksWithHistory.filter((task) => task.statusPoints.length > 0),
    [tasksWithHistory]
  );

  const stats = useMemo(() => {
    const totalTasks = tasksWithHistory.length;
    const tasksWithUpdates = tasksWithReports.length;
    const totalReports = statusReports.length;
    const overdueTasks = tasksWithHistory.filter(
      (task) => task.endDate && task.endDate < today && task.progress < 100
    ).length;

    return { totalTasks, tasksWithUpdates, totalReports, overdueTasks };
  }, [tasksWithHistory, tasksWithReports, statusReports, today]);

  const getTaskDateStatus = useCallback(
    (task: TaskWithHistory): 'normal' | 'warning' | 'overdue' => {
      if (!task.endDate) return 'normal';
      if (task.progress >= 100) return 'normal';

      const daysUntilDue = diffInDays(task.endDate, today);
      if (daysUntilDue < 0) return 'overdue';
      if (daysUntilDue <= WARNING_DAYS) return 'warning';
      return 'normal';
    },
    [today]
  );

  const toggleTaskExpanded = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handlePointClick = useCallback((taskId: string, pointId: string) => {
    setActivePoint((prev) => (prev?.taskId === taskId && prev?.pointId === pointId ? null : { taskId, pointId }));
  }, []);

  const closePopup = useCallback(() => {
    setActivePoint(null);
  }, []);

  const renderTimeline = (task: TaskWithHistory) => {
    const timelineStart = task.startDate
      ? addDays(task.startDate, -14)
      : task.statusPoints.length > 0
        ? addDays(task.statusPoints[0].date, -7)
        : addDays(today, -30);

    const timelineEnd = task.endDate
      ? addDays(task.endDate, 21)
      : task.statusPoints.length > 0
        ? addDays(task.statusPoints[task.statusPoints.length - 1].date, 14)
        : addDays(today, 30);

    const totalDays = Math.max(diffInDays(timelineEnd, timelineStart), 30);

    const getPosition = (date: Date): number => {
      const dayOffset = diffInDays(date, timelineStart);
      return Math.max(0, Math.min(100, (dayOffset / totalDays) * 100));
    };

    const taskStartPos = task.startDate ? getPosition(task.startDate) : null;
    const taskEndPos = task.endDate ? getPosition(task.endDate) : null;
    const todayPos = getPosition(today);

    const warningStartDate = task.endDate ? addDays(task.endDate, -WARNING_DAYS) : null;
    const warningStartPos = warningStartDate ? getPosition(warningStartDate) : null;

    const ticks: { date: Date; label: string }[] = [];
    const tickInterval = Math.max(7, Math.floor(totalDays / 6));
    let tickDate = new Date(timelineStart);
    while (tickDate <= timelineEnd) {
      ticks.push({ date: new Date(tickDate), label: formatShortDate(tickDate) });
      tickDate = addDays(tickDate, tickInterval);
    }

    return (
      <div className={styles.timelineContainer}>
        <div className={styles.timelineWrapper}>
          <div className={styles.timelineContent}>
            {taskStartPos !== null && taskEndPos !== null && (
              <div
                className={styles.taskDurationBar}
                style={{
                  left: `${taskStartPos}%`,
                  width: `${Math.max(taskEndPos - taskStartPos, 2)}%`
                }}
              >
                {task.progress}%
              </div>
            )}

            <div className={styles.statusZones}>
              {warningStartPos !== null && taskEndPos !== null && task.progress < 100 && (
                <>
                  <div
                    className={styles.zoneWarning}
                    style={{
                      position: 'absolute',
                      left: `${Math.max(warningStartPos, 0)}%`,
                      width: `${Math.min(taskEndPos - warningStartPos, 100 - warningStartPos)}%`
                    }}
                  />
                  {task.endDate && task.endDate < today && (
                    <div
                      className={styles.zoneOverdue}
                      style={{
                        position: 'absolute',
                        left: `${taskEndPos}%`,
                        width: `${Math.min(todayPos - taskEndPos, 100 - taskEndPos)}%`
                      }}
                    />
                  )}
                </>
              )}
            </div>

            <div className={styles.statusPoints}>
              {task.statusPoints.map((point) => {
                const pos = getPosition(point.date);
                const isActive = activePoint?.taskId === task.id && activePoint?.pointId === point.id;

                return (
                  <div
                    key={point.id}
                    className={`${styles.statusPoint} ${styles[point.dueStatus]} ${isActive ? styles.active : ''}`}
                    style={{ left: `${pos}%` }}
                    onClick={() => handlePointClick(task.id, point.id)}
                    title={`${formatDate(point.date)}: ${point.comment.slice(0, 50)}...`}
                  >
                    {isActive && (
                      <div className={styles.commentPopup} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closePopup} onClick={closePopup}>
                          <X size={14} />
                        </button>
                        <div className={styles.commentHeader}>
                          <span className={styles.commentDate}>{formatDate(point.date)}</span>
                          <span className={`${styles.commentStatus} ${styles[point.dueStatus]}`}>
                            {point.dueStatus === 'overdue'
                              ? 'Overdue'
                              : point.dueStatus === 'warning'
                                ? 'At risk'
                                : 'On track'}
                          </span>
                        </div>
                        <p className={styles.commentText}>{point.comment}</p>
                        {point.author && <div className={styles.commentAuthor}>by {point.author}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {todayPos >= 0 && todayPos <= 100 && (
              <div className={styles.todayMarker} style={{ left: `${todayPos}%` }} />
            )}
          </div>

          <div className={styles.timelineAxis}>
            <div className={styles.timelineTicks}>
              {ticks.map((tick, index) => (
                <span key={index} className={styles.timelineTick}>
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTaskItem = (task: TaskWithHistory) => {
    const dateStatus = getTaskDateStatus(task);
    const isExpanded = expandedTasks.has(task.id);
    const hasReports = task.statusPoints.length > 0;

    return (
      <div key={task.id} className={styles.taskItem}>
        <div className={styles.taskHeader}>
          <div className={styles.taskInfo}>
            <h4 className={styles.taskName}>{task.name}</h4>
            <div className={styles.taskMeta}>
              {task.responsible && (
                <span className={styles.taskMetaItem}>
                  <User size={14} />
                  {task.responsible}
                </span>
              )}
              <span className={`${styles.progressBadge} ${task.progress >= 100 ? styles.complete : ''}`}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${task.progress}%` }} />
                </div>
                {task.progress}%
              </span>
            </div>
          </div>
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
        </div>

        {hasReports ? (
          <>
            {renderTimeline(task)}

            {task.statusPoints.length > 2 && (
              <button className={styles.expandButton} onClick={() => toggleTaskExpanded(task.id)}>
                {isExpanded ? (
                  <>
                    <ChevronUp size={14} />
                    Hide all {task.statusPoints.length} status reports
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    Show all {task.statusPoints.length} status reports
                  </>
                )}
              </button>
            )}

            {isExpanded && (
              <div className={styles.reportsList}>
                <h5 className={styles.reportsTitle}>All status reports</h5>
                {task.statusPoints.map((point) => (
                  <div
                    key={point.id}
                    className={`${styles.reportItem} ${activePoint?.pointId === point.id ? styles.active : ''}`}
                    onClick={() => handlePointClick(task.id, point.id)}
                  >
                    <span className={styles.reportItemDate}>{formatDate(point.date)}</span>
                    <span className={styles.reportItemComment}>{point.comment}</span>
                    <span className={`${styles.reportStatusBadge} ${styles[point.dueStatus]}`}>
                      {point.dueStatus === 'overdue' ? 'Overdue' : point.dueStatus === 'warning' ? 'At risk' : 'On track'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={styles.noReportsHint}>
            <Info size={16} />
            No status reports submitted for this task yet
          </div>
        )}
      </div>
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
            Track the history of status reports for each task over time. Select an initiative to see timelines with
            status report points, warning periods, and overdue indicators.
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
      </div>

      {initiativeFilter === 'all' ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>Select an initiative to view task history</h3>
          <p className={styles.emptyText}>
            Choose an initiative from the dropdown above to see the timeline of status reports for each task, including
            warning and overdue periods.
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
              <span className={styles.statValue}>{stats.tasksWithUpdates}</span>
              <span className={styles.statLabel}>Tasks with reports</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalReports}</span>
              <span className={styles.statLabel}>Status reports</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.overdueTasks}</span>
              <span className={styles.statLabel}>Overdue tasks</span>
            </div>
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.report}`} />
              Status report (on track)
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.warning}`} />
              Status report (at risk)
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendDot} ${styles.overdue}`} />
              Status report (overdue)
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.taskBar}`} />
              Task duration
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.warningZone}`} />
              Warning zone (7 days)
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.overdueZone}`} />
              Overdue zone
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendLine} ${styles.today}`} />
              Today
            </div>
          </div>

          <div className={styles.taskListCard}>
            <div className={styles.taskListHeader}>
              <h3 className={styles.taskListTitle}>Tasks in {selectedInitiative?.name || 'this initiative'}</h3>
              <span className={styles.taskCount}>
                {tasksWithReports.length} of {tasksWithHistory.length} tasks have status reports
              </span>
            </div>
            <div className={styles.taskList}>
              {tasksWithHistory.length === 0 ? (
                <div className={styles.empty}>
                  <h3 className={styles.emptyTitle}>No tasks found</h3>
                  <p className={styles.emptyText}>This initiative doesn't have any tasks in its plan yet.</p>
                </div>
              ) : (
                tasksWithHistory.map((task) => renderTaskItem(task))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
