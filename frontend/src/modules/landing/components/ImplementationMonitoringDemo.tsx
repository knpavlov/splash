import { useCallback, useMemo, useState } from 'react';
import styles from './ImplementationMonitoringDemo.module.css';
import { addDays, diffInDays } from '../../initiatives/plan/planTimeline';

type DemoWorkstream = { id: string; name: string; color: string };
type DemoInitiative = { id: string; name: string; ownerName: string; workstreamId: string };
type DemoTask = {
  id: string;
  initiativeId: string;
  name: string;
  responsible: string;
  start: Date;
  end: Date;
  progress: number;
  statusUpdate: string;
};

type SubmittedTaskUpdate = { end: Date; progress: number; statusUpdate: string };

type SubmittedReport = {
  id: string;
  initiativeId: string;
  createdAt: Date;
  summary: string;
  taskUpdates: Record<string, SubmittedTaskUpdate>;
};

type BucketMode = 'week' | 'month';
type ViewMode = 'chart' | 'reports';
type StatusKey = 'overdue' | 'due-soon' | 'upcoming' | 'completed';

const startOfDay = (value: Date) => {
  const clone = new Date(value);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const formatInputDate = (value: Date) => value.toISOString().slice(0, 10);

const parseInputDate = (value: string, fallback: Date) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const formatRangeLabel = (start: Date, end: Date) =>
  `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })}`;

const formatDueLabel = (days: number | null) => {
  if (days === null) return 'No end date';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
};

const statusTone = (status: StatusKey) => {
  switch (status) {
    case 'overdue':
      return 'negative';
    case 'due-soon':
      return 'warning';
    case 'completed':
      return 'positive';
    default:
      return 'muted';
  }
};

const getTaskStatus = (task: DemoTask, today: Date): StatusKey => {
  if (task.progress >= 100) return 'completed';
  const days = diffInDays(today, task.end);
  if (days < 0) return 'overdue';
  if (days <= 14) return 'due-soon';
  return 'upcoming';
};

const buildBuckets = (today: Date, mode: BucketMode) => {
  const buckets: { id: string; start: Date; end: Date; label: string }[] = [];
  const windowCount = mode === 'week' ? 6 : 4;
  const spanDays = mode === 'week' ? 7 : 30;

  for (let i = 0; i < windowCount; i += 1) {
    const start = addDays(today, i * spanDays);
    const end = addDays(today, i * spanDays + (spanDays - 1));
    buckets.push({
      id: `${mode}-${i}`,
      start,
      end,
      label: mode === 'week' ? formatRangeLabel(start, end) : start.toLocaleDateString('en-US', { month: 'short' })
    });
  }

  return buckets;
};

const bucketForTask = (taskEnd: Date, today: Date, buckets: { start: Date; end: Date; id: string }[]) => {
  if (taskEnd.getTime() < today.getTime()) {
    return 'past';
  }
  const match = buckets.find((b) => taskEnd.getTime() >= b.start.getTime() && taskEnd.getTime() <= b.end.getTime());
  return match?.id ?? 'later';
};

export const ImplementationMonitoringDemo = ({ className }: { className?: string }) => {
  const today = useMemo(() => startOfDay(new Date()), []);
  const reportWindow = useMemo(() => ({ start: today, end: addDays(today, 6) }), [today]);

  const { workstreams, initiatives, baselineTasks } = useMemo(() => {
    const workstreams: DemoWorkstream[] = [
      { id: 'ws-digital', name: 'Digital', color: '#8b5cf6' },
      { id: 'ws-ops', name: 'Operations', color: '#3b82f6' },
      { id: 'ws-cx', name: 'Customer', color: '#22d3ee' }
    ];

    const initiatives: DemoInitiative[] = [
      { id: 'init-1', name: 'Customer 360 Rollout', ownerName: 'M. Chen', workstreamId: 'ws-digital' },
      { id: 'init-2', name: 'Warehouse Automation', ownerName: 'A. Rivera', workstreamId: 'ws-ops' },
      { id: 'init-3', name: 'Self-Service Portal', ownerName: 'S. Patel', workstreamId: 'ws-cx' }
    ];

    const baselineTasks: DemoTask[] = [
      {
        id: 't-1',
        initiativeId: 'init-1',
        name: 'Data model alignment',
        responsible: 'J. Kim',
        start: addDays(today, -18),
        end: addDays(today, -3),
        progress: 85,
        statusUpdate: 'ETL mappings reviewed; blocked by final CRM field list.'
      },
      {
        id: 't-2',
        initiativeId: 'init-1',
        name: 'CRM integration sprint',
        responsible: 'D. Brooks',
        start: addDays(today, -10),
        end: addDays(today, 9),
        progress: 55,
        statusUpdate: 'API contract signed off; building sync jobs and retries.'
      },
      {
        id: 't-3',
        initiativeId: 'init-1',
        name: 'Pilot enablement',
        responsible: 'L. Novak',
        start: addDays(today, 4),
        end: addDays(today, 28),
        progress: 10,
        statusUpdate: 'Pilot plan drafted; onboarding sessions scheduled.'
      },
      {
        id: 't-4',
        initiativeId: 'init-2',
        name: 'Robot layout design',
        responsible: 'K. Ochoa',
        start: addDays(today, -14),
        end: addDays(today, 6),
        progress: 70,
        statusUpdate: 'Layout v2 shared; validating safety zones with ops.'
      },
      {
        id: 't-5',
        initiativeId: 'init-2',
        name: 'Vendor commissioning',
        responsible: 'P. Hughes',
        start: addDays(today, 1),
        end: addDays(today, 19),
        progress: 25,
        statusUpdate: 'Hardware shipment confirmed; commissioning checklist ready.'
      },
      {
        id: 't-6',
        initiativeId: 'init-2',
        name: 'Training & SOPs',
        responsible: 'N. Silva',
        start: addDays(today, 7),
        end: addDays(today, 36),
        progress: 0,
        statusUpdate: 'Draft SOPs in review; training slots held for supervisors.'
      },
      {
        id: 't-7',
        initiativeId: 'init-3',
        name: 'MVP scope lock',
        responsible: 'E. Wright',
        start: addDays(today, -12),
        end: addDays(today, 2),
        progress: 92,
        statusUpdate: 'MVP scope locked; remaining work is copy + analytics tags.'
      },
      {
        id: 't-8',
        initiativeId: 'init-3',
        name: 'UX build & QA',
        responsible: 'T. Ivanov',
        start: addDays(today, -5),
        end: addDays(today, 12),
        progress: 48,
        statusUpdate: 'Core flows implemented; QA finding edge cases for auth.'
      },
      {
        id: 't-9',
        initiativeId: 'init-3',
        name: 'Launch readiness',
        responsible: 'R. Singh',
        start: addDays(today, 8),
        end: addDays(today, 31),
        progress: 5,
        statusUpdate: 'Release checklist started; support comms draft prepared.'
      }
    ];

    return { workstreams, initiatives, baselineTasks };
  }, [today]);

  const [selectedInitiativeId, setSelectedInitiativeId] = useState(initiatives[0]?.id ?? 'init-1');
  const [draftTasks, setDraftTasks] = useState<DemoTask[]>(baselineTasks);
  const [reportSummary, setReportSummary] = useState('No surprises - top two risks are being actively managed.');
  const [reportsByInitiative, setReportsByInitiative] = useState<Record<string, SubmittedReport>>({});
  const [submitFeedback, setSubmitFeedback] = useState<string>('');

  const [bucketMode, setBucketMode] = useState<BucketMode>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set());

  const selectedInitiative = useMemo<DemoInitiative>(() => {
    const found = initiatives.find((i) => i.id === selectedInitiativeId);
    if (found) return found;
    if (initiatives[0]) return initiatives[0];
    return {
      id: selectedInitiativeId,
      name: 'Initiative',
      ownerName: 'Owner',
      workstreamId: workstreams[0]?.id ?? 'ws-digital'
    };
  }, [initiatives, selectedInitiativeId, workstreams]);

  const workstreamById = useMemo(() => new Map(workstreams.map((w) => [w.id, w])), [workstreams]);
  const initiativeById = useMemo(() => new Map(initiatives.map((i) => [i.id, i])), [initiatives]);

  const updateTask = useCallback((taskId: string, patch: Partial<Pick<DemoTask, 'end' | 'progress' | 'statusUpdate'>>) => {
    setDraftTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }, []);

  const hasAnySubmitted = useMemo(() => Object.keys(reportsByInitiative).length > 0, [reportsByInitiative]);

  const submitReport = useCallback(() => {
    const initiativeTasks = draftTasks.filter((t) => t.initiativeId === selectedInitiative.id);
    const taskUpdates: Record<string, SubmittedTaskUpdate> = {};
    initiativeTasks.forEach((t) => {
      taskUpdates[t.id] = { end: t.end, progress: t.progress, statusUpdate: (t.statusUpdate || '').trim() };
    });

    const createdAt = new Date();
    const report: SubmittedReport = {
      id: `rep-${createdAt.getTime()}`,
      initiativeId: selectedInitiative.id,
      createdAt,
      summary: reportSummary.trim(),
      taskUpdates
    };

    setReportsByInitiative((prev) => ({ ...prev, [selectedInitiative.id]: report }));
    setSubmitFeedback(`Submitted • ${createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    setViewMode('chart');
    setTimeout(() => setSubmitFeedback(''), 2500);
  }, [draftTasks, reportSummary, selectedInitiative.id]);

  const dashboardRows = useMemo(() => {
    return baselineTasks.map((task) => {
      const initiative = initiativeById.get(task.initiativeId);
      const workstream = initiative ? workstreamById.get(initiative.workstreamId) : undefined;
      const report = reportsByInitiative[task.initiativeId];
      const update = report?.taskUpdates[task.id] ?? null;
      const end = update?.end ?? task.end;
      const progress = update?.progress ?? task.progress;
      const statusUpdate = update?.statusUpdate ?? '';

      const effectiveTask = { ...task, end, progress, statusUpdate };
      const status = getTaskStatus(effectiveTask, today);
      const dueDays = diffInDays(today, end);
      return {
        task: effectiveTask,
        initiative,
        workstream,
        status,
        dueDays,
        dueLabel: formatDueLabel(dueDays)
      };
    });
  }, [baselineTasks, initiativeById, reportsByInitiative, today, workstreamById]);

  const dashboardOwners = useMemo(() => {
    const owners = new Set<string>();
    dashboardRows.forEach((row) => {
      if (row.initiative?.ownerName) owners.add(row.initiative.ownerName);
    });
    return Array.from(owners).sort((a, b) => a.localeCompare(b));
  }, [dashboardRows]);

  const buckets = useMemo(() => buildBuckets(today, bucketMode), [bucketMode, today]);

  const bucketStats = useMemo(() => {
    const base = buckets.map((bucket) => ({ bucket, total: 0 }));
    const extra = [
      { id: 'past', label: 'Past due', total: 0 },
      { id: 'later', label: 'Later', total: 0 }
    ];

    dashboardRows.forEach((row) => {
      const id = bucketForTask(row.task.end, today, buckets);
      const target =
        id === 'past'
          ? extra[0]
          : id === 'later'
            ? extra[1]
            : base.find((b) => b.bucket.id === id);
      if (!target) return;
      target.total += 1;
    });

    const all = [
      { id: extra[0].id, label: extra[0].label, total: extra[0].total },
      ...base.map((b) => ({ id: b.bucket.id, label: b.bucket.label, total: b.total })),
      { id: extra[1].id, label: extra[1].label, total: extra[1].total }
    ];
    const max = Math.max(...all.map((b) => b.total), 1);

    return { all, max };
  }, [buckets, dashboardRows, today]);

  const statusStats = useMemo(() => {
    const base: { key: StatusKey; label: string; total: number; avgProgress: number }[] = [
      { key: 'overdue', label: 'Overdue', total: 0, avgProgress: 0 },
      { key: 'due-soon', label: 'Due soon', total: 0, avgProgress: 0 },
      { key: 'upcoming', label: 'Upcoming', total: 0, avgProgress: 0 },
      { key: 'completed', label: 'Completed', total: 0, avgProgress: 0 }
    ];

    const totals: Record<StatusKey, { sum: number; count: number }> = {
      overdue: { sum: 0, count: 0 },
      'due-soon': { sum: 0, count: 0 },
      upcoming: { sum: 0, count: 0 },
      completed: { sum: 0, count: 0 }
    };

    dashboardRows.forEach((row) => {
      const entry = base.find((b) => b.key === row.status);
      if (!entry) return;
      entry.total += 1;
      totals[row.status].sum += row.task.progress;
      totals[row.status].count += 1;
    });

    base.forEach((entry) => {
      const t = totals[entry.key];
      entry.avgProgress = t.count ? Math.round(t.sum / t.count) : 0;
    });

    const max = Math.max(...base.map((b) => b.total), 1);
    return { base, max };
  }, [dashboardRows]);

  const toggleBucket = useCallback((id: string) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredDashboardRows = useMemo(() => {
    const activeBuckets = selectedBuckets;
    return dashboardRows.filter((row) => {
      if (workstreamFilter !== 'all' && row.workstream?.id !== workstreamFilter) return false;
      if (ownerFilter !== 'all' && row.initiative?.ownerName !== ownerFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (activeBuckets.size) {
        const bucketId = bucketForTask(row.task.end, today, buckets);
        if (!activeBuckets.has(bucketId)) return false;
      }
      return true;
    });
  }, [buckets, dashboardRows, ownerFilter, selectedBuckets, statusFilter, today, workstreamFilter]);

  const submittedReportForSelected = reportsByInitiative[selectedInitiative.id] ?? null;

  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      <div className={styles.stack}>
        <div className={styles.window}>
          <div className={styles.windowChrome}>
            <div className={styles.windowControls}>
              <span className={styles.windowDot} data-color="red" />
              <span className={styles.windowDot} data-color="yellow" />
              <span className={styles.windowDot} data-color="green" />
            </div>
            <div className={styles.windowTitle}>Status report • {formatRangeLabel(reportWindow.start, reportWindow.end)}</div>
            <div className={styles.chromeSpacer} />
            <button className={styles.chromePill} type="button">
              Weekly
            </button>
          </div>

          <div className={styles.windowBody}>
            <div className={styles.reportHeader}>
              <div className={styles.reportHeaderLeft}>
                <div className={styles.reportTitle}>Fill the update once - keep everyone aligned.</div>
                <div className={styles.reportMeta}>
                  <span className={styles.muted}>Scope:</span>
                  <select className={styles.select} value={selectedInitiativeId} onChange={(e) => setSelectedInitiativeId(e.target.value)}>
                    {initiatives.map((init) => (
                      <option key={init.id} value={init.id}>
                        {init.name}
                      </option>
                    ))}
                  </select>
                  <span className={styles.muted}>Owner:</span>
                  <span className={styles.metaValue}>{selectedInitiative.ownerName}</span>
                </div>
              </div>
              <div className={styles.reportHeaderRight}>
                <button className={styles.secondaryBtn} type="button" onClick={() => setReportSummary('')}>
                  Clear summary
                </button>
                <button className={styles.primaryBtn} type="button" onClick={submitReport}>
                  Submit report
                </button>
                <div className={styles.submitFeedback}>{submitFeedback}</div>
              </div>
            </div>

            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <div className={styles.colTask}>Task</div>
                <div className={styles.colOwner}>Responsible</div>
                <div className={styles.colDue}>End</div>
                <div className={styles.colProgress}>Progress</div>
                <div className={styles.colUpdate}>Status update</div>
              </div>

              <div className={styles.tableBody}>
                {draftTasks
                  .filter((t) => t.initiativeId === selectedInitiative.id)
                  .map((task) => {
                    const dueDays = diffInDays(today, task.end);
                    const tone = statusTone(getTaskStatus(task, today));
                    return (
                      <div key={task.id} className={styles.tableRow}>
                        <div className={styles.colTask}>
                          <div className={styles.taskName}>{task.name}</div>
                          <div className={`${styles.duePill} ${styles[tone]}`}>{formatDueLabel(dueDays)}</div>
                        </div>
                        <div className={styles.colOwner}>{task.responsible}</div>
                        <div className={styles.colDue}>
                          <input
                            className={styles.dateInput}
                            type="date"
                            value={formatInputDate(task.end)}
                            onChange={(e) => updateTask(task.id, { end: parseInputDate(e.target.value, task.end) })}
                          />
                        </div>
                        <div className={styles.colProgress}>
                          <div className={styles.progressRow}>
                            <input
                              className={styles.range}
                              type="range"
                              min={0}
                              max={100}
                              value={task.progress}
                              onChange={(e) => updateTask(task.id, { progress: Number(e.target.value) })}
                            />
                            <span className={styles.progressValue}>{task.progress}%</span>
                          </div>
                        </div>
                        <div className={styles.colUpdate}>
                          <textarea
                            className={styles.textarea}
                            value={task.statusUpdate}
                            onChange={(e) => updateTask(task.id, { statusUpdate: e.target.value })}
                            rows={2}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className={styles.summaryRow}>
              <div className={styles.summaryLabel}>Summary</div>
              <textarea
                className={styles.summaryTextarea}
                value={reportSummary}
                onChange={(e) => setReportSummary(e.target.value)}
                rows={2}
                placeholder="What changed this week? What needs attention?"
              />
              <div className={styles.summaryHint}>
                {submittedReportForSelected ? (
                  <span className={styles.muted}>
                    Latest submitted:{' '}
                    {submittedReportForSelected.createdAt.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                ) : (
                  <span className={styles.muted}>Not submitted yet</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`${styles.window} ${!hasAnySubmitted ? styles.locked : ''}`}>
          <div className={styles.windowChrome}>
            <div className={styles.windowControls}>
              <span className={styles.windowDot} data-color="red" />
              <span className={styles.windowDot} data-color="yellow" />
              <span className={styles.windowDot} data-color="green" />
            </div>
            <div className={styles.windowTitle}>Deadline radar</div>
            <div className={styles.chromeSpacer} />
            <button
              type="button"
              className={`${styles.chromePill} ${viewMode === 'chart' ? styles.chromePillActive : ''}`}
              onClick={() => setViewMode('chart')}
            >
              Charts
            </button>
            <button
              type="button"
              className={`${styles.chromePill} ${viewMode === 'reports' ? styles.chromePillActive : ''}`}
              onClick={() => setViewMode('reports')}
            >
              Reports
            </button>
          </div>

          <div className={styles.windowBody}>
            {!hasAnySubmitted && (
              <div className={styles.lockOverlay}>
                <div className={styles.lockCard}>
                  <div className={styles.lockTitle}>Submit a status report to populate the radar</div>
                  <div className={styles.lockDesc}>Your submitted updates will appear here instantly (dates, progress, notes).</div>
                </div>
              </div>
            )}

            <div className={styles.radarHeader}>
              <div className={styles.radarTitle}>
                <strong>Delivery risk at a glance</strong>
                <span className={styles.muted}>• powered by the latest status reports</span>
              </div>
              <div className={styles.radarFilters}>
                <select className={styles.select} value={workstreamFilter} onChange={(e) => setWorkstreamFilter(e.target.value)}>
                  <option value="all">All workstreams</option>
                  {workstreams.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
                <select className={styles.select} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                  <option value="all">All owners</option>
                  {dashboardOwners.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
                <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusKey | 'all')}>
                  <option value="all">All statuses</option>
                  <option value="overdue">Overdue</option>
                  <option value="due-soon">Due soon</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                </select>
                <select className={styles.select} value={bucketMode} onChange={(e) => setBucketMode(e.target.value as BucketMode)}>
                  <option value="week">Weekly buckets</option>
                  <option value="month">Monthly buckets</option>
                </select>
              </div>
            </div>

            {viewMode === 'chart' ? (
              <div className={styles.radarGrid}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>Timeline buckets</div>
                      <div className={styles.cardSub}>Click a bar to filter the table</div>
                    </div>
                    <button type="button" className={styles.linkBtn} onClick={() => setSelectedBuckets(new Set())} disabled={!selectedBuckets.size}>
                      Clear
                    </button>
                  </div>
                  <div className={styles.bucketRow}>
                    {bucketStats.all.map((b) => {
                      const height = Math.max(6, Math.round((b.total / bucketStats.max) * 100));
                      const isActive = selectedBuckets.has(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className={`${styles.bucketBar} ${isActive ? styles.active : ''}`}
                          onClick={() => toggleBucket(b.id)}
                          title={`${b.label} • ${b.total} tasks`}
                        >
                          <span className={styles.bucketFill} style={{ height: `${height}%` }} />
                          <span className={styles.bucketLabel}>{b.id === 'past' || b.id === 'later' ? b.label : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardTitle}>Status buckets</div>
                      <div className={styles.cardSub}>Based on end dates + progress</div>
                    </div>
                  </div>
                  <div className={styles.statusRow}>
                    {statusStats.base.map((s) => {
                      const height = Math.max(6, Math.round((s.total / statusStats.max) * 100));
                      const isActive = statusFilter !== 'all' && statusFilter === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          className={`${styles.statusBar} ${isActive ? styles.active : ''}`}
                          onClick={() => setStatusFilter((prev) => (prev === s.key ? 'all' : s.key))}
                          title={`${s.label} • ${s.total} tasks • Avg ${s.avgProgress}%`}
                        >
                          <span className={`${styles.statusFill} ${styles[statusTone(s.key)]}`} style={{ height: `${height}%` }} />
                          <span className={styles.statusLabel}>{s.label}</span>
                          <span className={styles.statusMeta}>{s.total} • avg {s.avgProgress}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.reportsPanel}>
                <div className={styles.reportsTitle}>Latest submitted reports</div>
                {Object.values(reportsByInitiative)
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .map((report) => {
                    const initiative = initiativeById.get(report.initiativeId);
                    const ws = initiative ? workstreamById.get(initiative.workstreamId) : undefined;
                    return (
                      <div key={report.id} className={styles.reportCard}>
                        <div className={styles.reportCardHeader}>
                          <span className={styles.reportCardTitle}>
                            <span className={styles.wsDot} style={{ background: ws?.color ?? '#64748b' }} />
                            {initiative?.name ?? 'Initiative'}
                          </span>
                          <span className={styles.muted}>
                            {report.createdAt.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className={styles.reportCardSummary}>{report.summary || <span className={styles.muted}>No summary provided.</span>}</div>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className={styles.tableFooter}>
              <div className={styles.tableFooterTitle}>Tasks</div>
              <div className={styles.tableFooterHint}>
                Showing <strong>{filteredDashboardRows.length}</strong> of <strong>{dashboardRows.length}</strong>
              </div>
            </div>

            <div className={styles.radarTable}>
              <div className={styles.radarTableHeader}>
                <div className={styles.rColInit}>Initiative</div>
                <div className={styles.rColTask}>Task</div>
                <div className={styles.rColDue}>End</div>
                <div className={styles.rColProg}>Progress</div>
                <div className={styles.rColUpdate}>Latest status report</div>
              </div>
              <div className={styles.radarTableBody}>
                {filteredDashboardRows.slice(0, 7).map((row) => {
                  const ws = row.workstream;
                  const tone = statusTone(row.status);
                  const updateText = (row.task.statusUpdate || '').trim();
                  return (
                    <div key={row.task.id} className={styles.radarTableRow}>
                      <div className={styles.rColInit}>
                        <span className={styles.wsDot} style={{ background: ws?.color ?? '#64748b' }} />
                        <div>
                          <div className={styles.initName}>{row.initiative?.name ?? 'Initiative'}</div>
                          <div className={styles.muted}>{row.initiative?.ownerName ?? ''}</div>
                        </div>
                      </div>
                      <div className={styles.rColTask}>
                        <div className={styles.taskNameSmall}>{row.task.name}</div>
                        <div className={styles.muted}>Resp: {row.task.responsible}</div>
                      </div>
                      <div className={styles.rColDue}>
                        <div className={styles.endDate}>{row.task.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                        <div className={`${styles.duePill} ${styles[tone]}`}>{row.dueLabel}</div>
                      </div>
                      <div className={styles.rColProg}>
                        <div className={styles.meter}>
                          <div className={styles.meterFill} style={{ width: `${row.task.progress}%`, background: ws?.color ?? '#8b5cf6' }} />
                        </div>
                        <div className={styles.progressValue}>{row.task.progress}%</div>
                      </div>
                      <div className={styles.rColUpdate}>
                        {updateText ? <span className={styles.updateText}>{updateText}</span> : <span className={styles.muted}>No report yet</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
