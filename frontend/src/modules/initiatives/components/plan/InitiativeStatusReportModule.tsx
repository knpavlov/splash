import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  initiativeName: string;
  initiativeOwner: string;
  recurringImpact: number;
  readOnly?: boolean;
}

const STATUS_UPDATE_LIMIT = 2000;
const SUMMARY_LIMIT = 4000;

type ColumnId =
  | 'name'
  | 'description'
  | 'responsible'
  | 'start'
  | 'end'
  | 'initiative'
  | 'owner'
  | 'impact'
  | 'status'
  | 'actions';

const columnConfig: Record<ColumnId, { label: string }> = {
  name: { label: 'Task' },
  description: { label: 'Description' },
  responsible: { label: 'Responsible' },
  start: { label: 'Start' },
  end: { label: 'End' },
  initiative: { label: 'Initiative' },
  owner: { label: 'Owner' },
  impact: { label: 'Recurring impact' },
  status: { label: 'Status update' },
  actions: { label: 'Actions' }
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

const formatImpact = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

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

const buildDraftStorageKey = (initiativeId: string) => `status-report-draft:${initiativeId}`;

const mergeEntriesWithTasks = (
  entries: InitiativeStatusReportEntry[],
  tasks: InitiativePlanModel['tasks']
): InitiativeStatusReportEntry[] => {
  const map = new Map(entries.map((entry) => [entry.taskId, entry]));
  const next: InitiativeStatusReportEntry[] = [];
  tasks.forEach((task) => {
    const existing = map.get(task.id);
    if (existing) {
      next.push({
        ...buildEntryFromTask(task, existing.source),
        ...existing,
        name: task.name || existing.name,
        description: task.description,
        responsible: task.responsible,
        startDate: task.startDate,
        endDate: task.endDate ?? task.baseline?.endDate ?? null
      });
      map.delete(task.id);
    } else {
      next.push(buildEntryFromTask(task, 'auto'));
    }
  });
  entries.forEach((entry) => {
    if (entry.source === 'manual' && !next.find((item) => item.taskId === entry.taskId)) {
      next.push(entry);
    }
  });
  return next;
};

export const InitiativeStatusReportModule = ({
  plan,
  initiativeId,
  initiativeName,
  initiativeOwner,
  recurringImpact,
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
  const draftStorageKey = useMemo(() => buildDraftStorageKey(initiativeId), [initiativeId]);
  const draftLoadedRef = useRef(false);

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
  }, [allTasks, upcomingWindow]);

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

  const dueBreakdown = useMemo(() => {
    const totals = { total: 0, overdue: 0, warning: 0, onTrack: 0 };
    entriesToRender.forEach((entry) => {
      const state = buildDueState(entry, upcomingWindow);
      totals.total += 1;
      if (state.tone === 'negative') {
        totals.overdue += 1;
      } else if (state.tone === 'warning') {
        totals.warning += 1;
      } else {
        totals.onTrack += 1;
      }
    });
    return totals;
  }, [entriesToRender, upcomingWindow]);

  useEffect(() => {
    if (selectedReportId !== 'draft' || draftLoadedRef.current) {
      return;
    }
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) {
      draftLoadedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { summary?: string; entries?: InitiativeStatusReportEntry[] };
      if (typeof parsed.summary === 'string') {
        setSummary(parsed.summary);
      }
      const savedEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      setDraftEntries(mergeEntriesWithTasks(savedEntries, upcomingTasks));
    } catch {
      // ignore malformed payloads
    } finally {
      draftLoadedRef.current = true;
    }
  }, [draftStorageKey, upcomingTasks, selectedReportId]);

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
    setDraftEntries((current) => mergeEntriesWithTasks(current, upcomingTasks));
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

  const hydrateDraftFromStorage = useCallback(() => {
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) {
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as { summary?: string; entries?: InitiativeStatusReportEntry[] };
      if (typeof parsed.summary === 'string') {
        setSummary(parsed.summary);
      }
      const savedEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      setDraftEntries(mergeEntriesWithTasks(savedEntries, upcomingTasks));
      return true;
    } catch {
      return false;
    }
  }, [draftStorageKey, upcomingTasks]);

  const handleReportSelect = (value: string) => {
    setSelectedReportId(value);
    setMessage(null);
    setError(null);
    if (value === 'draft' && selectedReportId !== 'draft') {
      const restored = hydrateDraftFromStorage();
      if (!restored) {
        setDraftEntries(mergeEntriesWithTasks([], upcomingTasks));
        setSummary('');
      }
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

  const handleRemoveManual = (taskId: string) => {
    setDraftEntries((current) => current.filter((entry) => !(entry.taskId === taskId && entry.source === 'manual')));
    setMessage('Manual task removed.');
  };

  const persistDraft = useCallback(
    (silent = false) => {
      if (isViewingSubmitted || readOnly) {
        return;
      }
      const payload = {
        summary,
        entries: draftEntries,
        savedAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        if (!silent) {
          setError(null);
          setMessage('Draft saved.');
        }
      } catch {
        if (!silent) {
          setError('Failed to save draft locally.');
        }
      }
    },
    [draftEntries, draftStorageKey, isViewingSubmitted, readOnly, summary]
  );

  const handleSaveDraft = () => {
    persistDraft();
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
      localStorage.removeItem(draftStorageKey);
      setDraftEntries(upcomingTasks.map((task) => buildEntryFromTask(task, 'auto')));
    } catch {
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSort = (column: ColumnId) => {
    if (column === 'actions') {
      return;
    }
    setSort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  useEffect(() => {
    const handlePageSave = (event: Event) => {
      const detail = (event as CustomEvent<{ initiativeId: string }>).detail;
      if (!detail || detail.initiativeId !== initiativeId) {
        return;
      }
      persistDraft(true);
    };
    window.addEventListener('initiative-save-draft', handlePageSave as EventListener);
    return () => window.removeEventListener('initiative-save-draft', handlePageSave as EventListener);
  }, [initiativeId, persistDraft]);

  const renderEmptyState = () => (
    <div className={styles.placeholder}>
      <strong>No upcoming or overdue tasks found.</strong>
      {!readOnly && <p>Use "Add more" to pull tasks from the plan if you want to include them.</p>}
    </div>
  );

  const tableTemplate = (['name', 'description', 'responsible', 'start', 'end', 'initiative', 'owner', 'impact', 'status', 'actions'] as ColumnId[])
    .map((id) =>
      ({
        name: 220,
        description: 240,
        responsible: 150,
        start: 120,
        end: 120,
        initiative: 200,
        owner: 180,
        impact: 150,
        status: 320,
        actions: 90
      }[id])
    )
    .map((width) => `${width}px`)
    .join(' ');

  const initiativeNameLabel = initiativeName || 'Untitled initiative';
  const initiativeOwnerLabel = initiativeOwner || 'Unassigned';
  const recurringImpactLabel = formatImpact(Number.isFinite(recurringImpact) ? recurringImpact : 0);
  const canEditDraft = !isViewingSubmitted && !readOnly;
  const sortableColumns = new Set<ColumnId>(['name', 'description', 'responsible', 'start', 'end', 'status']);

  return (
    <section className={styles.reportSection} aria-label="Status report">
      <header className={styles.reportHeader}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Milestone plan - actuals</p>
          <div className={styles.titleRow}>
            <h4 className={styles.title}>Status report</h4>
            {isViewingSubmitted && <span className={styles.lockBadge}>Submitted snapshot</span>}
          </div>
          <p className={styles.subtitle}>
            Upcoming and overdue tasks from the plan. Add a quick update and submit a snapshot.
          </p>
          <div className={styles.metricRow}>
            <div className={`${styles.metricCard} ${styles.metricPrimary}`}>
              <span className={styles.metricLabel}>Open items</span>
              <strong className={styles.metricValue}>{dueBreakdown.total}</strong>
              <p className={styles.metricSub}>In this view</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Overdue</span>
              <strong className={styles.metricValue}>{dueBreakdown.overdue}</strong>
              <p className={styles.metricSub}>Needs attention</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Due soon</span>
              <strong className={styles.metricValue}>{dueBreakdown.warning}</strong>
              <p className={styles.metricSub}>Within {upcomingWindow} days</p>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>On track</span>
              <strong className={styles.metricValue}>{dueBreakdown.onTrack}</strong>
              <p className={styles.metricSub}>No near-term risk</p>
            </div>
          </div>
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
                  {formatDateTimeLabel(report.createdAt)} - {report.entries.length} tasks
                  {report.createdByName ? ` - ${report.createdByName}` : ''}
                </option>
              ))}
            </select>
          </label>
          {!isViewingSubmitted && !readOnly && (
            <span className={styles.draftBadge}>Live draft</span>
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
        <div className={styles.overallHeader}>
          <div>
            <span className={styles.fieldEyebrow}>Overall update</span>
            <p className={styles.fieldHint}>Summarize momentum, risks, or asks in a few lines.</p>
          </div>
          {!isViewingSubmitted && !readOnly && (
            <span className={styles.charCount}>
              {summary.length}/{SUMMARY_LIMIT}
            </span>
          )}
        </div>
        {isViewingSubmitted || readOnly ? (
          <p className={styles.readonlyUpdate}>{summary || 'No overall update provided.'}</p>
        ) : (
          <textarea
            value={summary}
            maxLength={SUMMARY_LIMIT}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Add color on progress, risks, cross-team asks"
            disabled={isSubmitting}
            className={styles.summaryInput}
          />
        )}
      </div>

      <div className={styles.listHeader}>
        <div className={styles.sortGroup}>
          <span className={styles.controlLabel}>Sort</span>
          {(['end', 'name', 'responsible', 'status'] as ColumnId[]).map((column) => (
            <button
              key={column}
              type="button"
              className={`${styles.sortChip} ${sort.column === column ? styles.sortChipActive : ''}`}
              onClick={() => handleSort(column)}
            >
              {columnConfig[column].label}
              <span className={styles.sortDirection}>
                {sort.column === column ? (sort.direction === 'asc' ? '^' : 'v') : ''}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotDanger}`} />
            Overdue
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotWarning}`} />
            Due soon
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendDotMuted}`} />
            Scheduled
          </span>
        </div>
      </div>

      <div className={styles.tableShell}>
        <div className={styles.tableHeader} role="row" style={{ gridTemplateColumns: tableTemplate }}>
          {(Object.keys(columnConfig) as ColumnId[]).map((column) => (
            <div
              key={column}
              className={`${styles.headerCell} ${column === 'actions' ? styles.headerCellTight : ''}`}
              role="columnheader"
              onClick={sortableColumns.has(column) ? () => handleSort(column) : undefined}
            >
              <span className={styles.headerLabel}>
                {columnConfig[column].label}
                {sortableColumns.has(column) && sort.column === column && <i className={styles.sortIndicator}>{sort.direction === 'asc' ? '^' : 'v'}</i>}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.tableBody} aria-label="Status report entries">
          {!sortedEntries.length ? (
            renderEmptyState()
          ) : (
            sortedEntries.map((entry, index) => {
              const dueState = buildDueState(entry, upcomingWindow);
              return (
                <div
                  key={entry.id}
                  className={`${styles.tableRow} ${styles[`tone-${dueState.tone}`]} ${index % 2 === 0 ? styles.rowEven : ''}`}
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
                    <p className={styles.description}>{entry.description || 'No description provided.'}</p>
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
                  <div className={styles.cell}>
                    <span className={styles.metaPill}>{initiativeNameLabel}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.metaPill}>{initiativeOwnerLabel}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.metaPill}>{recurringImpactLabel}</span>
                  </div>
                  <div className={styles.statusCell}>
                    <div className={styles.updateHeader}>
                      <span className={styles.controlLabel}>Status update</span>
                      {canEditDraft && (
                        <span className={styles.charCountSmall}>
                          {(entry.statusUpdate || '').length}/{STATUS_UPDATE_LIMIT}
                        </span>
                      )}
                    </div>
                    {isViewingSubmitted || readOnly ? (
                      <p className={styles.readonlyUpdate}>{entry.statusUpdate || 'No update provided.'}</p>
                    ) : (
                      <textarea
                        value={entry.statusUpdate}
                        maxLength={STATUS_UPDATE_LIMIT}
                        onChange={(event) => handleStatusChange(entry.taskId, event.target.value)}
                        placeholder="Share a quick headline or blocker"
                        disabled={isSubmitting}
                        className={styles.updateInput}
                      />
                    )}
                  </div>
                  <div className={`${styles.cell} ${styles.actionsCell}`}>
                    {canEditDraft && entry.source === 'manual' ? (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => handleRemoveManual(entry.taskId)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className={styles.dimPlaceholder}>-</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {canEditDraft && (
        <div className={styles.footerBar}>
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
            <p className={styles.hint}>Bring in tasks that were not auto-selected.</p>
          </div>

          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.tertiaryButton}
              onClick={handleSaveDraft}
              disabled={!draftEntries.length || isSubmitting}
            >
              Save draft
            </button>
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
