import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/GeneralSettingsScreen.module.css';
import {
  PeriodSettings,
  StatusReportSettings,
  usePlanSettingsState,
  useWorkstreamsState
} from '../../app/state/AppStateContext';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';
import {
  ProgramSnapshotDetail,
  ProgramSnapshotInitiativeSummary,
  SnapshotSettingsPayload,
  StageColumnKey
} from '../../shared/types/snapshot';
import { initiativeStageKeys, initiativeStageLabels } from '../../shared/types/initiative';
import { WorkstreamRoleOption, defaultWorkstreamRoleOptions } from '../../shared/types/workstream';

const DEFAULT_OPTIONS = ['Standard', 'Value Step', 'Change Management'];
const VALUE_STEP_LABEL = 'Value Step';
const dayOptions = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const frequencyOptions = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'every-4-weeks', label: 'Every 4 weeks' }
] as const;
const monthOptions = Array.from({ length: 12 }).map((_, index) => ({
  value: index + 1,
  label: new Date(2000, index, 1).toLocaleString('en-US', { month: 'long' })
}));

const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'full',
  timeStyle: 'short'
});

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  if (value >= 1073741824) {
    return `${(value / 1073741824).toFixed(1)} GB`;
  }
  if (value >= 1048576) {
    return `${(value / 1048576).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${Math.round(value)} B`;
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const impactFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const stageColumns: { key: StageColumnKey; label: string }[] = [
  { key: 'l0', label: 'L0' },
  { key: 'l1-gate', label: 'L1 Gate' },
  { key: 'l1', label: 'L1' },
  { key: 'l2-gate', label: 'L2 Gate' },
  { key: 'l2', label: 'L2' },
  { key: 'l3-gate', label: 'L3 Gate' },
  { key: 'l3', label: 'L3' },
  { key: 'l4-gate', label: 'L4 Gate' },
  { key: 'l4', label: 'L4' },
  { key: 'l5-gate', label: 'L5 Gate' },
  { key: 'l5', label: 'L5' }
];

interface SnapshotFormState {
  enabled: boolean;
  retentionDays: number;
  timezone: string;
  scheduleHour: number;
  scheduleMinute: number;
  kpiOptions: string[];
}

const normalizeOptions = (options: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  const source = Array.isArray(options) ? options : [];
  [...source, ...DEFAULT_OPTIONS].forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  });
  return result;
};

const buildFormState = (settings: SnapshotSettingsPayload | null): SnapshotFormState => ({
  enabled: settings?.enabled ?? false,
  retentionDays: settings?.retentionDays ?? Math.max(settings?.minimumRetentionDays ?? 30, 60),
  timezone: settings?.timezone ?? settings?.defaultTimezone ?? 'Australia/Sydney',
  scheduleHour: settings?.scheduleHour ?? 19,
  scheduleMinute: settings?.scheduleMinute ?? 0,
  kpiOptions: settings?.kpiOptions ?? []
});

