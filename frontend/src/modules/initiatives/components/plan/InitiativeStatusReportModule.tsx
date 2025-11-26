import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../../../styles/InitiativeStatusReportModule.module.css';
import { initiativesApi, InitiativeStatusReportEntryInput, InitiativeStatusReportPayload } from '../../services/initiativesApi';
import {
  InitiativePlanModel,
  InitiativeStatusReport,
  InitiativeStatusReportEntry,
  InitiativeStatusReportSource
} from '../../../../shared/types/initiative';
import { diffInDays, parseDate } from '../../plan/planTimeline';
import { useAuth } from '../../../auth/AuthContext';
import { usePlanSettingsState } from '../../../../app/state/AppStateContext';

interface InitiativeStatusReportModuleProps {
  plan: InitiativePlanModel;
  initiativeId: string;
  readOnly?: boolean;
}

const STATUS_UPDATE_LIMIT = 2000;
const SUMMARY_LIMIT = 4000;

type ColumnId = 'name' | 'description' | 'responsible' | 'start' | 'end' | 'status';

const columnConfig: Record<
  ColumnId,
  { id: ColumnId; label: string; minWidth: number; maxWidth: number; defaultWidth: number }
> = {
  name: { id: 'name', label: 'Task', minWidth: 160, maxWidth: 420, defaultWidth: 220 },
  description: { id: 'description', label: 'Description', minWidth: 160, maxWidth: 520, defaultWidth: 220 },
  responsible: { id: 'responsible', label: 'Responsible', minWidth: 140, maxWidth: 320, defaultWidth: 180 },
  start: { id: 'start', label: 'Start', minWidth: 110, maxWidth: 200, defaultWidth: 130 },
  end: { id: 'end', label: 'End', minWidth: 110, maxWidth: 200, defaultWidth: 130 },
  status: { id: 'status', label: 'Status update', minWidth: 200, maxWidth: 520, defaultWidth: 260 }
};

