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
import { ApiError } from '../../../../shared/api/httpClient';
import { useAuth } from '../../../auth/AuthContext';
import { StatusReportSettings, usePlanSettingsState } from '../../../../app/state/AppStateContext';
import { ChevronIcon } from '../../../../components/icons/ChevronIcon';

interface InitiativeStatusReportModuleProps {
  plan: InitiativePlanModel;
  initiativeId: string;
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
  | 'due'
  | 'status';

const columnConfig: Record<
  ColumnId,
  { label: string; minWidth: number; maxWidth: number; defaultWidth: number; resizable: boolean }
> = {
  name: { label: 'Task', minWidth: 200, maxWidth: 420, defaultWidth: 240, resizable: true },
  description: { label: 'Description', minWidth: 160, maxWidth: 520, defaultWidth: 220, resizable: true },
  responsible: { label: 'Responsible', minWidth: 130, maxWidth: 240, defaultWidth: 160, resizable: true },
  start: { label: 'Start', minWidth: 96, maxWidth: 180, defaultWidth: 110, resizable: true },
  end: { label: 'End', minWidth: 96, maxWidth: 180, defaultWidth: 110, resizable: true },
  due: { label: 'Due', minWidth: 120, maxWidth: 220, defaultWidth: 140, resizable: true },
  status: { label: 'Status update', minWidth: 320, maxWidth: 1100, defaultWidth: 400, resizable: true }
};

const dayToIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const parseResetTime = (value: string) => {
  const [hoursRaw, minutesRaw] = value.split(':');
  const hours = Number.parseInt(hoursRaw ?? '', 10);
  const minutes = Number.parseInt(minutesRaw ?? '', 10);
  return {
    hours: Number.isFinite(hours) && hours >= 0 && hours < 24 ? hours : 9,
    minutes: Number.isFinite(minutes) && minutes >= 0 && minutes < 60 ? minutes : 0
  };
};

const getFrequencyWeeks = (frequency: StatusReportSettings['refreshFrequency']) => {
  switch (frequency) {
    case 'biweekly':
      return 2;
    case 'every-4-weeks':
      return 4;
    default:
      return 1;
  }
};

const getCurrentWindowStart = (settings: StatusReportSettings, now = new Date()) => {
  const { hours, minutes } = parseResetTime(settings.templateResetTime);
  const resetDayIndex = dayToIndex[settings.templateResetDay] ?? 1;
  const base = new Date(now.getFullYear(), 0, 1, hours, minutes, 0, 0);
  const baseDay = base.getDay();
  const offset = (resetDayIndex - baseDay + 7) % 7;
  base.setDate(base.getDate() + offset);

  const periodMs = getFrequencyWeeks(settings.refreshFrequency) * 7 * 24 * 60 * 60 * 1000;
  let windowStart = new Date(base);

  while (windowStart.getTime() + periodMs <= now.getTime()) {
    windowStart = new Date(windowStart.getTime() + periodMs);
  }

  while (windowStart.getTime() > now.getTime()) {
    windowStart = new Date(windowStart.getTime() - periodMs);
  }

  return windowStart;
};

const cleanStatusUpdate = (value: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^status update[:.]?$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
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
    return { label: 'No end date', tone: 'muted' as const, days: null };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = diffInDays(today, parsed);
  if (diff < 0) {
    return { label: `${Math.abs(diff)}d overdue`, tone: 'negative' as const, days: diff };
  }
  if (diff === 0) {
    return { label: 'Due today', tone: 'warning' as const, days: diff };
  }
  if (diff <= windowDays) {
    return { label: `Due in ${diff}d`, tone: 'warning' as const, days: diff };
  }
  return { label: `Due in ${diff}d`, tone: 'muted' as const, days: diff };
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
        statusUpdate: cleanStatusUpdate(existing.statusUpdate),
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
      next.push({ ...entry, statusUpdate: cleanStatusUpdate(entry.statusUpdate) });
    }
  });
  return next;
};

