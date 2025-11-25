import { useEffect, useMemo, useState } from 'react';
import styles from '../../../../styles/InitiativeStatusReportModule.module.css';
import { initiativesApi, InitiativeStatusReportEntryInput } from '../../services/initiativesApi';
import {
  InitiativePlanModel,
  InitiativeStatusReport,
  InitiativeStatusReportEntry,
  InitiativeStatusReportSource
} from '../../../../shared/types/initiative';
import { diffInDays, parseDate } from '../../plan/planTimeline';
import { useAuth } from '../../../auth/AuthContext';

interface InitiativeStatusReportModuleProps {
  plan: InitiativePlanModel;
  initiativeId: string;
  readOnly?: boolean;
}

const UPCOMING_WINDOW_DAYS = 14;
const STATUS_UPDATE_LIMIT = 2000;

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

const buildDueState = (entry: InitiativeStatusReportEntry) => {
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
  if (diff <= UPCOMING_WINDOW_DAYS) {
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
  const [reports, setReports] = useState<InitiativeStatusReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('draft');
  const [draftEntries, setDraftEntries] = useState<InitiativeStatusReportEntry[]>([]);
  const [pendingTaskId, setPendingTaskId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allTasks = useMemo(
    () => plan.tasks.filter((task) => !task.archived),
    [plan.tasks]
  );

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
        return diff <= UPCOMING_WINDOW_DAYS;
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
    try {
      const report = await initiativesApi.submitStatusReport(initiativeId, entriesPayload, actor);
      setReports((current) => [report, ...current]);
      setSelectedReportId(report.id);
      setMessage('Report submitted and locked.');
      setDraftEntries(upcomingTasks.map((task) => buildEntryFromTask(task, 'auto')));
    } catch {
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <strong>Loading submitted reports…</strong>
        </div>
      )}

      <div className={styles.table} role="table" aria-label="Status report entries">
        <div className={styles.tableHeader} role="row">
          <div className={styles.headerCell}>Task</div>
          <div className={styles.headerCell}>Description</div>
          <div className={styles.headerCell}>Responsible</div>
          <div className={styles.headerCell}>Start</div>
          <div className={styles.headerCell}>End</div>
          <div className={styles.headerCell}>Status update</div>
        </div>
        {!entriesToRender.length ? (
          renderEmptyState()
        ) : (
          entriesToRender.map((entry) => {
            const dueState = buildDueState(entry);
            const rowClass =
              dueState.tone === 'negative'
                ? styles.rowNegative
                : dueState.tone === 'warning'
                ? styles.rowWarning
                : '';
            return (
              <div key={entry.id} className={`${styles.tableRow} ${rowClass}`} role="row">
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
                      <span className={`${styles.badge} ${styles.badgeMuted}`}>Manual</span>
                    )}
                  </div>
                </div>
                <div className={styles.cell}>
                  <p className={styles.description}>{entry.description || 'No description'}</p>
                </div>
                <div className={styles.cell}>
                  <span className={styles.responsible}>{entry.responsible || 'Unassigned'}</span>
                </div>
                <div className={styles.cell}>{formatDateLabel(entry.startDate)}</div>
                <div className={styles.cell}>{formatDateLabel(entry.endDate)}</div>
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
              {isSubmitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
