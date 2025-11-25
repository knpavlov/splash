import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/GeneralSettingsScreen.module.css';
import { StatusReportSettings, usePlanSettingsState } from '../../app/state/AppStateContext';

const DEFAULT_OPTIONS = ['Standard', 'Value Step', 'Change Management'];
const VALUE_STEP_LABEL = 'Value Step';

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

export const GeneralSettingsScreen = () => {
  const { milestoneTypes, saveMilestoneTypes, statusReportSettings, saveStatusReportSettings } = usePlanSettingsState();
  const [draftOptions, setDraftOptions] = useState<string[]>(() => normalizeOptions(milestoneTypes));
  const [newOption, setNewOption] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [statusSettings, setStatusSettings] = useState<StatusReportSettings>(statusReportSettings);

  useEffect(() => {
    setDraftOptions(normalizeOptions(milestoneTypes));
  }, [milestoneTypes]);

  useEffect(() => {
    setStatusSettings(statusReportSettings);
  }, [statusReportSettings]);

  const normalizedOptions = useMemo(() => normalizeOptions(draftOptions), [draftOptions]);
  const dayOptions = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const frequencyOptions = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Every 2 weeks' },
    { value: 'every-4-weeks', label: 'Every 4 weeks' }
  ] as const;

  const updateStatusSetting = <K extends keyof StatusReportSettings>(key: K, value: StatusReportSettings[K]) => {
    setStatusSettings((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleSave = () => {
    const normalized = normalizeOptions(draftOptions);
    setDraftOptions(normalized);
    saveMilestoneTypes(normalized);
    setMessage('Milestone types updated.');
  };

  const handleSaveStatusSettings = () => {
    saveStatusReportSettings(statusSettings);
    setMessage('Status report settings updated.');
  };

  const handleRemove = (index: number) => {
    const target = normalizedOptions[index];
    if (!target || target.toLowerCase() === VALUE_STEP_LABEL.toLowerCase()) {
      return;
    }
    setDraftOptions((prev) => prev.filter((_, i) => i !== index));
    setMessage(null);
  };

  const handleUpdate = (index: number, value: string) => {
    setDraftOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
    setMessage(null);
  };

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) {
      return;
    }
    setDraftOptions((prev) => [...prev, trimmed]);
    setNewOption('');
    setMessage(null);
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>General settings</p>
          <h1>Program defaults</h1>
          <p className={styles.subtitle}>Control shared options for initiative planning.</p>
        </div>
      </header>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Plan module</p>
            <h3>Milestone types</h3>
            <p className={styles.cardSubtitle}>
              Update the options available in the plan table. Value Step is always required.
            </p>
          </div>
          <button className={styles.primaryButton} type="button" onClick={handleSave}>
            Save changes
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
            placeholder="Add another milestone type"
          />
          <button className={styles.secondaryButton} type="button" onClick={handleAdd}>
            Add
          </button>
        </div>

        {message && <p className={styles.success}>{message}</p>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Status reports</p>
            <h3>Reporting cadence</h3>
            <p className={styles.cardSubtitle}>Control when reports refresh and how tasks are selected for updates.</p>
          </div>
          <button className={styles.primaryButton} type="button" onClick={handleSaveStatusSettings}>
            Save report settings
          </button>
        </div>

        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span>Template reset day</span>
            <select
              value={statusSettings.templateResetDay}
              onChange={(event) => updateStatusSetting('templateResetDay', event.target.value as StatusReportSettings['templateResetDay'])}
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
              onChange={(event) => updateStatusSetting('submitDeadlineDay', event.target.value as StatusReportSettings['submitDeadlineDay'])}
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
      </div>
    </section>
  );
};
