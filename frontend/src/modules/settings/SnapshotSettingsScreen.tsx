import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/SnapshotSettingsScreen.module.css';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';
import {
  ProgramSnapshotDetail,
  ProgramSnapshotInitiativeSummary,
  ProgramSnapshotParticipantSummary,
  ProgramSnapshotWorkstreamSummary,
  SnapshotSettingsPayload,
  StageColumnKey
} from '../../shared/types/snapshot';
import { initiativeStageKeys, initiativeStageLabels } from '../../shared/types/initiative';

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
}

const buildFormState = (settings: SnapshotSettingsPayload | null): SnapshotFormState => ({
  enabled: settings?.enabled ?? false,
  retentionDays: settings?.retentionDays ?? Math.max(settings?.minimumRetentionDays ?? 30, 60),
  timezone: settings?.timezone ?? settings?.defaultTimezone ?? 'Australia/Sydney',
  scheduleHour: settings?.scheduleHour ?? 19,
  scheduleMinute: settings?.scheduleMinute ?? 0
});

export const SnapshotSettingsScreen = () => {
  const [settings, setSettings] = useState<SnapshotSettingsPayload | null>(null);
  const [form, setForm] = useState<SnapshotFormState>(() => buildFormState(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<ProgramSnapshotDetail | null>(null);
  const [latestSnapshotLoading, setLatestSnapshotLoading] = useState(false);
  const [latestSnapshotError, setLatestSnapshotError] = useState<string | null>(null);
  const [manualCaptureBusy, setManualCaptureBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await snapshotsApi.getSettings();
      setSettings(payload);
      setForm(buildFormState(payload));
      setError(null);
    } catch (err) {
      console.error('Failed to load snapshot settings:', err);
      setError('Unable to load settings. Check the API connectivity and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadLatestSnapshot = useCallback(async () => {
    setLatestSnapshotLoading(true);
    try {
      const snapshot = await snapshotsApi.getLatestProgramSnapshot();
      setLatestSnapshot(snapshot);
      setLatestSnapshotError(null);
    } catch (err) {
      console.error('Failed to load latest snapshot:', err);
      setLatestSnapshot(null);
      setLatestSnapshotError('Unable to load the latest snapshot preview.');
    } finally {
      setLatestSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatestSnapshot();
  }, [loadLatestSnapshot]);

  const handleToggleEnabled = () => {
    setForm((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleRetentionChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setForm((prev) => ({
      ...prev,
      retentionDays: Number.isFinite(value) ? Math.max(1, Math.floor(value)) : prev.retentionDays
    }));
  };

  const handleTimezoneChange = (event: FormEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, timezone: event.currentTarget.value }));
  };

  const handleHourChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setForm((prev) => ({
      ...prev,
      scheduleHour: Number.isFinite(value) ? Math.min(23, Math.max(0, Math.floor(value))) : prev.scheduleHour
    }));
  };

  const handleMinuteChange = (event: FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setForm((prev) => ({
      ...prev,
      scheduleMinute: Number.isFinite(value) ? Math.min(59, Math.max(0, Math.floor(value))) : prev.scheduleMinute
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = await snapshotsApi.updateSettings({
        enabled: form.enabled,
        retentionDays: form.retentionDays,
        timezone: form.timezone,
        scheduleHour: form.scheduleHour,
        scheduleMinute: form.scheduleMinute
      });
      setSettings(payload);
      setForm(buildFormState(payload));
      setMessage('Settings saved successfully.');
      setError(null);
    } catch (err) {
      console.error('Failed to save snapshot settings:', err);
      setError('Unable to save settings. Review input values and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleManualCapture = useCallback(async () => {
    setManualCaptureBusy(true);
    setMessage(null);
    try {
      await snapshotsApi.captureProgramSnapshot('full');
      await loadSettings();
      await loadLatestSnapshot();
      setMessage('Manual snapshot captured successfully.');
      setError(null);
    } catch (err) {
      console.error('Failed to capture manual snapshot:', err);
      setError('Unable to capture a snapshot right now. Try again in a moment.');
    } finally {
      setManualCaptureBusy(false);
    }
  }, [loadLatestSnapshot, loadSettings]);

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
    if (!settings) {
      return 'Loading...';
    }
    if (!settings.enabled) {
      return 'Automatic snapshots are disabled';
    }
    if (!settings.nextRunAt) {
      return 'Next run will be scheduled shortly';
    }
    return dateTimeFormatter.format(new Date(settings.nextRunAt));
  }, [settings]);

  const lastAutoLabel = settings?.lastAutomaticSnapshot
    ? dateTimeFormatter.format(new Date(settings.lastAutomaticSnapshot.capturedAt))
    : 'No automatic snapshot captured yet';

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
  const workstreamDetails: ProgramSnapshotWorkstreamSummary[] = useMemo(
    () => (latestSnapshot?.payload.workstreams ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [latestSnapshot]
  );
  const participantRows: ProgramSnapshotParticipantSummary[] = useMemo(
    () => (latestSnapshot?.payload.participants ?? []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName)),
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
      <header className={styles.header}>
        <div>
          <h1>Snapshot settings</h1>
          <p className={styles.subtitle}>
            Control how and when the platform captures program-wide snapshots. Use these snapshots to highlight trends,
            power comparative dashboards, and keep audit trails for governance reviews.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={handleManualCapture} disabled={loading || manualCaptureBusy}>
            {manualCaptureBusy ? 'Capturing...' : 'Capture snapshot now'}
          </button>
          <button type="button" onClick={loadSettings} disabled={loading || saving}>
            Refresh status
          </button>
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </header>

      {error && <p className={styles.errorBanner}>{error}</p>}
      {message && <p className={styles.successBanner}>{message}</p>}

      <div className={styles.layout}>
        <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
          <fieldset disabled={loading || saving}>
            <legend>Automation</legend>
            <div className={styles.toggleRow}>
              <div>
                <p className={styles.label}>Automatic snapshots</p>
                <p className={styles.helpText}>
                  Capture a full snapshot every day at the configured time. This runs in the background without user
                  interaction.
                </p>
              </div>
              <label className={styles.switch}>
                <input type="checkbox" checked={form.enabled} onChange={handleToggleEnabled} />
                <span />
              </label>
              {blueprint && (
                <article className={styles.snapshotCard}>
                  <p className={styles.statLabel}>Financial blueprint</p>
                  <p className={styles.statValue}>
                    {blueprint.monthCount} months starting{' '}
                    {new Date(`${blueprint.startMonth}-01`).toLocaleString('en-US', {
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                  <p className={styles.statMeta}>Ratios configured: {blueprint.ratios.length}</p>
                </article>
              )}
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="snapshot-hour">Hour (Sydney time)</label>
                <input
                  id="snapshot-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={form.scheduleHour}
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
                  value={form.scheduleMinute}
                  onChange={handleMinuteChange}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="snapshot-timezone">Timezone</label>
                <input
                  id="snapshot-timezone"
                  type="text"
                  value={form.timezone}
                  onChange={handleTimezoneChange}
                  placeholder={settings?.defaultTimezone ?? 'Australia/Sydney'}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="snapshot-retention">Retention (days)</label>
              <input
                id="snapshot-retention"
                type="number"
                min={settings?.minimumRetentionDays ?? 30}
                value={form.retentionDays}
                onChange={handleRetentionChange}
              />
              <p className={styles.helpText}>
                Store at least {settings?.minimumRetentionDays ?? 30} days. Longer retention increases storage usage but
                enables deeper comparisons (e.g., 60-90 days for quarterly trend reviews).
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
              {settings?.storage.programCount ?? 0} records ({formatBytes(settings?.storage.programBytes ?? 0)})
            </p>
            <p className={styles.statMeta}>
              Average size {formatBytes(settings?.storage.averageProgramBytes ?? 0)} per snapshot
            </p>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>Session snapshots</p>
            <p className={styles.statValue}>
              {settings?.storage.sessionCount ?? 0} records ({formatBytes(settings?.storage.sessionBytes ?? 0)})
            </p>
            <p className={styles.statMeta}>Captured during login/logout for personalized comparisons</p>
          </article>
        </aside>
      </div>

      <section className={styles.viewer}>
        <header className={styles.viewerHeader}>
          <div>
            <h2>Latest snapshot preview</h2>
            <p className={styles.viewerSubtitle}>
              Quickly inspect what exactly is persisted during the most recent capture. Use the download option for
              deeper offline analysis.
            </p>
          </div>
          <div className={styles.viewerActions}>
            <button type="button" onClick={loadLatestSnapshot} disabled={latestSnapshotLoading}>
              {latestSnapshotLoading ? 'Loading...' : 'Load latest snapshot'}
            </button>
            <button type="button" onClick={handleDownloadSnapshot} disabled={!latestSnapshot}>
              Download JSON
            </button>
          </div>
        </header>
        {latestSnapshotError && <p className={styles.errorBanner}>{latestSnapshotError}</p>}
        {latestSnapshot && (
          <div className={styles.snapshotViewer}>
            <div className={styles.snapshotSummaryGrid}>
              <article className={styles.snapshotCard}>
                <p className={styles.statLabel}>Captured</p>
                <p className={styles.statValue}>{dateTimeFormatter.format(new Date(latestSnapshot.capturedAt))}</p>
                <p className={styles.statMeta}>
                  {latestSnapshot.trigger === 'auto' ? 'Automatic run' : 'Manual request'} ·{' '}
                  {formatBytes(latestSnapshot.payloadSizeBytes)}
                </p>
              </article>
              <article className={styles.snapshotCard}>
                <p className={styles.statLabel}>Portfolio size</p>
                <p className={styles.statValue}>
                  {numberFormatter.format(snapshotMetrics?.initiatives ?? 0)} initiatives
                </p>
                <p className={styles.statMeta}>
                  {numberFormatter.format(snapshotMetrics?.workstreams ?? 0)} workstreams •{' '}
                  {numberFormatter.format(snapshotMetrics?.participants ?? 0)} participants
                </p>
              </article>
              <article className={styles.snapshotCard}>
                <p className={styles.statLabel}>Recurring impact</p>
                <p className={styles.statValue}>{impactFormatter.format(snapshotTotals?.recurringImpact ?? 0)}</p>
                <p className={styles.statMeta}>
                  Recurring benefits {impactFormatter.format(snapshotTotals?.recurringBenefits ?? 0)} • Costs{' '}
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

            {workstreamDetails.length > 0 && (
              <section className={styles.snapshotSection}>
                <h3>Workstream snapshot ({workstreamDetails.length})</h3>
                <div className={styles.tableScroll}>
                  <table className={styles.snapshotTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workstreamDetails.map((workstream) => (
                        <tr key={workstream.id}>
                          <th scope="row">{workstream.name}</th>
                          <td>{workstream.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {participantRows.length > 0 && (
              <section className={styles.snapshotSection}>
                <h3>Participants snapshot ({participantRows.length})</h3>
                <div className={styles.tableScroll}>
                  <table className={styles.snapshotTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Hierarchy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participantRows.map((participant) => (
                        <tr key={participant.id}>
                          <th scope="row">{participant.displayName}</th>
                          <td>{participant.role ?? '—'}</td>
                          <td>
                            {[participant.hierarchyLevel1, participant.hierarchyLevel2, participant.hierarchyLevel3]
                              .filter(Boolean)
                              .join(' / ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

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
                        <td>{initiative.ownerName ?? '—'}</td>
                        <td>{impactFormatter.format(initiative.totals.recurringImpact ?? 0)}</td>
                        <td>
                          {initiative.timeline.startDate && initiative.timeline.endDate
                            ? `${new Date(initiative.timeline.startDate).toLocaleDateString()} – ${new Date(
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
      </section>
    </section>
  );
};