const normalizeReport = (report: InitiativeStatusReport): InitiativeStatusReport => ({
  ...report,
  entries: report.entries.map((entry) => ({ ...entry, statusUpdate: cleanStatusUpdate(entry.statusUpdate) }))
});

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
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [timeAnchor, setTimeAnchor] = useState(Date.now());
  const [sort, setSort] = useState<{ column: ColumnId; direction: 'asc' | 'desc' }>({
    column: 'end',
    direction: 'asc'
  });
  const draftStorageKey = useMemo(() => buildDraftStorageKey(initiativeId), [initiativeId]);
  const draftLoadedRef = useRef(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(() =>
    (Object.keys(columnConfig) as ColumnId[]).reduce((acc, key) => {
      acc[key] = columnConfig[key].defaultWidth;
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

  const currentWindowStart = useMemo(
    () => getCurrentWindowStart(statusReportSettings, new Date(timeAnchor)),
    [statusReportSettings, timeAnchor]
  );

  const currentPeriodReport = useMemo(() => {
    const startTimestamp = currentWindowStart.getTime();
    return (
      sortedReports.find((report) => {
        const created = new Date(report.createdAt);
        if (Number.isNaN(created.getTime())) {
          return false;
        }
        return created.getTime() >= startTimestamp;
      }) ?? null
    );
  }, [currentWindowStart, sortedReports]);

  const hasSubmittedCurrentPeriod = Boolean(currentPeriodReport);

  useEffect(() => {
    if (hasSubmittedCurrentPeriod && selectedReportId === 'draft' && currentPeriodReport) {
      setSelectedReportId(currentPeriodReport.id);
    }
  }, [currentPeriodReport, hasSubmittedCurrentPeriod, selectedReportId]);

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
        case 'due': {
          const aState = buildDueState(a, upcomingWindow);
          const bState = buildDueState(b, upcomingWindow);
          const aDays = aState.days ?? Number.MAX_SAFE_INTEGER;
          const bDays = bState.days ?? Number.MAX_SAFE_INTEGER;
          return direction * (aDays - bDays);
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
    const loadDraft = async () => {
      if (selectedReportId !== 'draft' || draftLoadedRef.current) {
        return;
      }
      try {
        const serverDraft = await initiativesApi.getStatusReportDraft(initiativeId);
        if (serverDraft) {
          setSummary(serverDraft.summary || '');
          setDraftEntries(mergeEntriesWithTasks(serverDraft.entries ?? [], upcomingTasks));
          draftLoadedRef.current = true;
          return;
        }
      } catch {
        // ignore server draft errors and fallback to local
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
    };
    void loadDraft();
  }, [draftStorageKey, initiativeId, upcomingTasks, selectedReportId]);

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
        setReports((result ?? []).map(normalizeReport));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setReports([]);
          return;
        }
        setError('Failed to load submitted reports.');
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
    setDraftNotice(null);
    setSubmitNotice(null);
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
    if (value === 'draft' && hasSubmittedCurrentPeriod && currentPeriodReport) {
      setSelectedReportId(currentPeriodReport.id);
      setDraftNotice('Report already submitted for this period.');
      setSubmitNotice(null);
      return;
    }
    const targetReport = sortedReports.find((report) => report.id === value) ?? null;
    setSelectedReportId(value);
    setMessage(null);
    setError(null);
    if (value === 'draft' && selectedReportId !== 'draft') {
      const restored = hydrateDraftFromStorage();
      if (!restored) {
        setDraftEntries(mergeEntriesWithTasks([], upcomingTasks));
        setSummary('');
      }
    } else if (value !== 'draft' && targetReport) {
      setSummary(targetReport.summary || '');
    }
  };

  const handleAddTask = () => {
    const selected = pendingTaskId
      ? availableTasks.find((task) => task.id === pendingTaskId)
      : availableTasks[0];
    if (!selected) {
      return;
    }
    setDraftNotice(null);
    setSubmitNotice(null);
    setDraftEntries((current) => [...current, buildEntryFromTask(selected, 'manual')]);
    setPendingTaskId('');
    setMessage(null);
  };

  const handleRemoveManual = (taskId: string) => {
    setDraftEntries((current) => current.filter((entry) => !(entry.taskId === taskId && entry.source === 'manual')));
    setMessage('Manual task removed.');
    setDraftNotice(null);
  };

  const persistDraft = useCallback(
    async (silent = false) => {
      if (isViewingSubmitted || readOnly) {
        return;
      }
      const normalizedEntries = draftEntries.map((entry) => ({
        ...entry,
        statusUpdate: cleanStatusUpdate(entry.statusUpdate)
      }));
      const payload = {
        summary,
        entries: normalizedEntries,
        savedAt: new Date().toISOString()
      };
      setIsSavingDraft(true);
      const actor = session
        ? {
            accountId: session.accountId,
            name: session.email
          }
        : undefined;
      try {
        await initiativesApi.saveStatusReportDraft(initiativeId, { entries: normalizedEntries, summary }, actor);
      } catch {
        // backend draft endpoint may be unavailable; rely on local storage without surfacing an error
      }
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        if (!silent) {
          setError(null);
          setDraftNotice('Draft saved locally.');
          setMessage(null);
        }
      } catch {
        if (!silent) {
          setError('Failed to save draft locally.');
        }
      }
      setIsSavingDraft(false);
    },
    [draftEntries, draftStorageKey, initiativeId, isViewingSubmitted, readOnly, session, summary]
  );

  const handleSaveDraft = () => {
    if (hasSubmittedCurrentPeriod) {
      setDraftNotice('This period is already submitted.');
      return;
    }
    void persistDraft();
  };

  const handleSubmit = async () => {
    if (!draftEntries.length || readOnly || hasSubmittedCurrentPeriod) {
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
      statusUpdate: cleanStatusUpdate(entry.statusUpdate),
      source: entry.source
    }));
    const payload: InitiativeStatusReportPayload = {
      entries: entriesPayload,
      summary
    };
    try {
      const report = await initiativesApi.submitStatusReport(initiativeId, payload, actor);
      setReports((current) => [normalizeReport(report), ...current]);
      setSelectedReportId(report.id);
      setSummary(report.summary || '');
      setSubmitNotice('Report submitted and locked.');
      setMessage(null);
      setDraftNotice(null);
      localStorage.removeItem(draftStorageKey);
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

  const columnsOrder: ColumnId[] = ['name', 'description', 'responsible', 'start', 'end', 'due', 'status'];

  const tableTemplate = columnsOrder
    .map((id) =>
      id === 'status'
        ? `minmax(${columnWidths[id]}px, 1fr)`
        : `${columnWidths[id]}px`
    )
    .join(' ');

  const canEditDraft = !isViewingSubmitted && !readOnly && !hasSubmittedCurrentPeriod;
  const sortableColumns = new Set<ColumnId>(['name', 'description', 'responsible', 'start', 'end', 'due', 'status']);
  const startResize = (column: ColumnId, startX: number) => {
    const config = columnConfig[column];
    if (!config.resizable) {
      return;
    }
    resizeStateRef.current = {
      column,
      startX,
      startWidth: columnWidths[column] ?? config.defaultWidth
    };
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const timer = window.setInterval(() => setTimeAnchor(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={styles.reportSection} aria-label="Status report">
      <header className={styles.reportHeader}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand status report' : 'Collapse status report'}
          >
            <ChevronIcon direction={isCollapsed ? 'right' : 'down'} size={14} />
          </button>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Milestone plan - actuals</p>
            <div className={styles.titleRow}>
              <h4 className={styles.title}>Status report</h4>
              {isViewingSubmitted && <span className={styles.lockBadge}>Submitted snapshot</span>}
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
              <option value="draft" disabled={hasSubmittedCurrentPeriod}>Current draft</option>
              {sortedReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {formatDateTimeLabel(report.createdAt)} - {report.entries.length} tasks
                  {report.createdByName ? ` - ${report.createdByName}` : ''}
                </option>
              ))}
            </select>
          </label>
          {hasSubmittedCurrentPeriod ? (
            <span className={styles.lockBadge}>This period submitted</span>
          ) : (
            !isViewingSubmitted && !readOnly && <span className={styles.draftBadge}>Live draft</span>
          )}
        </div>
      </header>

      {!isCollapsed && (
        <div className={styles.headerDetails}>
          <p className={styles.subtitle}>
            Upcoming and overdue tasks from the plan. Add a quick update and submit a snapshot.
          </p>
          <div className={styles.helperBar}>
            <span className={styles.helperChip}>Template reset: {statusReportSettings.templateResetDay} @ {statusReportSettings.templateResetTime}</span>
            <span className={styles.helperChip}>Submit by: {statusReportSettings.submitDeadlineDay} @ {statusReportSettings.submitDeadlineTime}</span>
            <span className={styles.helperChip}>Refresh: {statusReportSettings.refreshFrequency}</span>
          </div>
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
      )}

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
      {!isCollapsed && (
        <>
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
                onChange={(event) => {
                  setDraftNotice(null);
                  setSubmitNotice(null);
                  setSummary(event.target.value);
                }}
                placeholder="Add color on progress, risks, cross-team asks"
                disabled={isSubmitting}
                className={styles.summaryInput}
              />
            )}
          </div>

          <div className={styles.listHeader}>
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
              {columnsOrder.map((column) => (
                <div
                  key={column}
                  className={styles.headerCell}
                  role="columnheader"
                  onClick={sortableColumns.has(column) ? () => handleSort(column) : undefined}
                >
                  <span className={styles.headerLabel}>
                    {columnConfig[column].label}
                    {sortableColumns.has(column) && sort.column === column && <i className={styles.sortIndicator}>{sort.direction === 'asc' ? '^' : 'v'}</i>}
                  </span>
                  {columnConfig[column].resizable && (
                    <span
                      className={styles.columnResizer}
                      role="separator"
                      aria-label={`Resize ${columnConfig[column].label} column`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startResize(column, event.clientX);
                      }}
                    />
                  )}
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
                    <div className={styles.taskTitleRow}>
                      <div className={styles.taskTitle}>{entry.name || 'Untitled task'}</div>
                      {canEditDraft && entry.source === 'manual' && (
                        <button
                          type="button"
                          className={styles.inlineRemove}
                          onClick={() => handleRemoveManual(entry.taskId)}
                        >
                          Remove
                        </button>
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
                    <span className={styles.dateText}>{formatDateLabel(entry.startDate)}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.dateText}>{formatDateLabel(entry.endDate)}</span>
                  </div>
                  <div className={styles.cell}>
                    <span className={styles.metaText}>{dueState.label}</span>
                  </div>
                  <div className={styles.statusCell}>
                    {canEditDraft && (
                      <div className={styles.updateHeader}>
                        <span className={styles.charCountSmall}>
                          {(entry.statusUpdate || '').length}/{STATUS_UPDATE_LIMIT}
                        </span>
                      </div>
                    )}
                    {isViewingSubmitted || readOnly ? (
                      <p className={styles.readonlyUpdate}>
                        {(() => {
                          const cleaned = (entry.statusUpdate || '').trim();
                          if (!cleaned || /^status update[:.]?$/i.test(cleaned)) {
                            return 'No update provided.';
                          }
                          return cleaned;
                        })()}
                      </p>
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
              disabled={!draftEntries.length || isSubmitting || isSavingDraft}
            >
                  {isSavingDraft ? 'Saving...' : 'Save draft'}
            </button>
            {draftNotice && <span className={styles.inlineNotice}>{draftNotice}</span>}
            <button
              type="button"
              className={styles.primaryButton}
                  onClick={handleSubmit}
                  disabled={!draftEntries.length || isSubmitting || readOnly}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit report'}
                </button>
                {submitNotice && <span className={styles.inlineNotice}>{submitNotice}</span>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