const normalizeKpis = (options: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  options.forEach((raw) => {
    if (typeof raw !== 'string') {
      return;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(trimmed);
  });
  return result;
};

export const GeneralSettingsScreen = () => {
  const {
    milestoneTypes,
    saveMilestoneTypes,
    periodSettings,
    savePeriodSettings,
    statusReportSettings,
    saveStatusReportSettings
  } = usePlanSettingsState();
  const { roleOptions, saveRoleOptions } = useWorkstreamsState();
  const [draftOptions, setDraftOptions] = useState<string[]>(() => normalizeOptions(milestoneTypes));
  const [newOption, setNewOption] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [statusSettings, setStatusSettings] = useState<StatusReportSettings>(statusReportSettings);
  const [periodForm, setPeriodForm] = useState<PeriodSettings>(periodSettings);
  const [roleOptionDrafts, setRoleOptionDrafts] = useState<WorkstreamRoleOption[]>(roleOptions);
  const [rolesCollapsed, setRolesCollapsed] = useState(false);

  const [snapshotSettings, setSnapshotSettings] = useState<SnapshotSettingsPayload | null>(null);
  const [snapshotForm, setSnapshotForm] = useState<SnapshotFormState>(() => buildFormState(null));
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<ProgramSnapshotDetail | null>(null);
  const [latestSnapshotLoading, setLatestSnapshotLoading] = useState(false);
  const [latestSnapshotError, setLatestSnapshotError] = useState<string | null>(null);
  const [manualCaptureBusy, setManualCaptureBusy] = useState(false);
  const [newKpiOption, setNewKpiOption] = useState('');

  useEffect(() => {
    setDraftOptions(normalizeOptions(milestoneTypes));
  }, [milestoneTypes]);

  useEffect(() => {
    setStatusSettings(statusReportSettings);
  }, [statusReportSettings]);

  useEffect(() => {
    setPeriodForm(periodSettings);
  }, [periodSettings]);

  useEffect(() => {
    setRoleOptionDrafts(roleOptions);
  }, [roleOptions]);

  const normalizedOptions = useMemo(() => normalizeOptions(draftOptions), [draftOptions]);
  const slugifyRole = (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/--+/g, '-');

  const updateStatusSetting = <K extends keyof StatusReportSettings>(key: K, value: StatusReportSettings[K]) => {
    setStatusSettings((prev) => ({ ...prev, [key]: value }));
    setToast(null);
  };

  const handleSaveMilestones = () => {
    const normalized = normalizeOptions(draftOptions);
    setDraftOptions(normalized);
    saveMilestoneTypes(normalized);
    setToast('Milestone types updated.');
  };

  const handleSavePeriodSettings = () => {
    savePeriodSettings(periodForm);
    setToast('Period settings updated.');
  };

  const handleSaveStatusSettings = () => {
    saveStatusReportSettings(statusSettings);
    setToast('Reporting cadence saved.');
  };

  const handleRemove = (index: number) => {
    const target = normalizedOptions[index];
    if (!target || target.toLowerCase() === VALUE_STEP_LABEL.toLowerCase()) {
      return;
    }
    setDraftOptions((prev) => prev.filter((_, i) => i !== index));
    setToast(null);
  };

  const handleUpdate = (index: number, value: string) => {
    setDraftOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
    setToast(null);
  };

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) {
      return;
    }
    setDraftOptions((prev) => [...prev, trimmed]);
    setNewOption('');
    setToast(null);
  };

  const handleRoleOptionChange = (index: number, field: 'label' | 'value', value: string) => {
    setRoleOptionDrafts((prev) =>
      prev.map((option, i) => {
        if (i !== index) {
          return option;
        }
        const nextLabel = field === 'label' ? value : option.label;
        const nextValue =
          field === 'label'
            ? slugifyRole(value || option.value || `role-${index + 1}`)
            : slugifyRole(value || option.label || `role-${index + 1}`);
        return { ...option, label: nextLabel, value: nextValue };
      })
    );
    setToast(null);
  };

  const handleAddRoleOptionRow = () => {
    setRoleOptionDrafts((prev) => [
      ...prev,
      { label: '', value: `role-${prev.length + 1}-${Date.now().toString(36)}` }
    ]);
    setToast(null);
  };

  const handleRemoveRoleOption = (index: number) => {
    setRoleOptionDrafts((prev) => prev.filter((_, i) => i !== index));
    setToast(null);
  };

  const handleResetRoleOptions = () => {
    setRoleOptionDrafts([...defaultWorkstreamRoleOptions]);
    setToast(null);
  };

  const handleSaveRoleOptionList = async () => {
    const result = await saveRoleOptions(roleOptionDrafts);
    if (result.ok) {
      setRoleOptionDrafts(result.data);
      setToast('Workstream roles updated.');
    } else {
      setToast('Failed to update workstream roles.');
    }
  };

  const loadSnapshotSettings = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const payload = await snapshotsApi.getSettings();
      setSnapshotSettings(payload);
      setSnapshotForm(buildFormState(payload));
      setSnapshotError(null);
    } catch (err) {
      console.error('Failed to load snapshot settings:', err);
      setSnapshotSettings(null);
      setSnapshotError('Unable to load snapshot settings. Check the API connection and retry.');
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshotSettings();
  }, [loadSnapshotSettings]);

  const loadLatestSnapshot = useCallback(async () => {
    setLatestSnapshotLoading(true);
    try {
      const snapshot = await snapshotsApi.getLatestProgramSnapshot();
      setLatestSnapshot(snapshot);
      setLatestSnapshotError(null);
    } catch (err) {
      console.error('Failed to load latest snapshot:', err);
      setLatestSnapshot(null);
      setLatestSnapshotError('Unable to load the latest snapshot.');
    } finally {
      setLatestSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatestSnapshot();
  }, [loadLatestSnapshot]);

  const handleToggleEnabled = () => {
    setSnapshotForm((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleRetentionChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setSnapshotForm((prev) => ({
      ...prev,
      retentionDays: Number.isFinite(value) ? Math.max(1, Math.floor(value)) : prev.retentionDays
    }));
  };

  const handleTimezoneChange = (event: FormEvent<HTMLInputElement>) => {
    setSnapshotForm((prev) => ({ ...prev, timezone: event.currentTarget.value }));
  };

  const handleHourChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setSnapshotForm((prev) => ({
      ...prev,
      scheduleHour: Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : prev.scheduleHour
    }));
  };

  const handleMinuteChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setSnapshotForm((prev) => ({
      ...prev,
      scheduleMinute: Number.isFinite(value) ? Math.min(59, Math.max(0, Math.floor(value))) : prev.scheduleMinute
    }));
  };

  const handleAddKpiOption = () => {
    const trimmed = newKpiOption.trim();
    if (!trimmed) {
      return;
    }
    setSnapshotForm((prev) => {
      const next = normalizeKpis([...prev.kpiOptions, trimmed]);
      return { ...prev, kpiOptions: next };
    });
    setNewKpiOption('');
  };

  const handleRemoveKpiOption = (option: string) => {
    setSnapshotForm((prev) => ({
      ...prev,
      kpiOptions: prev.kpiOptions.filter((item) => item !== option)
    }));
  };

  const handleSaveSnapshotSettings = async () => {
    setSnapshotSaving(true);
    setSnapshotMessage(null);
    const normalizedKpis = normalizeKpis(snapshotForm.kpiOptions);
    setSnapshotForm((prev) => ({ ...prev, kpiOptions: normalizedKpis }));
    const minimumRetention = snapshotSettings?.minimumRetentionDays ?? 30;
    const retention = Math.max(minimumRetention, Math.max(1, Math.floor(snapshotForm.retentionDays || minimumRetention)));
    const timezone = snapshotForm.timezone?.trim() || snapshotSettings?.defaultTimezone || 'Australia/Sydney';
    const scheduleHour = Number.isFinite(snapshotForm.scheduleHour) ? Math.max(0, Math.min(23, Math.floor(snapshotForm.scheduleHour))) : 0;
    const scheduleMinute = Number.isFinite(snapshotForm.scheduleMinute)
      ? Math.max(0, Math.min(59, Math.floor(snapshotForm.scheduleMinute)))
      : 0;
    try {
      const payload = await snapshotsApi.updateSettings({
        enabled: snapshotForm.enabled,
        retentionDays: retention,
        timezone,
        scheduleHour,
        scheduleMinute,
        kpiOptions: normalizedKpis
      });
      setSnapshotSettings(payload);
      setSnapshotForm(buildFormState(payload));
      setSnapshotMessage('Snapshot settings saved.');
      setSnapshotError(null);
    } catch (err) {
      console.error('Failed to save snapshot settings:', err);
      setSnapshotError('Unable to save snapshot settings.');
    } finally {
      setSnapshotSaving(false);
    }
  };

  const handleManualCapture = useCallback(async () => {
    setManualCaptureBusy(true);
    setSnapshotMessage(null);
    try {
      await snapshotsApi.captureProgramSnapshot('full');
      await loadSnapshotSettings();
      await loadLatestSnapshot();
      setSnapshotMessage('Manual snapshot captured.');
      setSnapshotError(null);
    } catch (err) {
      console.error('Failed to capture manual snapshot:', err);
      setSnapshotError('Unable to capture a snapshot right now. Try again in a moment.');
    } finally {
      setManualCaptureBusy(false);
    }
  }, [loadLatestSnapshot, loadSnapshotSettings]);

  const handleDownloadSnapshot = useCallback(() => {
    if (!latestSnapshot) {
      return;
    }
    const blob = new Blob([JSON.stringify(latestSnapshot.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `snapshot-${latestSnapshot.dateKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [latestSnapshot]);

  const nextRunLabel = useMemo(() => {
    if (!snapshotSettings) {
      return 'Loading...';
    }
    if (!snapshotSettings.enabled) {
      return 'Automatic snapshots are disabled';
    }
    if (!snapshotSettings.nextRunAt) {
      return 'Next run will be scheduled shortly';
    }
    return dateTimeFormatter.format(new Date(snapshotSettings.nextRunAt));
  }, [snapshotSettings]);

  const lastAutoLabel = snapshotSettings?.lastAutomaticSnapshot
    ? dateTimeFormatter.format(new Date(snapshotSettings.lastAutomaticSnapshot.capturedAt))
    : 'No automatic snapshots yet';

  const stageSummaryRows = useMemo(() => {
    if (!latestSnapshot?.payload.stageSummary) {
      return [];
    }
    return initiativeStageKeys.map((stage) => {
      const entry = latestSnapshot.payload.stageSummary[stage];
      return {
        stage,
        label: initiativeStageLabels[stage],
        initiatives: entry?.initiatives ?? 0,
        approved: entry?.approved ?? 0,
        pendingGate: entry?.pendingGate ?? 0,
        impact: entry?.impact ?? 0
      };
    });
  }, [latestSnapshot]);

  const statusSummaryRows = latestSnapshot?.payload.statusSummary ?? [];
  const workstreamSummaryRows = latestSnapshot?.payload.workstreamSummary ?? [];
  const initiativeRows: ProgramSnapshotInitiativeSummary[] = useMemo(
    () =>
      (latestSnapshot?.payload.initiatives ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [latestSnapshot]
  );
  const stageGateMetricsRows = useMemo(() => {
    const metrics = latestSnapshot?.payload.stageGate?.metrics;
    if (!metrics) {
      return [];
    }
    return stageColumns.map((column) => ({
      key: column.key,
      label: column.label,
      initiatives: metrics[column.key]?.initiatives ?? 0,
      impact: metrics[column.key]?.impact ?? 0
    }));
  }, [latestSnapshot]);
  const stageGateWorkstreams = latestSnapshot?.payload.stageGate?.workstreams ?? [];
  const blueprint = latestSnapshot?.payload.financials?.blueprint ?? null;
  const snapshotMetrics = latestSnapshot?.payload.metrics;
  const snapshotTotals = latestSnapshot?.payload.totals;

  return (
    <section className={styles.wrapper}>
      <header className={styles.pageHero}>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Settings</p>
          <h1>General settings</h1>
          <p className={styles.lede}>
            One place to manage milestone types, planning period, reporting cadence, KPI catalog, and snapshot automation.
          </p>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Milestone types</span>
            <span className={styles.chip}>Period defaults</span>
            <span className={styles.chip}>Reporting cadence</span>
            <span className={styles.chip}>KPI catalog</span>
            <span className={styles.chip}>Snapshots</span>
          </div>
        </div>
      </header>

      <div className={styles.bannerStack}>
        {snapshotError && <div className={styles.errorBanner}>{snapshotError}</div>}
        {latestSnapshotError && <div className={styles.errorBanner}>{latestSnapshotError}</div>}
        {toast && <div className={styles.successBanner}>{toast}</div>}
        {snapshotMessage && <div className={styles.successBanner}>{snapshotMessage}</div>}
      </div>

      <section className={`${styles.card} ${styles.fullWidthCard}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <p className={styles.cardEyebrow}>Access control</p>
            <h3 className={styles.cardTitle}>Workstream roles</h3>
            <p className={styles.cardSubtitle}>Edit the role list used for account assignments and approvers.</p>
          </div>
          <div className={styles.cardActions}>
            <button
              className={`${styles.collapseButton} ${rolesCollapsed ? styles.collapsed : ''}`}
              type="button"
              aria-label={rolesCollapsed ? 'Expand workstream roles' : 'Collapse workstream roles'}
              onClick={() => setRolesCollapsed((prev) => !prev)}
            >
              ▾
            </button>
            <button className={styles.secondaryButton} type="button" onClick={handleResetRoleOptions}>
              Reset to defaults
            </button>
            <button className={styles.primaryButton} type="button" onClick={handleSaveRoleOptionList}>
              Save roles
            </button>
          </div>
        </div>

        {!rolesCollapsed && (
          <>
            <div className={styles.roleGrid}>
              {roleOptionDrafts.map((option, index) => (
                <div key={`${option.value || 'role'}-${index}`} className={styles.optionRow}>
                  <input
                    value={option.label}
                    onChange={(event) => handleRoleOptionChange(index, 'label', event.target.value)}
                    className={styles.optionInput}
                    placeholder="Display label"
                  />
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => handleRemoveRoleOption(index)}
                    title="Remove role"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addRow}>
              <button className={styles.secondaryButton} type="button" onClick={handleAddRoleOptionRow}>
                Add role
              </button>
            </div>
          </>
        )}
      </section>

      <div className={styles.sectionsGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Plan module</p>
              <h3 className={styles.cardTitle}>Milestone types</h3>
              <p className={styles.cardSubtitle}>Value Step is required, everything else is program-specific.</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={handleSaveMilestones}>
              Save
            </button>
          </div>

          <div className={styles.optionsGrid}>
            {normalizedOptions.map((option, index) => (
              <div key={`${option}${index}`} className={styles.optionRow}>
                <input
                  value={option}
                  onChange={(event) => handleUpdate(index, event.target.value)}
                  className={styles.optionInput}
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => handleRemove(index)}
                  disabled={option.toLowerCase() === VALUE_STEP_LABEL.toLowerCase()}
                  title={option.toLowerCase() === VALUE_STEP_LABEL.toLowerCase() ? 'Value Step cannot be removed' : ''}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className={styles.addRow}>
            <input
              value={newOption}
              onChange={(event) => setNewOption(event.target.value)}
              placeholder="Add milestone type"
            />
            <button className={styles.secondaryButton} type="button" onClick={handleAdd}>
              Add
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Access control</p>
              <h3 className={styles.cardTitle}>Workstream roles</h3>
              <p className={styles.cardSubtitle}>Edit the role list used for account assignments and approvers.</p>
            </div>
            <div className={styles.cardActions}>
              <button className={styles.secondaryButton} type="button" onClick={handleResetRoleOptions}>
                Reset to defaults
              </button>
              <button className={styles.primaryButton} type="button" onClick={handleSaveRoleOptionList}>
                Save roles
              </button>
            </div>
          </div>

          <div className={styles.optionsGrid}>
            {roleOptionDrafts.map((option, index) => (
              <div key={`${option.value || 'role'}-${index}`} className={styles.optionRow}>
                <input
                  value={option.label}
                  onChange={(event) => handleRoleOptionChange(index, 'label', event.target.value)}
                  className={styles.optionInput}
                  placeholder="Display label"
                />
                <input
                  value={option.value}
                  onChange={(event) => handleRoleOptionChange(index, 'value', event.target.value)}
                  className={styles.optionInput}
                  placeholder="Value (used internally)"
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => handleRemoveRoleOption(index)}
                  title="Remove role"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className={styles.addRow}>
            <button className={styles.secondaryButton} type="button" onClick={handleAddRoleOptionRow}>
              Add role
            </button>
            <p className={styles.helpText}>Roles save instantly to keep Account management and approvals in sync.</p>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Planning window</p>
              <h3 className={styles.cardTitle}>Period defaults</h3>
              <p className={styles.cardSubtitle}>One set of dates, applied across every initiative stage.</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={handleSavePeriodSettings}>
              Save period
            </button>
          </div>

          <div className={styles.settingsGrid}>
            <label className={styles.field}>
              <span>Period month</span>
              <select
                value={periodForm.periodMonth}
                onChange={(event) => {
                  setPeriodForm((prev) => ({
                    ...prev,
                    periodMonth: Number(event.target.value) || prev.periodMonth
                  }));
                  setToast(null);
                }}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Period year</span>
              <input
                type="number"
                min={2000}
                value={periodForm.periodYear}
                onChange={(event) => {
                  const year = Number(event.target.value);
                  setPeriodForm((prev) => ({
                    ...prev,
                    periodYear: Number.isFinite(year) ? year : prev.periodYear
                  }));
                  setToast(null);
                }}
              />
            </label>
          </div>
          <p className={styles.cardSubtitle}>Change once in settings and remove busywork from initiative editing.</p>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>Status reports</p>
              <h3 className={styles.cardTitle}>Reporting cadence</h3>
              <p className={styles.cardSubtitle}>Control template resets and what gets included each cycle.</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={handleSaveStatusSettings}>
              Save
            </button>
          </div>

          <div className={styles.settingsGrid}>
            <label className={styles.field}>
              <span>Template reset day</span>
              <select
                value={statusSettings.templateResetDay}
                onChange={(event) =>
                  updateStatusSetting('templateResetDay', event.target.value as StatusReportSettings['templateResetDay'])
                }
              >
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Template reset time</span>
              <input
                type="time"
                value={statusSettings.templateResetTime}
                onChange={(event) => updateStatusSetting('templateResetTime', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Report refresh frequency</span>
              <select
                value={statusSettings.refreshFrequency}
                onChange={(event) =>
                  updateStatusSetting('refreshFrequency', event.target.value as StatusReportSettings['refreshFrequency'])
                }
              >
                {frequencyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Submit deadline day</span>
              <select
                value={statusSettings.submitDeadlineDay}
                onChange={(event) =>
                  updateStatusSetting('submitDeadlineDay', event.target.value as StatusReportSettings['submitDeadlineDay'])
                }
              >
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Submit deadline time</span>
              <input
                type="time"
                value={statusSettings.submitDeadlineTime}
                onChange={(event) => updateStatusSetting('submitDeadlineTime', event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Upcoming window (days)</span>
              <input
                type="number"
                min={1}
                value={statusSettings.upcomingWindowDays}
                onChange={(event) =>
                  updateStatusSetting('upcomingWindowDays', Math.max(1, Number(event.target.value) || 1))
                }
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.cardEyebrow}>KPI catalog</p>
              <h3 className={styles.cardTitle}>Shared KPI options</h3>
              <p className={styles.cardSubtitle}>These KPIs appear in the initiative selector.</p>
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSaveSnapshotSettings}
              disabled={snapshotLoading || snapshotSaving}
            >
              {snapshotSaving ? 'Saving...' : 'Save catalog'}
            </button>
          </div>
          <div className={styles.kpiGrid}>
            {(snapshotForm.kpiOptions ?? []).map((option) => (
              <div key={option} className={styles.kpiRow}>
                <input
                  value={option}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSnapshotForm((prev) => ({
                      ...prev,
                      kpiOptions: prev.kpiOptions.map((item) => (item === option ? next : item))
                    }));
                  }}
                />
                <button className={styles.removeButton} type="button" onClick={() => handleRemoveKpiOption(option)}>
                  Remove
                </button>
              </div>
            ))}
            <div className={styles.kpiRow}>
              <input
                value={newKpiOption}
                onChange={(event) => setNewKpiOption(event.target.value)}
                placeholder="Add KPI"
              />
              <button className={styles.secondaryButton} type="button" onClick={handleAddKpiOption}>
                Add
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.card} ${styles.wideCard}`}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.cardEyebrow}>Snapshots</p>
            <h3 className={styles.cardTitle}>Automation and review</h3>
            <p className={styles.cardSubtitle}>Cadence, storage, and a quick peek at the latest capture.</p>
          </div>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleManualCapture}
              disabled={snapshotLoading || manualCaptureBusy}
            >
              {manualCaptureBusy ? 'Capturing...' : 'Capture snapshot'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                void loadSnapshotSettings();
                void loadLatestSnapshot();
              }}
              disabled={snapshotLoading || snapshotSaving}
            >
              Refresh status
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSaveSnapshotSettings}
              disabled={snapshotLoading || snapshotSaving}
            >
              {snapshotSaving ? 'Saving...' : 'Save snapshot settings'}
            </button>
          </div>
        </div>

        <div className={styles.layout}>
          <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
            <fieldset disabled={snapshotLoading || snapshotSaving}>
              <legend>Automation</legend>
              <div className={styles.toggleRow}>
                <div>
                  <p className={styles.label}>Automatic snapshots</p>
                  <p className={styles.helpText}>
                    Capture a full snapshot every day at the configured time. Runs in the background without user input.
                  </p>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" checked={snapshotForm.enabled} onChange={handleToggleEnabled} />
                  <span />
                </label>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="snapshot-hour">Hour (Sydney time)</label>
                  <input
                    id="snapshot-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={snapshotForm.scheduleHour}
                    onChange={handleHourChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="snapshot-minute">Minute</label>
                  <input
                    id="snapshot-minute"
                    type="number"
                    min={0}
                    max={59}
                    value={snapshotForm.scheduleMinute}
                    onChange={handleMinuteChange}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="snapshot-timezone">Timezone</label>
                  <input
                    id="snapshot-timezone"
                    type="text"
                    value={snapshotForm.timezone}
                    onChange={handleTimezoneChange}
                    placeholder={snapshotSettings?.defaultTimezone ?? 'Australia/Sydney'}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="snapshot-retention">Retention (days)</label>
                <input
                  id="snapshot-retention"
                  type="number"
                  min={snapshotSettings?.minimumRetentionDays ?? 30}
                  value={snapshotForm.retentionDays}
                  onChange={handleRetentionChange}
                />
                <p className={styles.helpText}>
                  Store at least {snapshotSettings?.minimumRetentionDays ?? 30} days. More history unlocks deeper trend
                  comparisons.
                </p>
              </div>
            </fieldset>
          </form>

          <aside className={styles.stats}>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Next automatic snapshot</p>
              <p className={styles.statValue}>{nextRunLabel}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Last automatic snapshot</p>
              <p className={styles.statValue}>{lastAutoLabel}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Stored program snapshots</p>
              <p className={styles.statValue}>
                {snapshotSettings?.storage.programCount ?? 0} ({formatBytes(snapshotSettings?.storage.programBytes ?? 0)})
              </p>
              <p className={styles.statMeta}>
                Avg {formatBytes(snapshotSettings?.storage.averageProgramBytes ?? 0)} per snapshot
              </p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Session snapshots</p>
              <p className={styles.statValue}>
                {snapshotSettings?.storage.sessionCount ?? 0} ({formatBytes(snapshotSettings?.storage.sessionBytes ?? 0)})
              </p>
              <p className={styles.statMeta}>Captured during sign-in/out for personalized comparisons</p>
            </article>
            {blueprint && (
              <article className={styles.statCard}>
                <p className={styles.statLabel}>Financial blueprint</p>
                <p className={styles.statValue}>
                  {blueprint.monthCount} months starting{' '}
                  {new Date(`${blueprint.startMonth}-01`).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                </p>
                <p className={styles.statMeta}>Ratios configured: {blueprint.ratios.length}</p>
              </article>
            )}
          </aside>
        </div>

        <div className={styles.viewer}>
          <header className={styles.viewerHeader}>
            <div>
              <h2>Latest snapshot</h2>
              <p className={styles.viewerSubtitle}>
                Inspect what is persisted during the most recent capture. Download JSON for deeper analysis.
              </p>
            </div>
            <div className={styles.viewerActions}>
              <button type="button" onClick={() => void loadLatestSnapshot()} disabled={latestSnapshotLoading}>
                {latestSnapshotLoading ? 'Loading...' : 'Refresh'}
              </button>
              <button type="button" onClick={handleDownloadSnapshot} disabled={!latestSnapshot}>
                Download JSON
              </button>
            </div>
          </header>
          {latestSnapshot && (
            <div className={styles.snapshotViewer}>
              <div className={styles.snapshotSummaryGrid}>
                <article className={styles.snapshotCard}>
                  <p className={styles.statLabel}>Captured</p>
                  <p className={styles.statValue}>{dateTimeFormatter.format(new Date(latestSnapshot.capturedAt))}</p>
                  <p className={styles.statMeta}>
                    {latestSnapshot.trigger === 'auto' ? 'Automatic' : 'Manual'} -{' '}
                    {formatBytes(latestSnapshot.payloadSizeBytes)}
                  </p>
                </article>
                <article className={styles.snapshotCard}>
                  <p className={styles.statLabel}>Portfolio size</p>
                  <p className={styles.statValue}>
                    {numberFormatter.format(snapshotMetrics?.initiatives ?? 0)} initiatives
                  </p>
                  <p className={styles.statMeta}>
                    {numberFormatter.format(snapshotMetrics?.workstreams ?? 0)} workstreams -{' '}
                    {numberFormatter.format(snapshotMetrics?.participants ?? 0)} participants
                  </p>
                </article>
                <article className={styles.snapshotCard}>
                  <p className={styles.statLabel}>Recurring impact</p>
                  <p className={styles.statValue}>{impactFormatter.format(snapshotTotals?.recurringImpact ?? 0)}</p>
                  <p className={styles.statMeta}>
                    Benefits {impactFormatter.format(snapshotTotals?.recurringBenefits ?? 0)} - Costs{' '}
                    {impactFormatter.format(snapshotTotals?.recurringCosts ?? 0)}
                  </p>
                </article>
              </div>

              <div className={styles.snapshotTables}>
                <section>
                  <h3>Stage summary</h3>
                  <table className={styles.snapshotTable}>
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>Pending gate</th>
                        <th>Approved</th>
                        <th>Total initiatives</th>
                        <th>Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageSummaryRows.map((row) => (
                        <tr key={row.stage}>
                          <th scope="row">{row.label}</th>
                          <td>{numberFormatter.format(row.pendingGate)}</td>
                          <td>{numberFormatter.format(row.approved)}</td>
                          <td>{numberFormatter.format(row.initiatives)}</td>
                          <td>{impactFormatter.format(row.impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                {stageGateMetricsRows.length > 0 && (
                  <section>
                    <h3>Stage-gate columns</h3>
                    <table className={styles.snapshotTable}>
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Initiatives</th>
                          <th>Impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageGateMetricsRows.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">{row.label}</th>
                            <td>{numberFormatter.format(row.initiatives)}</td>
                            <td>{impactFormatter.format(row.impact)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                <section>
                  <h3>Status breakdown</h3>
                  <ul className={styles.snapshotList}>
                    {statusSummaryRows.map((entry) => (
                      <li key={entry.status}>
                        <span>{entry.status}</span>
                        <strong>{numberFormatter.format(entry.initiatives)}</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3>Workstream impact</h3>
                  <table className={styles.snapshotTable}>
                    <thead>
                      <tr>
                        <th>Workstream</th>
                        <th>Initiatives</th>
                        <th>Recurring impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workstreamSummaryRows.map((entry) => (
                        <tr key={entry.id}>
                          <th scope="row">{entry.name}</th>
                          <td>{numberFormatter.format(entry.initiatives)}</td>
                          <td>{impactFormatter.format(entry.impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                {stageGateWorkstreams.length > 0 && (
                  <section>
                    <h3>Stage-gate workstreams</h3>
                    <table className={styles.snapshotTable}>
                      <thead>
                        <tr>
                          <th>Workstream</th>
                          <th>Initiatives</th>
                          <th>Recurring impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageGateWorkstreams.map((row) => (
                          <tr key={row.id}>
                            <th scope="row">{row.name}</th>
                            <td>{numberFormatter.format(row.totals.initiatives)}</td>
                            <td>{impactFormatter.format(row.totals.impact)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </div>

              <section className={styles.snapshotSection}>
                <h3>Initiatives snapshot ({initiativeRows.length})</h3>
                <div className={styles.tableScroll}>
                  <table className={styles.snapshotTable}>
                    <thead>
                      <tr>
                        <th>Initiative</th>
                        <th>Workstream</th>
                        <th>Stage</th>
                        <th>Status</th>
                        <th>Owner</th>
                        <th>Recurring impact</th>
                        <th>Recurring costs</th>
                        <th>One-off benefits</th>
                        <th>One-off costs</th>
                        <th>Plan window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {initiativeRows.map((initiative) => (
                        <tr key={initiative.id}>
                          <th scope="row">
                            <div className={styles.initiativeName}>{initiative.name}</div>
                            <div className={styles.initiativeMeta}>
                              Created {new Date(initiative.createdAt).toLocaleDateString()}
                            </div>
                          </th>
                          <td>{initiative.workstreamName ?? 'Unassigned'}</td>
                          <td>{initiative.activeStage.toUpperCase()}</td>
                          <td>{initiative.currentStatus || 'Unknown'}</td>
                          <td>{initiative.ownerName ?? '--'}</td>
                          <td>{impactFormatter.format(initiative.totals.recurringImpact ?? 0)}</td>
                          <td>{impactFormatter.format(initiative.totals.recurringCosts ?? 0)}</td>
                          <td>{impactFormatter.format(initiative.totals.oneoffBenefits ?? 0)}</td>
                          <td>{impactFormatter.format(initiative.totals.oneoffCosts ?? 0)}</td>
                          <td>
                            {initiative.timeline.startDate && initiative.timeline.endDate
                              ? `${new Date(initiative.timeline.startDate).toLocaleDateString()} - ${new Date(
                                  initiative.timeline.endDate
                                ).toLocaleDateString()} (${initiative.timeline.durationDays ?? '?'} d)`
                              : 'No plan'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <details className={styles.snapshotRaw}>
                <summary>Raw payload</summary>
                <pre>{JSON.stringify(latestSnapshot.payload, null, 2)}</pre>
              </details>
            </div>
          )}
          {!latestSnapshot && !latestSnapshotLoading && !latestSnapshotError && (
            <p className={styles.helpText}>No snapshots captured yet.</p>
          )}
        </div>
      </section>
    </section>
  );
};
