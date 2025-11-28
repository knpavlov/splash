import { MouseEvent, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/DeadlineDashboardScreen.module.css';
import { useInitiativesState, useWorkstreamsState } from '../../app/state/AppStateContext';
import { InitiativePlanTask, InitiativeStatusReport } from '../../shared/types/initiative';
import { addDays, diffInDays, parseDate } from '../initiatives/plan/planTimeline';
import { initiativesApi } from '../initiatives/services/initiativesApi';

type BucketMode = 'week' | 'month';
type ViewMode = 'chart' | 'reports';
type StatusColumnKey = 'older-overdue' | 'recent-overdue' | 'completed-window' | 'upcoming' | 'starting-soon';
type ChartSelection =
  | { type: 'timeline'; keys: string[] }
  | { type: 'status'; keys: StatusColumnKey[] }
  | { type: 'none'; keys: [] };

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

interface BucketStat {
  bucket: { start: Date; end: Date; label: string; id: string };
  completed: number;
  overdue: number;
  inProgress: number;
  total: number;
  tasks: FlattenedTask[];
}

const formatDate = (value: Date | null) => {
  if (!value) {
    return 'Not set';
  }
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatInputDate = (value: Date) => value.toISOString().slice(0, 10);

const parseInputDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatRangeLabel = (start: Date, end: Date) =>
  `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

const dedupeTasks = (items: FlattenedTask[]) => {
  const map = new Map<string, FlattenedTask>();
  items.forEach((task) => {
    map.set(task.id, task);
  });
  return Array.from(map.values());
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
  const [initiativeQuery, setInitiativeQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [bucketMode, setBucketMode] = useState<BucketMode>('week');
  const [pastWindowDays, setPastWindowDays] = useState(14);
  const [futureWindowDays, setFutureWindowDays] = useState(14);
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [chartSelection, setChartSelection] = useState<ChartSelection>({ type: 'none', keys: [] });
  const [reportSelection, setReportSelection] = useState<{ initiativeId: 'latest' | string; reportId: 'latest' | string }>({
    initiativeId: 'latest',
    reportId: 'latest'
  });

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const defaultRangeStart = useMemo(() => addDays(today, -28), [today]);
  const defaultRangeEnd = useMemo(() => addDays(today, 56), [today]);
  const [rangeStartInput, setRangeStartInput] = useState(formatInputDate(defaultRangeStart));
  const [rangeEndInput, setRangeEndInput] = useState(formatInputDate(defaultRangeEnd));

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

  const allTasks = useMemo<FlattenedTask[]>(() => {
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

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach((task) => set.add(task.ownerName || 'Unassigned'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  const responsibleOptions = useMemo(() => {
    const set = new Set<string>();
    allTasks.forEach((task) => set.add(task.responsible || 'Unassigned'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  const tasks = useMemo<FlattenedTask[]>(() => {
    return allTasks.filter((task) => {
      const owner = task.ownerName || 'Unassigned';
      const responsible = task.responsible || 'Unassigned';
      if (ownerFilter !== 'all' && owner !== ownerFilter) {
        return false;
      }
      if (responsibleFilter !== 'all' && responsible !== responsibleFilter) {
        return false;
      }
      return true;
    });
  }, [allTasks, ownerFilter, responsibleFilter]);

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

  const { rangeStart, rangeEnd } = useMemo(() => {
    const start = parseInputDate(rangeStartInput) ?? defaultRangeStart;
    const end = parseInputDate(rangeEndInput) ?? defaultRangeEnd;
    if (start <= end) {
      return { rangeStart: start, rangeEnd: end };
    }
    return { rangeStart: end, rangeEnd: start };
  }, [defaultRangeEnd, defaultRangeStart, rangeEndInput, rangeStartInput]);

  const initiativeOptions = useMemo(
    () =>
      initiatives.filter((item) => {
        if (workstreamFilter !== 'all' && item.workstreamId !== workstreamFilter) {
          return false;
        }
        if (initiativeQuery.trim()) {
          return (item.name || 'Untitled initiative').toLowerCase().includes(initiativeQuery.trim().toLowerCase());
        }
        return true;
      }),
    [initiatives, initiativeQuery, workstreamFilter]
  );

  const bucketed = useMemo(() => {
    const buckets: { start: Date; end: Date; label: string; id: string }[] = [];
    if (bucketMode === 'month') {
      let cursor = startOfMonth(rangeStart);
      while (cursor <= rangeEnd) {
        const bucketEnd = endOfMonth(cursor);
        buckets.push({
          start: new Date(cursor),
          end: bucketEnd,
          label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          id: `${cursor.toISOString()}-${bucketEnd.toISOString()}`
        });
        cursor = new Date(bucketEnd);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      let cursor = startOfWeek(rangeStart);
      while (cursor <= rangeEnd) {
        const bucketEnd = endOfWeek(cursor);
        buckets.push({
          start: new Date(cursor),
          end: bucketEnd,
          label: formatRangeLabel(cursor, bucketEnd),
          id: `${cursor.toISOString()}-${bucketEnd.toISOString()}`
        });
        cursor = new Date(bucketEnd);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const bucketStats: BucketStat[] = buckets.map((bucket) => {
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
      return { bucket, completed, overdue, inProgress, total, tasks: bucketTasks };
    });
    const max = bucketStats.reduce((acc, item) => Math.max(acc, item.total), 0);
    return { buckets: bucketStats, max };
  }, [bucketMode, rangeEnd, rangeStart, tasks, today]);

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
      buildColumn('older-overdue', `Overdue earlier than ${pastWindowDays}d ago`, 'warn', olderOverdue),
      buildColumn('recent-overdue', `Overdue in last ${pastWindowDays}d`, 'warn', recentOverdue),
      buildColumn('completed-window', `Completed in last ${pastWindowDays}d`, 'positive', completedWindow),
      buildColumn('upcoming', `Deadlines in next ${futureWindowDays}d`, 'accent', upcoming),
      buildColumn('starting-soon', `Starts in next ${futureWindowDays}d`, 'accent', startingSoon)
    ];
  }, [futureWindowDays, pastWindowDays, tasks, today]);

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
    [rangeEnd, rangeStart, tasks]
  );

  const chartRows = useMemo(() => {
    if (chartSelection.type === 'timeline') {
      const selectedBuckets = bucketed.buckets.filter((bucket) => chartSelection.keys.includes(bucket.bucket.id));
      if (selectedBuckets.length) {
        return dedupeTasks(selectedBuckets.flatMap((bucket) => bucket.tasks));
      }
    }
    if (chartSelection.type === 'status') {
      const selectedColumns = statusColumns.filter((column) => chartSelection.keys.includes(column.key));
      if (selectedColumns.length) {
        return dedupeTasks(selectedColumns.flatMap((column) => column.tasks));
      }
    }
    return timelineRows;
  }, [bucketed.buckets, chartSelection, statusColumns, timelineRows]);

  const sortedReports = useMemo(() => {
    const map = new Map<string, InitiativeStatusReport[]>();
    Object.entries(statusReports).forEach(([initiativeId, reports]) => {
      const sorted = [...(reports ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      map.set(initiativeId, sorted);
    });
    return map;
  }, [statusReports]);

  useEffect(() => {
    if (reportSelection.initiativeId === 'latest') {
      if (reportSelection.reportId !== 'latest') {
        setReportSelection({ initiativeId: 'latest', reportId: 'latest' });
      }
      return;
    }
    const reports = sortedReports.get(reportSelection.initiativeId) ?? [];
    if (!reports.length) {
      setReportSelection({ initiativeId: 'latest', reportId: 'latest' });
      return;
    }
    if (reportSelection.reportId !== 'latest' && !reports.some((report) => report.id === reportSelection.reportId)) {
      setReportSelection((prev) => ({ ...prev, reportId: 'latest' }));
    }
  }, [reportSelection, sortedReports]);

  const reportStatusByTask = useMemo(() => {
    if (reportSelection.initiativeId === 'latest') {
      return latestStatusByTask;
    }
    const reports = sortedReports.get(reportSelection.initiativeId) ?? [];
    const target =
      reportSelection.reportId === 'latest'
        ? reports[0]
        : reports.find((report) => report.id === reportSelection.reportId);
    const map = new Map<string, { comment: string; createdAt: string }>();
    if (!target) {
      return map;
    }
    target.entries.forEach((entry) => {
      if (!entry.statusUpdate || !entry.statusUpdate.trim()) {
        return;
      }
      map.set(`${reportSelection.initiativeId}:${entry.taskId}`, { comment: entry.statusUpdate.trim(), createdAt: target.createdAt });
    });
    return map;
  }, [latestStatusByTask, reportSelection, sortedReports]);

  const reportRows = useMemo(() => {
    if (reportSelection.initiativeId === 'latest') {
      return tasks.filter((task) => latestStatusByTask.has(`${task.initiativeId}:${task.id}`));
    }
    return tasks.filter((task) => reportStatusByTask.has(`${task.initiativeId}:${task.id}`));
  }, [latestStatusByTask, reportSelection, reportStatusByTask, tasks]);

  const rows = useMemo(() => (viewMode === 'reports' ? reportRows : chartRows), [chartRows, reportRows, viewMode]);

  const formatOverdue = (task: FlattenedTask) => {
    if (!task.end || task.progress >= 100) {
      return 0;
    }
    const diff = diffInDays(task.end, today);
    return Math.max(0, diff);
  };

  const renderTable = (activeStatusLookup: Map<string, { comment: string; createdAt: string }>) => {
    if (!rows.length) {
      return <div className={styles.empty}>No tasks match the current filters.</div>;
    }
    const isTimelineSelection = chartSelection.type === 'timeline' && chartSelection.keys.length > 0;
    const isStatusSelection = chartSelection.type === 'status' && chartSelection.keys.length > 0;
    const tableTitle =
      viewMode === 'reports'
        ? reportSelection.initiativeId === 'latest'
          ? 'Tasks with submitted status reports (latest available)'
          : reportSelection.reportId === 'latest'
            ? 'Latest status report for the selected initiative'
            : 'Historical status report for the selected initiative'
        : isTimelineSelection
          ? 'Tasks inside selected timeline buckets'
          : isStatusSelection
            ? 'Tasks inside selected status columns'
            : 'Tasks inside the current date range';

    return (
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>{tableTitle}</h3>
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
                const latestStatus = activeStatusLookup.get(statusKey);
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
                              day: 'numeric',
                              year: 'numeric'
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

  const reportInitiativeOptions = useMemo(() => {
    const options = Object.keys(statusReports)
      .filter((id) => (statusReports[id] ?? []).length > 0)
      .map((id) => ({
        id,
        name: initiatives.find((item) => item.id === id)?.name || 'Untitled initiative'
      }));
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [initiatives, statusReports]);

  const reportsForSelectedInitiative = useMemo(() => {
    if (reportSelection.initiativeId === 'latest') {
      return [];
    }
    return sortedReports.get(reportSelection.initiativeId) ?? [];
  }, [reportSelection.initiativeId, sortedReports]);

  const clearChartSelection = () => setChartSelection({ type: 'none', keys: [] });

  const toggleTimelineBucket = (bucketId: string, multiSelect: boolean) => {
    setViewMode('chart');
    setChartSelection((prev) => {
      if (prev.type !== 'timeline' || !multiSelect) {
        return { type: 'timeline', keys: [bucketId] };
      }
      const alreadySelected = prev.keys.includes(bucketId);
      const nextKeys = alreadySelected ? prev.keys.filter((key) => key !== bucketId) : [...prev.keys, bucketId];
      return { type: 'timeline', keys: nextKeys };
    });
  };

  const toggleStatusColumn = (columnKey: StatusColumnKey, multiSelect: boolean) => {
    setViewMode('chart');
    setChartSelection((prev) => {
      if (prev.type !== 'status' || !multiSelect) {
        return { type: 'status', keys: [columnKey] };
      }
      const alreadySelected = prev.keys.includes(columnKey);
      const nextKeys = alreadySelected ? prev.keys.filter((key) => key !== columnKey) : [...prev.keys, columnKey];
      return { type: 'status', keys: nextKeys };
    });
  };

  const activeStatusLookup = useMemo(
    () => (viewMode === 'reports' ? reportStatusByTask : latestStatusByTask),
    [latestStatusByTask, reportStatusByTask, viewMode]
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Deadline radar</h1>
          <p className={styles.subtitle}>
            Track deadline risk across initiatives, drill into buckets, and keep the freshest status reports close by.
          </p>
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
          <input
            className={styles.filterSearch}
            placeholder="Search initiatives"
            type="search"
            value={initiativeQuery}
            onChange={(event) => setInitiativeQuery(event.target.value)}
          />
          <select value={initiativeFilter} onChange={(event) => setInitiativeFilter(event.target.value)}>
            <option value="all">All initiatives</option>
            {initiativeOptions.map((initiative) => (
              <option key={initiative.id} value={initiative.id}>
                {initiative.name || 'Untitled initiative'}
              </option>
            ))}
            {initiativeFilter !== 'all' &&
              !initiativeOptions.some((initiative) => initiative.id === initiativeFilter) && (
              <option value={initiativeFilter}>Selected initiative (filtered by search)</option>
            )}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Owner</label>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All owners</option>
            {ownerOptions.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Responsible</label>
          <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
            <option value="all">All responsible</option>
            {responsibleOptions.map((person) => (
              <option key={person} value={person}>
                {person}
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
              <p className={styles.helper}>Click a bar to open its tasks and focus the table. Hold Ctrl/Cmd to multi-select buckets when things get dense.</p>
            </div>
            <div className={styles.chartControls}>
              <div className={styles.inlineField}>
                <label>From</label>
                <input
                  type="date"
                  value={rangeStartInput}
                  onChange={(event) => setRangeStartInput(event.target.value)}
                />
              </div>
              <div className={styles.inlineField}>
                <label>To</label>
                <input
                  type="date"
                  value={rangeEndInput}
                  onChange={(event) => setRangeEndInput(event.target.value)}
                />
              </div>
              <div className={styles.inlineField}>
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
            </div>
          </div>
          <div className={styles.legendRow}>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendProgress}`} />
                In progress
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendCompleted}`} />
                Completed
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendOverdue}`} />
                Overdue
              </span>
            </div>
          </div>
          <div className={styles.barChart}>
            <div className={styles.barScroll}>
              <div
                className={styles.barArea}
                style={{ minWidth: `${Math.max(bucketed.buckets.length * 70, 520)}px` }}
              >
                {bucketed.buckets.map(({ bucket, completed, overdue, total }) => {
                  const isActive = chartSelection.type === 'timeline' && chartSelection.keys.includes(bucket.id);
                  const height = bucketed.max ? Math.max(6, Math.round((total / bucketed.max) * 100)) : 0;
                  const completedHeight = total ? Math.round((completed / total) * height) : 0;
                  const overdueHeight = total ? Math.round((overdue / total) * height) : 0;
                  const progressHeight = total ? Math.max(0, height - completedHeight - overdueHeight) : 0;
                  return (
                    <div
                      key={bucket.id}
                      className={`${styles.bar} ${isActive ? styles.barActive : ''}`}
                      onClick={(event: MouseEvent<HTMLDivElement>) => toggleTimelineBucket(bucket.id, event.ctrlKey || event.metaKey)}
                      title={`${bucket.label}\nTotal: ${total}`}
                    >
                      <div className={styles.barValueTop}>{total}</div>
                      <div className={styles.barBody}>
                        <div className={styles.barStack}>
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
                        <div className={styles.barLabel}>{bucket.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>Current status spotlight</h3>
              <p className={styles.helper}>Click a column to see the underlying tasks. Hold Ctrl/Cmd to select more than one status column.</p>
            </div>
            <div className={styles.chartControls}>
              <div className={styles.inlineField}>
                <label>Past window</label>
                <select value={pastWindowDays} onChange={(event) => setPastWindowDays(Number(event.target.value))}>
                  {[7, 14, 28].map((days) => (
                    <option key={days} value={days}>
                      Past {days} days
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.inlineField}>
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
          </div>
          <div className={styles.statusChart}>
            <div className={styles.statusScroll}>
              <div className={styles.statusColumns}>
                {statusColumns.map((column) => {
                  const height = statusMax ? Math.max(4, Math.round((column.count / statusMax) * 100)) : 0;
                  const isActive = chartSelection.type === 'status' && chartSelection.keys.includes(column.key);
                  return (
                    <div key={column.key} className={styles.statusColumn}>
                      <div className={styles.statusMetaRow}>
                        <span className={styles.statusTotal}>{column.count} tasks</span>
                        <div className={styles.statusBadges}>
                          <span className={`${styles.badge} ${styles.badgeAccent}`}>{column.inProgress} in progress</span>
                          <span className={styles.badge}>Avg {column.avgProgress}%</span>
                        </div>
                      </div>
                      <div
                        className={`${styles.statusBar} ${isActive ? styles.statusActive : ''}`}
                        onClick={(event: MouseEvent<HTMLDivElement>) => toggleStatusColumn(column.key, event.ctrlKey || event.metaKey)}
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.viewSwitch}>
          <button
            className={`${styles.pillButton} ${viewMode === 'chart' ? styles.active : ''}`}
            onClick={() => setViewMode('chart')}
          >
            Focus on charts
          </button>
          <button
            className={`${styles.pillButton} ${viewMode === 'reports' ? styles.active : ''}`}
            onClick={() => setViewMode('reports')}
          >
            Focus on status reports
          </button>
          <button className={`${styles.pillButton} ${styles.secondary}`} onClick={clearChartSelection} disabled={chartSelection.keys.length === 0}>
            Clear chart selection
          </button>
        </div>
        {viewMode === 'reports' && (
          <div className={styles.reportFilters}>
            <div className={styles.filterGroup}>
              <label>Report scope</label>
              <select
                value={reportSelection.initiativeId}
                onChange={(event) =>
                  setReportSelection({
                    initiativeId: event.target.value,
                    reportId: 'latest'
                  })
                }
              >
                <option value="latest">Latest across all initiatives</option>
                {reportInitiativeOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterGroup}>
              <label>Pick report</label>
              <select
                value={reportSelection.reportId}
                onChange={(event) =>
                  setReportSelection((prev) => ({
                    ...prev,
                    reportId: event.target.value
                  }))
                }
                disabled={reportSelection.initiativeId === 'latest' || reportsForSelectedInitiative.length === 0}
              >
                <option value="latest">Latest for this initiative</option>
                {reportsForSelectedInitiative.map((report) => (
                  <option key={report.id} value={report.id}>
                    {new Date(report.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                    {report.summary ? ` - ${report.summary}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {loadingReports && viewMode === 'reports' && <div className={styles.loading}>Loading status reports...</div>}
      </div>

      {loaded ? renderTable(activeStatusLookup) : <div className={styles.empty}>Loading initiatives...</div>}
    </div>
  );
};


