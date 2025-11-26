import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/DeadlineDashboardScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativePlanTask, InitiativeStatusReport } from '../../shared/types/initiative';
import { addDays, diffInDays, parseDate } from '../initiatives/plan/planTimeline';
import { initiativesApi } from '../initiatives/services/initiativesApi';

type BucketMode = 'week' | 'month';
type ViewMode = 'timeline' | 'status' | 'reports';
type StatusColumnKey = 'older-overdue' | 'recent-overdue' | 'completed-window' | 'upcoming' | 'starting-soon';

interface FlattenedTask {
  id: string;
  name: string;
  description: string;
  initiativeId: string;
  initiativeName: string;
  workstreamId: string;
  workstreamName: string;
  ownerName: string;
  responsible: string;
  start: Date | null;
  end: Date | null;
  progress: number;
  task: InitiativePlanTask;
}

interface StatusColumn {
  key: StatusColumnKey;
  label: string;
  tone: 'warn' | 'accent' | 'positive';
  tasks: FlattenedTask[];
  count: number;
  inProgress: number;
  avgProgress: number;
}

const formatDate = (value: Date | null) => {
  if (!value) {
    return 'Not set';
  }
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const clampProgress = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
};

const getTaskEnd = (task: InitiativePlanTask) => parseDate(task.endDate ?? task.baseline?.endDate ?? null);
const getTaskStart = (task: InitiativePlanTask) => parseDate(task.startDate ?? task.baseline?.startDate ?? null);