const formatDateLabel = (value: string | null) => {
  if (!value) {
    return 'Not set';
  }
  const parsed = parseDate(value);
  if (!parsed) {
    return 'Not set';
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTimeLabel = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const buildEntryFromTask = (
  task: InitiativePlanModel['tasks'][number],
  source: InitiativeStatusReportSource
): InitiativeStatusReportEntry => ({
  id: task.id,
  taskId: task.id,
  name: task.name || 'Untitled task',
  description: task.description,
  responsible: task.responsible,
  startDate: task.startDate,
  endDate: task.endDate ?? task.baseline?.endDate ?? null,
  statusUpdate: '',
  source
});

const buildDueState = (entry: InitiativeStatusReportEntry, windowDays: number) => {
  const parsed = parseDate(entry.endDate);
  if (!parsed) {
    return { label: 'No end date', tone: 'muted' as const };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = diffInDays(today, parsed);
  if (diff < 0) {
    return { label: `${Math.abs(diff)}d overdue`, tone: 'negative' as const };
  }
  if (diff === 0) {
    return { label: 'Due today', tone: 'warning' as const };
  }
  if (diff <= windowDays) {
    return { label: `Due in ${diff}d`, tone: 'warning' as const };
  }
  return { label: `Due in ${diff}d`, tone: 'muted' as const };
};

export const InitiativeStatusReportModule = ({
  plan,
  initiativeId,
  readOnly = false
}: InitiativeStatusReportModuleProps) => {
  const { session } = useAuth();
  const { statusReportSettings } = usePlanSettingsState();
  const [reports, setReports] = useState<InitiativeStatusReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('draft');
  const [draftEntries, setDraftEntries] = useState<InitiativeStatusReportEntry[]>([]);
  const [pendingTaskId, setPendingTaskId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [sort, setSort] = useState<{ column: ColumnId; direction: 'asc' | 'desc' }>({
    column: 'end',
    direction: 'asc'
  });
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(() =>
    Object.values(columnConfig).reduce((acc, col) => {
      acc[col.id] = col.defaultWidth;
      return acc;
    }, {} as Record<ColumnId, number>)
  );
  const resizeStateRef = useRef<{ column: ColumnId; startX: number; startWidth: number } | null>(null);

  const allTasks = useMemo(
    () => plan.tasks.filter((task) => !task.archived),
    [plan.tasks]
  );

  const upcomingWindow = statusReportSettings.upcomingWindowDays || 14;

  const upcomingTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allTasks
      .filter((task) => {
        const dueDate = parseDate(task.endDate ?? task.baseline?.endDate ?? null);
        if (!dueDate) {
          return false;
        }
        const diff = diffInDays(today, dueDate);
        return diff <= upcomingWindow;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.endDate ?? a.baseline?.endDate ?? null);
        const bDate = parseDate(b.endDate ?? b.baseline?.endDate ?? null);
        if (!aDate && !bDate) {
          return a.name.localeCompare(b.name);
        }
        if (!aDate) {
          return 1;
        }
        if (!bDate) {
          return -1;
        }
        return aDate.getTime() - bDate.getTime();
      });
  }, [allTasks]);

  const availableTasks = useMemo(() => {
    if (selectedReportId !== 'draft') {
      return [];
    }
    const included = new Set(draftEntries.map((entry) => entry.taskId));
    return allTasks.filter((task) => !included.has(task.id));
  }, [allTasks, draftEntries, selectedReportId]);

  const sortedReports = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [reports]
  );

  const selectedReport = useMemo(
    () => sortedReports.find((report) => report.id === selectedReportId) ?? null,
    [sortedReports, selectedReportId]
  );

  const isViewingSubmitted = selectedReportId !== 'draft' && Boolean(selectedReport);
  const entriesToRender = isViewingSubmitted ? selectedReport?.entries ?? [] : draftEntries;
  const sortedEntries = useMemo(() => {
    const copy = [...entriesToRender];
    copy.sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1;
      switch (sort.column) {
        case 'name':
          return direction * a.name.localeCompare(b.name);
        case 'description':
          return direction * (a.description || '').localeCompare(b.description || '');
        case 'responsible':
          return direction * (a.responsible || '').localeCompare(b.responsible || '');
        case 'start': {
          const aDate = parseDate(a.startDate);
          const bDate = parseDate(b.startDate);
          return direction * ((aDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (bDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
        }
        case 'end': {
          const aDate = parseDate(a.endDate);
          const bDate = parseDate(b.endDate);
          return direction * ((aDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (bDate?.getTime() ?? Number.MAX_SAFE_INTEGER));
        }
        case 'status':
          return direction * (a.statusUpdate || '').localeCompare(b.statusUpdate || '');
        default:
          return 0;
      }
    });
    return copy;
  }, [entriesToRender, sort]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    initiativesApi
      .listStatusReports(initiativeId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setReports(result ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load submitted reports.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initiativeId]);

  useEffect(() => {
    if (isViewingSubmitted && selectedReport) {
      setSummary(selectedReport.summary || '');
    }
    if (selectedReportId === 'draft' && !isViewingSubmitted) {
      setSummary((prev) => prev);
    }
  }, [isViewingSubmitted, selectedReport, selectedReportId]);

  useEffect(() => {
    if (selectedReportId !== 'draft') {
      return;
    }
    setDraftEntries((current) => {
      const currentMap = new Map(current.map((entry) => [entry.taskId, entry]));
      const next: InitiativeStatusReportEntry[] = [];
      upcomingTasks.forEach((task) => {
        const existing = currentMap.get(task.id);
        next.push(existing ?? buildEntryFromTask(task, 'auto'));
      });
      current.forEach((entry) => {
        if (entry.source === 'manual' && !next.find((item) => item.taskId === entry.taskId)) {
          next.push(entry);
        }
      });
      return next;
    });
  }, [upcomingTasks, selectedReportId]);

  useEffect(() => {
    if (selectedReportId !== 'draft') {
      return;
    }
    if (!pendingTaskId && availableTasks.length) {
      setPendingTaskId(availableTasks[0].id);
      return;
    }
    if (pendingTaskId && !availableTasks.find((task) => task.id === pendingTaskId)) {
      setPendingTaskId(availableTasks[0]?.id ?? '');
    }
  }, [availableTasks, pendingTaskId, selectedReportId]);

  useEffect(() => {
    if (selectedReportId === 'draft') {
      return;
    }
    const exists = sortedReports.some((report) => report.id === selectedReportId);
    if (!exists) {
      setSelectedReportId('draft');
    }
  }, [sortedReports, selectedReportId]);

  const handleStatusChange = (taskId: string, value: string) => {
    setDraftEntries((current) =>
      current.map((entry) => (entry.taskId === taskId ? { ...entry, statusUpdate: value.slice(0, STATUS_UPDATE_LIMIT) } : entry))
    );
  };

  const handleReportSelect = (value: string) => {
    setSelectedReportId(value);
    setMessage(null);
    setError(null);
    if (value === 'draft' && selectedReportId !== 'draft') {
      setDraftEntries(upcomingTasks.map((task) => buildEntryFromTask(task, 'auto')));
      setSummary('');
    } else if (value !== 'draft' && selectedReport) {
      setSummary(selectedReport.summary || '');
    }
  };

  const handleAddTask = () => {
    const selected = pendingTaskId
      ? availableTasks.find((task) => task.id === pendingTaskId)
      : availableTasks[0];
    if (!selected) {
      return;
    }
    setDraftEntries((current) => [...current, buildEntryFromTask(selected, 'manual')]);
    setPendingTaskId('');
    setMessage(null);
  };

  const handleSubmit = async () => {
    if (!draftEntries.length || readOnly) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const actor = session
      ? {
          accountId: session.accountId,
          name: session.email
        }
      : undefined;
    const entriesPayload: InitiativeStatusReportEntryInput[] = draftEntries.map((entry) => ({
      taskId: entry.taskId,
      statusUpdate: entry.statusUpdate,
      source: entry.source
    }));
    const payload: InitiativeStatusReportPayload = {
      entries: entriesPayload,
      summary
    };
    try {
      const report = await initiativesApi.submitStatusReport(initiativeId, payload, actor);
      setReports((current) => [report, ...current]);
      setSelectedReportId(report.id);
      setSummary(report.summary || '');
      setMessage('Report submitted and locked.');
      setDraftEntries(upcomingTasks.map((task) => buildEntryFromTask(task, 'auto')));
    } catch {
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSort = (column: ColumnId) => {
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const startResize = (column: ColumnId, startX: number) => {
    resizeStateRef.current = { column, startX, startWidth: columnWidths[column] ?? columnConfig[column].defaultWidth };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const state = resizeStateRef.current;
    if (!state) {
      return;
    }
    event.preventDefault();
    const delta = event.clientX - state.startX;
    const config = columnConfig[state.column];
    const nextWidth = Math.min(config.maxWidth, Math.max(config.minWidth, state.startWidth + delta));
    setColumnWidths((prev) => ({ ...prev, [state.column]: nextWidth }));
  };

  const stopResize = () => {
    resizeStateRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResize);
  };

  useEffect(
    () => () => {
      stopResize();
    },
    []
  );

  const tableTemplate = useMemo(
    () =>
      (['name', 'description', 'responsible', 'start', 'end', 'status'] as ColumnId[])
        .map((id) => `${columnWidths[id] ?? columnConfig[id].defaultWidth}px`)
        .join(' '),
    [columnWidths]
  );

  const renderEmptyState = () => (
    <div className={styles.placeholder}>
      <strong>No upcoming or overdue tasks found.</strong>
      {!readOnly && <p>Use “Add more” to pull tasks from the plan if you want to include them.</p>}
    </div>
  );

  return (
    <section className={styles.reportSection} aria-label="Status report">
      <header className={styles.reportHeader}>
        <div>
          <span className={styles.eyebrow}>Milestone plan - actuals</span>
          <h4 className={styles.title}>Status report</h4>
          <p className={styles.subtitle}>
            Upcoming and overdue tasks from the plan. Add a quick update and submit a snapshot.
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.selectLabel}>
            <span>View</span>
            <select
              value={selectedReportId}
              onChange={(event) => handleReportSelect(event.target.value)}
              className={styles.select}
            >
              <option value="draft">Current draft</option>
              {sortedReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {formatDateTimeLabel(report.createdAt)} · {report.entries.length} tasks
                  {report.createdByName ? ` · ${report.createdByName}` : ''}
                </option>
              ))}
            </select>
          </label>
          {isViewingSubmitted && (
            <span className={styles.lockBadge}>Submitted snapshot</span>
          )}
        </div>
      </header>

      {isViewingSubmitted && selectedReport && (
        <div className={styles.lockNotice}>
          Submitted on {formatDateTimeLabel(selectedReport.createdAt)}
          {selectedReport.createdByName ? ` by ${selectedReport.createdByName}` : ''}. Locked for edits.
        </div>
      )}
      {message && <div className={styles.success}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {isLoading && !sortedReports.length && (
        <div className={styles.placeholder}>
          <strong>Loading submitted reports...</strong>
        </div>
      )}

      <div className={styles.overallRow}>
        <label className={styles.fieldLabel}>
          <span>Overall status update</span>
          {isViewingSubmitted || readOnly ? (
            <p className={styles.readonlyUpdate}>{summary || 'No overall update provided.'}</p>
          ) : (
            <textarea
              value={summary}
              maxLength={SUMMARY_LIMIT}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Summarize overall progress, risks, or asks"
              disabled={isSubmitting}
            />
          )}
        </label>
      </div>

      <div className={styles.tableShell}>
        <div className={styles.tableHeader} role="row" style={{ gridTemplateColumns: tableTemplate }}>
          {(Object.keys(columnConfig) as ColumnId[]).map((column) => (
            <div
              key={column}
              className={styles.headerCell}
              role="columnheader"
              onClick={() => handleSort(column)}
            >
              <span className={styles.headerLabel}>
                {columnConfig[column].label}
                {sort.column === column && <i className={styles.sortIndicator}>{sort.direction === 'asc' ? '▲' : '▼'}</i>}
              </span>
              <span
                className={styles.columnResizer}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  startResize(column, event.clientX);
                }}
                role="separator"
                aria-label={`Resize ${columnConfig[column].label} column`}
              />
            </div>
          ))}
        </div>
        <div className={styles.tableBody} role="table" aria-label="Status report entries">
          {!sortedEntries.length ? (
            renderEmptyState()
          ) : (
            sortedEntries.map((entry, index) => {
              const dueState = buildDueState(entry, upcomingWindow);
              const rowClass =
                dueState.tone === 'negative'
                  ? styles.rowNegative
                  : dueState.tone === 'warning'
                  ? styles.rowWarning
                  : '';
              return (
                <div
                  key={entry.id}
                  className={`${styles.tableRow} ${rowClass} ${index % 2 === 0 ? styles.rowEven : ''}`}
                  role="row"
                  style={{ gridTemplateColumns: tableTemplate }}
                >
                  <div className={styles.cell}>
                    <div className={styles.taskTitle}>{entry.name || 'Untitled task'}</div>
                    <div className={styles.badges}>
                      <span
                        className={`${styles.badge} ${
                          dueState.tone === 'negative'
                            ? styles.badgeDanger
                            : dueState.tone === 'warning'
                            ? styles.badgeWarning
                            : styles.badgeMuted
                        }`}
                      >
                        {dueState.label}
                      </span>
                      {entry.source === 'manual' && (
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>Manual add</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.cell}>
                    <p className={styles.description}>{entry.description || 'No description'}</p>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.responsible}>{entry.responsible || 'Unassigned'}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.datePill}>{formatDateLabel(entry.startDate)}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.datePill}>{formatDateLabel(entry.endDate)}</span>
                  </div>
                  <div className={styles.statusCell}>
                    {isViewingSubmitted || readOnly ? (
                      <p className={styles.readonlyUpdate}>{entry.statusUpdate || 'No update provided.'}</p>
                    ) : (
                      <textarea
                        value={entry.statusUpdate}
                        maxLength={STATUS_UPDATE_LIMIT}
                        onChange={(event) => handleStatusChange(entry.taskId, event.target.value)}
                        placeholder="Share a short update or blocker"
                        disabled={isSubmitting}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {!isViewingSubmitted && !readOnly && (
        <div className={styles.actions}>
          <div className={styles.addRow}>
            <div className={styles.addControls}>
              <label className={styles.selectLabel}>
                <span>Task from plan</span>
                <select
                  value={pendingTaskId}
                  onChange={(event) => setPendingTaskId(event.target.value)}
                  className={styles.select}
                  disabled={!availableTasks.length}
                >
                  {!availableTasks.length && <option value="">No remaining tasks</option>}
                  {availableTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name || 'Untitled task'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleAddTask}
                disabled={!availableTasks.length}
                className={styles.secondaryButton}
              >
                Add more
              </button>
            </div>
            <p className={styles.hint}>Add a task that was not auto-selected.</p>
          </div>

          <div className={styles.submitRow}>
            <div className={styles.submitCopy}>
              <strong>Submit report</strong>
              <p>Creates a frozen snapshot. You will not be able to edit it afterwards.</p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSubmit}
              disabled={!draftEntries.length || isSubmitting || readOnly}
            >
              {isSubmitting ? 'Submitting...' : 'Submit report'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
