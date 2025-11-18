import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/SnapshotSettingsScreen.module.css';
import { snapshotsApi } from '../snapshots/services/snapshotsApi';
import { SnapshotSettingsPayload } from '../../shared/types/snapshot';

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
    </section>
  );
};