const startOfWeek = (value: Date) => {
  const clone = new Date(value);
  const day = (clone.getDay() + 6) % 7;
  clone.setDate(clone.getDate() - day);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const endOfWeek = (value: Date) => {
  const start = startOfWeek(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);

const useStatusReportCache = (initiativeIds: string[]) => {
  const [cache, setCache] = useState<Record<string, InitiativeStatusReport[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    initiativeIds.forEach((id) => {
      if (cache[id] || loading[id]) {
        return;
      }
      setLoading((prev) => ({ ...prev, [id]: true }));
      void initiativesApi
        .listStatusReports(id)
        .then((reports) => {
          setCache((prev) => ({ ...prev, [id]: reports }));
          setErrors((prev) => ({ ...prev, [id]: '' }));
        })
        .catch((error) => {
          console.error('Failed to load status reports', error);
          setErrors((prev) => ({ ...prev, [id]: 'load_failed' }));
        })
        .finally(() => {
          setLoading((prev) => ({ ...prev, [id]: false }));
        });
    });
  }, [initiativeIds, cache, loading]);

  return { cache, loading, errors };
};

export const DeadlineDashboardScreen = () => {
  const { list: initiatives, loaded } = useInitiativesState();
  const { list: workstreams } = useWorkstreamsState();
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [initiativeFilter, setInitiativeFilter] = useState<string>('all');
  const [bucketMode, setBucketMode] = useState<BucketMode>('week');
  const [lookbackDays, setLookbackDays] = useState(28);
  const [lookaheadDays, setLookaheadDays] = useState(28);
  const [pastWindowDays, setPastWindowDays] = useState(14);
  const [futureWindowDays, setFutureWindowDays] = useState(14);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedStatusKey, setSelectedStatusKey] = useState<StatusColumnKey>('upcoming');

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  useEffect(() => {
    if (initiativeFilter === 'all') {
      return;
    }
    const exists = initiatives.some(
      (item) => item.id === initiativeFilter && (workstreamFilter === 'all' || item.workstreamId === workstreamFilter)
    );
    if (!exists) {
      setInitiativeFilter('all');
    }
  }, [initiativeFilter, initiatives, workstreamFilter]);

  const filteredInitiatives = useMemo(
    () =>
      initiatives.filter((item) => {
        if (workstreamFilter !== 'all' && item.workstreamId !== workstreamFilter) {
          return false;
        }
        if (initiativeFilter !== 'all' && item.id !== initiativeFilter) {
          return false;
        }
        return true;
      }),
    [initiatives, workstreamFilter, initiativeFilter]
  );

  const initiativeIds = useMemo(() => filteredInitiatives.map((item) => item.id), [filteredInitiatives]);

  const workstreamNameMap = useMemo(() => new Map(workstreams.map((ws) => [ws.id, ws.name || 'Untitled workstream'])), [workstreams]);

  const tasks = useMemo<FlattenedTask[]>(() => {
    return filteredInitiatives.flatMap((initiative) =>
      initiative.plan.tasks
        .filter((task) => !task.archived)
        .map((task) => ({
          id: task.id,
          name: task.name || 'Untitled task',
          description: task.description,
          initiativeId: initiative.id,
          initiativeName: initiative.name || 'Untitled initiative',
          workstreamId: initiative.workstreamId,
          workstreamName: workstreamNameMap.get(initiative.workstreamId) ?? 'Unassigned',
          ownerName: initiative.ownerName || 'Unassigned',
          responsible: task.responsible,
          start: getTaskStart(task),
          end: getTaskEnd(task),
          progress: clampProgress(task.progress),
          task
        }))
    );
  }, [filteredInitiatives, workstreamNameMap]);

  const { cache: statusReports, loading: statusLoading } = useStatusReportCache(initiativeIds);

  const latestStatusByTask = useMemo(() => {
    const map = new Map<string, { comment: string; createdAt: string }>();
    Object.entries(statusReports).forEach(([initiativeId, reports]) => {
      (reports ?? []).forEach((report) => {
        const createdAt = new Date(report.createdAt).getTime();
        report.entries.forEach((entry) => {
          if (!entry.statusUpdate || !entry.statusUpdate.trim()) {
            return;
          }
          const key = `${initiativeId}:${entry.taskId}`;
          const existing = map.get(key);
          if (!existing || createdAt > new Date(existing.createdAt).getTime()) {
            map.set(key, { comment: entry.statusUpdate.trim(), createdAt: report.createdAt });
          }
        });
      });
    });
    return map;
  }, [statusReports]);

  const rangeStart = useMemo(() => addDays(today, -lookbackDays), [today, lookbackDays]);
  const rangeEnd = useMemo(() => addDays(today, lookaheadDays), [today, lookaheadDays]);

  const bucketed = useMemo(() => {
    const buckets: { start: Date; end: Date; label: string }[] = [];
    if (bucketMode === 'month') {
      let cursor = startOfMonth(rangeStart);
      while (cursor <= rangeEnd) {
        const bucketEnd = endOfMonth(cursor);
        buckets.push({
          start: new Date(cursor),
          end: bucketEnd,
          label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' })
        });
        cursor = new Date(bucketEnd);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      let cursor = startOfWeek(rangeStart);
      let index = 0;
      while (cursor <= rangeEnd) {
        const bucketEnd = endOfWeek(cursor);
        const label = `${cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${bucketEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        buckets.push({
          start: new Date(cursor),
          end: bucketEnd,
          label: `${index + 1}. ${label}`
        });
        cursor = new Date(bucketEnd);
        cursor.setDate(cursor.getDate() + 1);
        index += 1;
      }
    }

    const bucketStats = buckets.map((bucket) => {
      const bucketTasks = tasks.filter((task) => task.end && task.end >= bucket.start && task.end <= bucket.end);
      const completed = bucketTasks.filter((task) => task.progress >= 100).length;
      const overdue = bucketTasks.filter((task) => task.progress < 100 && task.end && task.end < today).length;
      const inProgress = bucketTasks.filter(
        (task) =>
          task.progress > 0 &&
          task.progress < 100 &&
          (!task.end || task.end >= today)
      ).length;
      const total = completed + overdue + inProgress;
      return { bucket, completed, overdue, inProgress, total };
    });
    const max = bucketStats.reduce((acc, item) => Math.max(acc, item.total), 0);
    return { buckets: bucketStats, max };
  }, [bucketMode, rangeStart, rangeEnd, tasks, today]);

  const statusColumns = useMemo<StatusColumn[]>(() => {
    const pastWindowStart = addDays(today, -pastWindowDays);
    const futureWindowEnd = addDays(today, futureWindowDays);

    const olderOverdue = tasks.filter((task) => task.end && task.end < pastWindowStart && task.progress < 100);
    const recentOverdue = tasks.filter(
      (task) => task.end && task.end >= pastWindowStart && task.end < today && task.progress < 100
    );
    const completedWindow = tasks.filter(
      (task) => task.end && task.end >= pastWindowStart && task.end <= today && task.progress >= 100
    );
    const upcoming = tasks.filter(
      (task) => task.progress < 100 && task.end && task.end > today && task.end <= futureWindowEnd
    );
    const startingSoon = tasks.filter(
      (task) => task.progress < 100 && task.start && task.start >= today && task.start <= futureWindowEnd
    );

    const buildColumn = (key: StatusColumnKey, label: string, tone: StatusColumn['tone'], subset: FlattenedTask[]): StatusColumn => {
      const inProgress = subset.filter((task) => task.progress > 0 && task.progress < 100).length;
      const avgProgress = subset.length
        ? Math.round(subset.reduce((acc, task) => acc + task.progress, 0) / subset.length)
        : 0;
      return { key, label, tone, tasks: subset, count: subset.length, inProgress, avgProgress };
    };

    return [
      buildColumn('older-overdue', `Overdue before ${pastWindowDays}d`, 'warn', olderOverdue),
      buildColumn('recent-overdue', `Overdue last ${pastWindowDays}d`, 'warn', recentOverdue),
      buildColumn('completed-window', `Completed last ${pastWindowDays}d`, 'positive', completedWindow),
      buildColumn('upcoming', `Deadlines next ${futureWindowDays}d`, 'accent', upcoming),
      buildColumn('starting-soon', `Starts next ${futureWindowDays}d`, 'accent', startingSoon)
    ];
  }, [tasks, today, pastWindowDays, futureWindowDays]);

  const statusMax = useMemo(() => statusColumns.reduce((acc, col) => Math.max(acc, col.count), 0), [statusColumns]);

  const timelineRows = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.start && task.end) {
          return task.start <= rangeEnd && task.end >= rangeStart;
        }
        if (task.end) {
          return task.end >= rangeStart && task.end <= rangeEnd;
        }
        if (task.start) {
          return task.start >= rangeStart && task.start <= rangeEnd;
        }
        return false;
      }),
    [tasks, rangeEnd, rangeStart]
  );

  const statusFocusTasks = useMemo(() => statusColumns.find((col) => col.key === selectedStatusKey)?.tasks ?? [], [statusColumns, selectedStatusKey]);
  const reportTasks = useMemo(() => tasks.filter((task) => latestStatusByTask.has(`${task.initiativeId}:${task.id}`)), [tasks, latestStatusByTask]);

  const rows = useMemo(() => {
    if (viewMode === 'status') {
      return statusFocusTasks;
    }
    if (viewMode === 'reports') {
      return reportTasks;
    }
    return timelineRows;
  }, [viewMode, timelineRows, statusFocusTasks, reportTasks]);

  const formatOverdue = (task: FlattenedTask) => {
    if (!task.end || task.progress >= 100) {
      return 0;
    }
    const diff = diffInDays(task.end, today);
    return Math.max(0, diff);
  };

  const renderTable = () => {
    if (!rows.length) {
      return <div className={styles.empty}>No tasks match the current filters.</div>;
    }
    return (
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>
            {viewMode === 'timeline' && 'Tasks inside selected timeline window'}
            {viewMode === 'status' && 'Tasks from the focused status column'}
            {viewMode === 'reports' && 'Tasks with submitted status reports'}
          </h3>
          <div className={styles.hint}>
            Showing {rows.length} task{rows.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Workstream</th>
                <th>Initiative</th>
                <th>Owner</th>
                <th>Task</th>
                <th>Responsible</th>
                <th>Start</th>
                <th>End</th>
                <th>Overdue, d</th>
                <th>Progress</th>
                <th>Latest status report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const statusKey = `${row.initiativeId}:${row.id}`;
                const latestStatus = latestStatusByTask.get(statusKey);
                return (
                  <tr key={`${row.initiativeId}:${row.id}`}>
                    <td>{row.workstreamName}</td>
                    <td>{row.initiativeName}</td>
                    <td>{row.ownerName || <span className={styles.muted}>No owner</span>}</td>
                    <td title={`${row.name}\n\n${row.description || 'No description'}`}>{row.name}</td>
                    <td>{row.responsible || <span className={styles.muted}>Not assigned</span>}</td>
                    <td>{formatDate(row.start)}</td>
                    <td>{formatDate(row.end)}</td>
                    <td>{formatOverdue(row)}</td>
                    <td>
                      <div className={styles.progressCell}>
                        <span className={styles.muted}>{row.progress}%</span>
                        <div className={styles.progressBar} aria-hidden>
                          <div className={styles.progressFill} style={{ width: `${row.progress}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      {latestStatus ? (
                        <div className={styles.comment}>
                          <div>{latestStatus.comment}</div>
                          <div className={styles.commentDate}>
                            {new Date(latestStatus.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                      ) : (
                        <span className={styles.muted}>No status report yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const loadingReports = useMemo(
    () =>
      filteredInitiatives.some((item) => statusLoading[item.id]) &&
      !Object.keys(statusReports).some((key) => (statusReports[key] ?? []).length > 0),
    [filteredInitiatives, statusLoading, statusReports]
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Deadline radar</h1>
          <p className={styles.subtitle}>
            Быстрый обзор приближающихся дедлайнов, просроченных инициатив и последних статус-отчетов.
          </p>
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.barSegment} ${styles.progress}`} />
            In progress
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.barSegment} ${styles.completed}`} />
            Completed
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendSwatch} ${styles.barSegment} ${styles.overdue}`} />
            Overdue
          </span>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Workstream</label>
          <select value={workstreamFilter} onChange={(event) => setWorkstreamFilter(event.target.value)}>
            <option value="all">All workstreams</option>
            {workstreams.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name || 'Untitled workstream'}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Initiative</label>
          <select value={initiativeFilter} onChange={(event) => setInitiativeFilter(event.target.value)}>
            <option value="all">All initiatives</option>
            {filteredInitiatives.map((initiative) => (
              <option key={initiative.id} value={initiative.id}>
                {initiative.name || 'Untitled initiative'}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Timeline window</label>
          <div className={styles.segmented}>
            {[14, 28, 56].map((days) => (
              <button
                key={`back-${days}`}
                className={lookbackDays === days ? styles.active : undefined}
                onClick={() => setLookbackDays(days)}
              >
                {days / 7}w back
              </button>
            ))}
            {[14, 28, 56].map((days) => (
              <button
                key={`ahead-${days}`}
                className={lookaheadDays === days ? styles.active : undefined}
                onClick={() => setLookaheadDays(days)}
              >
                +{days / 7}w
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <label>Bucket</label>
          <div className={styles.segmented}>
            <button className={bucketMode === 'week' ? styles.active : undefined} onClick={() => setBucketMode('week')}>
              Weekly
            </button>
            <button
              className={bucketMode === 'month' ? styles.active : undefined}
              onClick={() => setBucketMode('month')}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className={styles.filterGroup}>
          <label>Past window</label>
          <select value={pastWindowDays} onChange={(event) => setPastWindowDays(Number(event.target.value))}>
            {[7, 14, 28].map((days) => (
              <option key={days} value={days}>
                Past {days} days
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Future window</label>
          <select value={futureWindowDays} onChange={(event) => setFutureWindowDays(Number(event.target.value))}>
            {[7, 14, 28].map((days) => (
              <option key={days} value={days}>
                Next {days} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Timeline of deadlines</h3>
              <p className={styles.helper}>История и будущие дедлайны в выбранном окне. Кликните на статус, чтобы сузить выбор.</p>
            </div>
            <div className={styles.chips}>
              <span className={styles.chip}>{bucketMode === 'week' ? 'Weekly buckets' : 'Monthly buckets'}</span>
              <span className={styles.chip}>
                Window: {lookbackDays}d back / +{lookaheadDays}d
              </span>
            </div>
          </div>
          <div className={styles.barChart}>
            <div className={styles.barArea}>
              {bucketed.buckets.map(({ bucket, completed, overdue, inProgress, total }) => {
                const height = bucketed.max ? Math.max(6, Math.round((total / bucketed.max) * 100)) : 0;
                const completedHeight = total ? Math.round((completed / total) * height) : 0;
                const overdueHeight = total ? Math.round((overdue / total) * height) : 0;
                const progressHeight = total ? Math.max(0, height - completedHeight - overdueHeight) : 0;
                return (
                  <div key={bucket.label} className={styles.bar}>
                    <div className={styles.barStack} title={`${bucket.label}\nTotal: ${total}`}>
                      {overdueHeight > 0 && (
                        <div
                          className={`${styles.barSegment} ${styles.overdue}`}
                          style={{ height: `${overdueHeight}%` }}
                          title="Overdue"
                        />
                      )}
                      {completedHeight > 0 && (
                        <div
                          className={`${styles.barSegment} ${styles.completed}`}
                          style={{ height: `${completedHeight}%` }}
                          title="Completed"
                        />
                      )}
                      {progressHeight > 0 && (
                        <div
                          className={`${styles.barSegment} ${styles.progress}`}
                          style={{ height: `${progressHeight}%` }}
                          title="In progress"
                        />
                      )}
                    </div>
                    <div className={styles.barValue}>{total}</div>
                    <div className={styles.barLabel}>{bucket.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Current status spotlight</h3>
              <p className={styles.helper}>Переходите между периодами, чтобы понять, что горит, что сделано и что стартует.</p>
            </div>
          </div>
          <div className={styles.statusChart}>
            <div className={styles.statusColumns}>
              {statusColumns.map((column) => {
                const height = statusMax ? Math.max(4, Math.round((column.count / statusMax) * 100)) : 0;
                return (
                  <div key={column.key} className={styles.statusColumn}>
                    <div className={styles.statusBadges}>
                      <span className={`${styles.badge} ${styles.badgeAccent}`}>{column.inProgress} in progress</span>
                      <span className={styles.badge}>Avg {column.avgProgress}%</span>
                    </div>
                    <div
                      className={`${styles.statusBar} ${selectedStatusKey === column.key ? styles.statusActive : ''}`}
                      onClick={() => {
                        setSelectedStatusKey(column.key);
                        setViewMode('status');
                      }}
                      title={`${column.label}\nTasks: ${column.count}`}
                    >
                      <div
                        className={`${styles.statusFill} ${
                          column.tone === 'positive' ? styles.positive : column.tone === 'warn' ? styles.warn : styles.accent
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <div className={styles.statusLabel}>{column.label}</div>
                    <div className={styles.statusMeta}>{column.count} задач</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.viewSwitch}>
          <button
            className={`${styles.pillButton} ${viewMode === 'timeline' ? styles.active : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            Фокус на периоде таймлайна
          </button>
          <button
            className={`${styles.pillButton} ${viewMode === 'status' ? styles.active : ''}`}
            onClick={() => setViewMode('status')}
          >
            Фокус на статусной колонке
          </button>
          <button
            className={`${styles.pillButton} ${viewMode === 'reports' ? styles.active : ''}`}
            onClick={() => setViewMode('reports')}
          >
            Фокус на статус-репортах
          </button>
        </div>
        {loadingReports && <div className={styles.loading}>Загружаем последние status reports…</div>}
      </div>

      {loaded ? renderTable() : <div className={styles.empty}>Loading initiatives…</div>}
    </div>
  );
};
