import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/InitiativeProfile.module.css';
import {
  Initiative,
  InitiativeStageData,
  InitiativeStageKey,
  initiativeStageKeys,
  initiativeStageLabels,
  InitiativeStageState
} from '../../../shared/types/initiative';
import { Workstream, WorkstreamGateKey } from '../../../shared/types/workstream';
import { AccountRecord } from '../../../shared/types/account';
import { StageGatePanel } from './StageGatePanel';
import { FinancialEditor } from './FinancialEditor';
import { generateId } from '../../../shared/ui/generateId';
import { DomainResult } from '../../../shared/types/results';
import { resolveAccountName } from '../../../shared/utils/accountName';
import { initiativesApi, InitiativeEventEntry } from '../services/initiativesApi';

interface InitiativeProfileProps {
  mode: 'create' | 'view';
  initiative: Initiative | null;
  workstreams: Workstream[];
  accounts: AccountRecord[];
  initialWorkstreamId?: string;
  onBack: (workstreamId?: string) => void;
  onSave: (initiative: Initiative, options: { closeAfterSave: boolean }) => Promise<DomainResult<Initiative>>;
  onDelete: (id: string) => Promise<DomainResult<string>>;
  onSubmitStage: (id: string) => Promise<DomainResult<Initiative>>;
}

type Banner = { type: 'info' | 'error'; text: string } | null;
type ValidationErrors = {
  initiativeName?: boolean;
  workstream?: boolean;
  stageName?: boolean;
  stageDescription?: boolean;
  periodMonth?: boolean;
  periodYear?: boolean;
};

const createEmptyStage = (key: InitiativeStageKey): InitiativeStageData => ({
  key,
  name: '',
  description: '',
  periodMonth: null,
  periodYear: new Date().getFullYear(),
  l4Date: null,
  financials: {
    'recurring-benefits': [],
    'recurring-costs': [],
    'oneoff-benefits': [],
    'oneoff-costs': []
  }
});

const calculateTotals = (stages: Initiative['stages']) => {
  const sum = (kind: keyof Initiative['totals']) => {
    let total = 0;
    for (const stageKey of initiativeStageKeys) {
      const entries = stages[stageKey].financials[
        kind === 'recurringBenefits'
          ? 'recurring-benefits'
          : kind === 'recurringCosts'
            ? 'recurring-costs'
            : kind === 'oneoffBenefits'
              ? 'oneoff-benefits'
              : 'oneoff-costs'
      ];
      for (const entry of entries) {
        for (const value of Object.values(entry.distribution)) {
          if (Number.isFinite(value)) {
            total += value;
          }
        }
      }
    }
    return total;
  };

  const recurringBenefits = sum('recurringBenefits');
  const recurringCosts = sum('recurringCosts');
  const oneoffBenefits = sum('oneoffBenefits');
  const oneoffCosts = sum('oneoffCosts');

  return {
    recurringBenefits,
    recurringCosts,
    oneoffBenefits,
    oneoffCosts,
    recurringImpact: recurringBenefits - recurringCosts
  };
};

const createDefaultStageState = () =>
  initiativeStageKeys.reduce(
    (acc, key) => {
      acc[key] = { status: 'draft', roundIndex: 0, comment: null };
      return acc;
    },
    {} as Initiative['stageState']
  );

const isGateStage = (key: InitiativeStageKey): key is WorkstreamGateKey => key !== 'l0';

const createEmptyInitiative = (workstreamId?: string): Initiative => {
  const now = new Date().toISOString();
  const stages = initiativeStageKeys.reduce((acc, key) => {
    acc[key] = createEmptyStage(key);
    return acc;
  }, {} as Initiative['stages']);

  return {
    id: generateId(),
    workstreamId: workstreamId ?? '',
    name: '',
    description: '',
    ownerAccountId: null,
    ownerName: null,
    currentStatus: 'draft',
    activeStage: 'l0',
    l4Date: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    stages,
    stageState: createDefaultStageState(),
    totals: calculateTotals(stages)
  };
};

const formatImpact = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const formatDate = (value: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
};

const logFieldLabels: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  owner: 'Owner',
  status: 'Status',
  l4Date: 'L4 date',
  recurringImpact: 'Recurring impact',
  created: 'Created'
};

const formatLogValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (field === 'recurringImpact') {
    const numeric = typeof value === 'number' ? value : Number(value);
    return formatImpact(Number.isFinite(numeric) ? numeric : 0);
  }
  if (field === 'l4Date' && typeof value === 'string') {
    return formatDate(value);
  }
  if (field === 'owner' && value && typeof value === 'object') {
    const payload = value as { name?: string | null };
    return payload.name ?? 'Unassigned';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const InitiativeProfile = ({
  mode,
  initiative,
  workstreams,
  accounts,
  initialWorkstreamId,
  onBack,
  onSave,
  onDelete,
  onSubmitStage
}: InitiativeProfileProps) => {
  const [draft, setDraft] = useState<Initiative>(() =>
    initiative ?? createEmptyInitiative(initialWorkstreamId ?? workstreams[0]?.id)
  );
  const [selectedStage, setSelectedStage] = useState<InitiativeStageKey>(draft.activeStage);
  const [banner, setBanner] = useState<Banner>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [changeLog, setChangeLog] = useState<InitiativeEventEntry[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);

  useEffect(() => {
    if (initiative) {
      setDraft(initiative);
      setSelectedStage(initiative.activeStage);
    } else {
      setDraft(createEmptyInitiative(initialWorkstreamId ?? workstreams[0]?.id));
      setSelectedStage('l0');
    }
  }, [initiative, initialWorkstreamId, workstreams]);

  const loadChangeLog = useCallback(async () => {
    if (!initiative) {
      setChangeLog([]);
      setIsLogLoading(false);
      return;
    }
    setIsLogLoading(true);
    try {
      const entries = await initiativesApi.events(initiative.id);
      setChangeLog(entries);
    } catch (error) {
      console.error('Failed to load initiative change log:', error);
      setChangeLog([]);
    } finally {
      setIsLogLoading(false);
    }
  }, [initiative]);

  useEffect(() => {
    void loadChangeLog();
  }, [loadChangeLog]);

  const currentStage = draft.stages[selectedStage];
  const activeStageData = draft.stages[draft.activeStage];
  const activeIndex = initiativeStageKeys.indexOf(draft.activeStage);
  const selectedIndex = initiativeStageKeys.indexOf(selectedStage);
  const isStageEditable = selectedIndex === activeIndex;
  const stageLocked = selectedIndex > activeIndex;
  const l4Date = draft.stages.l4.l4Date ?? draft.l4Date;
  const hasWorkstreams = workstreams.length > 0;
  const currentStageState: InitiativeStageState =
    draft.stageState[selectedStage] ??
    { status: 'draft', roundIndex: 0, comment: null };
  const selectedWorkstream = workstreams.find((ws) => ws.id === draft.workstreamId) ?? null;
  const stageRounds =
    selectedWorkstream && isGateStage(selectedStage) ? selectedWorkstream.gates[selectedStage]?.length ?? 0 : 0;
  const canSubmitStage = isStageEditable && currentStageState.status !== 'pending';
  const stageStatusLabel = (() => {
    switch (currentStageState.status) {
      case 'pending':
        return 'Awaiting approvals';
      case 'approved':
        return 'Gate approved';
      case 'returned':
        return 'Returned for updates';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Draft';
    }
  })();
  const stageStatusDetails = (() => {
    if (currentStageState.status === 'pending') {
      if (stageRounds > 0) {
        return `Round ${Math.min(currentStageState.roundIndex + 1, stageRounds)} of ${stageRounds}`;
      }
      return `Round ${currentStageState.roundIndex + 1}`;
    }
    if (currentStageState.status === 'returned' || currentStageState.status === 'rejected') {
      return 'Review the feedback below and resubmit.';
    }
    if (currentStageState.status === 'approved') {
      return 'You can start preparing the next gate.';
    }
    return 'Not yet submitted.';
  })();

  const clearErrors = (next: ValidationErrors) => {
    setErrors((prev) => ({ ...prev, ...next }));
  };

  const handleFieldChange = <K extends keyof Initiative>(key: K, value: Initiative[K]) => {
    if (key === 'name') {
      clearErrors({ initiativeName: false });
    }
    if (key === 'workstreamId') {
      clearErrors({ workstream: false });
    }
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleStageChange = (stageKey: InitiativeStageKey) => {
    setSelectedStage(stageKey);
  };

  const updateStage = (stageKey: InitiativeStageKey, nextStage: InitiativeStageData) => {
    setDraft((prev) => {
      const stages = { ...prev.stages, [stageKey]: nextStage };
      return { ...prev, stages, totals: calculateTotals(stages) };
    });
  };

  const handleStageFieldChange = <K extends keyof InitiativeStageData>(key: K, value: InitiativeStageData[K]) => {
    if (key === 'name') {
      clearErrors({ stageName: false, initiativeName: false });
      if (typeof value === 'string' && (selectedStage === 'l0' || selectedStage === draft.activeStage)) {
        handleFieldChange('name', value as Initiative['name']);
      }
    }
    if (key === 'description') {
      clearErrors({ stageDescription: false });
    }
    if (key === 'periodMonth') {
      clearErrors({ periodMonth: false });
    }
    if (key === 'periodYear') {
      clearErrors({ periodYear: false });
    }
    updateStage(selectedStage, { ...currentStage, [key]: value });
  };

  const handleOwnerSelect = (accountId: string) => {
    if (!accountId) {
      handleFieldChange('ownerAccountId', null);
      return;
    }
    const account = accounts.find((item) => item.id === accountId);
    const ownerName = account ? resolveAccountName(account) || account.email : '';
    handleFieldChange('ownerAccountId', account ? account.id : null);
    handleFieldChange('ownerName', ownerName);
  };

  const validateDraft = () => {
    const nextErrors: ValidationErrors = {};
    if (!draft.name.trim()) {
      nextErrors.initiativeName = true;
    }
    if (!draft.workstreamId) {
      nextErrors.workstream = true;
    }
    if (!activeStageData.name.trim()) {
      nextErrors.stageName = true;
    }
    if (!activeStageData.description.trim()) {
      nextErrors.stageDescription = true;
    }
    if (!activeStageData.periodMonth) {
      nextErrors.periodMonth = true;
    }
    if (!activeStageData.periodYear) {
      nextErrors.periodYear = true;
    }
    if (draft.activeStage !== selectedStage) {
      setSelectedStage(draft.activeStage);
    }
    setErrors(nextErrors);
    return Object.values(nextErrors).every((value) => !value);
  };

  const handleSaveClick = async (closeAfterSave: boolean) => {
    if (!validateDraft()) {
      setBanner({ type: 'error', text: 'Заполните обязательные поля.' });
      return;
    }
    if (!hasWorkstreams) {
      setBanner({ type: 'error', text: 'Создайте workstream, прежде чем добавлять инициативы.' });
      return;
    }
    setIsSaving(true);
    setBanner(null);
    const result = await onSave(draft, { closeAfterSave });
    setIsSaving(false);
    if (!result.ok) {
      const message =
        result.error === 'version-conflict'
          ? 'Changes could not be saved because the initiative was updated elsewhere.'
          : result.error === 'invalid-input'
            ? 'Fill in the required fields before saving.'
            : result.error === 'not-found'
              ? 'Initiative not found. Please reload.'
              : 'Failed to save initiative.';
      setBanner({ type: 'error', text: message });
    } else {
      setDraft(result.data);
      setSelectedStage(result.data.activeStage);
      setBanner({ type: 'info', text: 'Initiative saved.' });
      void loadChangeLog();
    }
  };

  const handleDeleteClick = async () => {
    if (!initiative) {
      onBack(draft.workstreamId);
      return;
    }
    const confirmed = window.confirm('Delete this initiative permanently?');
    if (!confirmed) {
      return;
    }
    setIsDeleting(true);
    const result = await onDelete(initiative.id);
    setIsDeleting(false);
    if (!result.ok) {
      setBanner({ type: 'error', text: result.error === 'not-found' ? 'Initiative already removed.' : 'Failed to delete initiative.' });
    }
  };

  const handleSubmitClick = async () => {
    if (!initiative) {
      return;
    }
    if (!canSubmitStage) {
      return;
    }
    setIsSubmitting(true);
    const result = await onSubmitStage(initiative.id);
    setIsSubmitting(false);
    if (!result.ok) {
      const message =
        result.error === 'stage-pending'
          ? 'This stage is already awaiting approvals.'
          : result.error === 'stage-approved'
            ? 'The current stage has already been approved.'
            : result.error === 'missing-approvers'
              ? 'Assign account roles for all approvers in the workstream before submitting.'
              : result.error === 'version-conflict'
                ? 'Could not submit because the initiative was updated elsewhere.'
                : result.error === 'not-found'
                  ? 'Initiative not found. Please reload.'
                  : 'Failed to submit the stage for approval.';
      setBanner({ type: 'error', text: message });
    } else {
      setDraft(result.data);
      setSelectedStage(result.data.activeStage);
      setBanner({ type: 'info', text: 'Stage submitted for approval.' });
      void loadChangeLog();
    }
  };

  if (mode === 'view' && !initiative) {
    return (
      <section className={styles.placeholder}>
        <h2>Initiative not found</h2>
        <p>The initiative may have been deleted. Refresh the list and try again.</p>
        <button className={styles.secondaryButton} onClick={() => onBack()} type="button">
          Back to list
        </button>
      </section>
    );
  }

  return (
    <section className={styles.profileWrapper}>
      <button className={styles.backLink} onClick={() => onBack(draft.workstreamId)} type="button">
        ← Back to initiatives
      </button>

      <div className={styles.quickInfoCard}>
        <div>
          <p className={styles.quickLabel}>Initiative</p>
          <h2>{draft.name || 'Unnamed initiative'}</h2>
        </div>
        <div>
          <p className={styles.quickLabel}>Owner</p>
          <h3>{draft.ownerName || 'Unassigned'}</h3>
        </div>
        <div>
          <p className={styles.quickLabel}>Recurring impact</p>
          <h1 className={styles.impactValue}>{formatImpact(draft.totals.recurringImpact)}</h1>
        </div>
        <div>
          <p className={styles.quickLabel}>L4 date</p>
          <h3>{formatDate(l4Date)}</h3>
        </div>
      </div>

      <div className={styles.metaGrid}>
        <label className={errors.workstream ? styles.fieldError : undefined}>
          <span>Workstream</span>
          <select
            className={errors.workstream ? styles.inputError : undefined}
            value={draft.workstreamId}
            onChange={(event) => handleFieldChange('workstreamId', event.target.value)}
            disabled={!hasWorkstreams}
          >
            {!hasWorkstreams && <option value="">Create a workstream first</option>}
            {workstreams.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Current status</span>
          <input
            type="text"
            value={draft.currentStatus}
            onChange={(event) => handleFieldChange('currentStatus', event.target.value)}
          />
        </label>
        <label>
          <span>Target L4 date</span>
          <input
            type="date"
            value={draft.l4Date ?? ''}
            onChange={(event) => handleFieldChange('l4Date', event.target.value || null)}
          />
        </label>
        <label>
          <span>Initiative owner</span>
          <select
            value={draft.ownerAccountId ?? ''}
            onChange={(event) => handleOwnerSelect(event.target.value)}
          >
            <option value="">No linked account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {resolveAccountName(account) || account.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StageGatePanel
        activeStage={draft.activeStage}
        selectedStage={selectedStage}
        stages={draft.stages}
        stageState={draft.stageState}
        onSelectStage={handleStageChange}
        workstream={selectedWorkstream}
      />

      {banner && (
        <div className={banner.type === 'info' ? styles.bannerInfo : styles.bannerError}>{banner.text}</div>
      )}

      <div className={styles.stagePanel}>
        <header className={styles.stageHeader}>
          <div>
            <h3>{initiativeStageLabels[selectedStage]}</h3>
            {!isStageEditable && <p className={styles.stageHint}>Fields are read-only for this gate.</p>}
          </div>
          {mode === 'view' && initiative && isStageEditable && !stageLocked && (
              <button
                className={styles.secondaryButton}
                onClick={handleSubmitClick}
                disabled={isSubmitting || !canSubmitStage}
                type="button"
              >
                {currentStageState.status === 'pending'
                  ? 'Waiting for approvals'
                  : isSubmitting
                    ? 'Submitting…'
                    : 'Submit for next gate'}
              </button>
            )}
        </header>
        <div className={styles.stageStatusRow}>
          <span className={`${styles.stageStatusBadge} ${styles[`status-${currentStageState.status}`]}`}>
            {stageStatusLabel}
          </span>
          <span className={styles.stageStatusMeta}>{stageStatusDetails}</span>
        </div>
        {currentStageState.comment && currentStageState.status !== 'draft' && (
          <div className={styles.stageAlert}>
            <strong>Reviewer note:</strong>
            <p>{currentStageState.comment}</p>
          </div>
        )}

        {stageLocked && <p className={styles.lockedNote}>Complete previous gates before editing this stage.</p>}

        <label className={`${styles.fieldBlock} ${errors.stageName ? styles.fieldError : ''}`}>
          <span>Initiative name</span>
          <input
            type="text"
            className={errors.stageName ? styles.inputError : undefined}
            value={currentStage.name}
            onChange={(event) => handleStageFieldChange('name', event.target.value)}
            disabled={!isStageEditable}
          />
        </label>

        <label className={`${styles.fieldBlock} ${errors.stageDescription ? styles.fieldError : ''}`}>
          <span>Description</span>
          <textarea
            className={errors.stageDescription ? styles.inputError : undefined}
            value={currentStage.description}
            onChange={(event) => handleStageFieldChange('description', event.target.value)}
            disabled={!isStageEditable}
            rows={4}
          />
        </label>

        <div className={styles.periodRow}>
          <label className={errors.periodMonth ? styles.fieldError : undefined}>
            <span>Period month</span>
            <select
              className={errors.periodMonth ? styles.inputError : undefined}
              value={currentStage.periodMonth ?? ''}
              onChange={(event) => handleStageFieldChange('periodMonth', Number(event.target.value) || null)}
              disabled={!isStageEditable}
            >
              <option value="">Not set</option>
              {Array.from({ length: 12 }).map((_, index) => (
                <option key={index + 1} value={index + 1}>
                  {new Date(2000, index, 1).toLocaleString('en-US', { month: 'short' })}
                </option>
              ))}
            </select>
          </label>
          <label className={errors.periodYear ? styles.fieldError : undefined}>
            <span>Period year</span>
            <input
              type="number"
              className={errors.periodYear ? styles.inputError : undefined}
              value={currentStage.periodYear ?? ''}
              onChange={(event) => handleStageFieldChange('periodYear', Number(event.target.value) || null)}
              disabled={!isStageEditable}
            />
          </label>
          {selectedStage === 'l4' && (
            <label>
              <span>L4 date</span>
              <input
                type="date"
                value={currentStage.l4Date ?? ''}
                onChange={(event) => handleStageFieldChange('l4Date', event.target.value)}
                disabled={!isStageEditable}
              />
            </label>
          )}
        </div>

        <FinancialEditor
          stage={currentStage}
          disabled={!isStageEditable}
          onChange={(nextStage) => updateStage(selectedStage, nextStage)}
        />
      </div>

      <section className={styles.changeLogSection}>
        <header>
          <h4>Change log</h4>
        </header>
        {isLogLoading ? (
          <p className={styles.placeholder}>Loading change log…</p>
        ) : changeLog.length === 0 ? (
          <p className={styles.placeholder}>No changes recorded yet.</p>
        ) : (
          <ul className={styles.changeLogList}>
            {changeLog.map((entry) => (
              <li key={entry.id} className={styles.changeLogItem}>
                <div className={styles.logMeta}>
                  <span className={styles.logActor}>{entry.actorName ?? 'System'}</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  <span className={styles.logBadge}>{entry.eventType}</span>
                </div>
                <div className={styles.logChanges}>
                  {entry.changes.map((change) =>
                    change.field === 'created' ? (
                      <div key={`${entry.id}-${change.field}`} className={styles.logChangeRow}>
                        <span className={styles.logValue}>Initiative created.</span>
                      </div>
                    ) : (
                      <div key={`${entry.id}-${change.field}`} className={styles.logChangeRow}>
                        <span className={styles.logValue}>
                          Changed <strong>{logFieldLabels[change.field] ?? change.field}</strong> from{' '}
                          {formatLogValue(change.field, change.previousValue)} to{' '}
                          {formatLogValue(change.field, change.nextValue)}.
                        </span>
                      </div>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.footer}>
        <button className={styles.secondaryButton} onClick={() => onBack(draft.workstreamId)} type="button">
          Cancel
        </button>
        {mode === 'view' && (
          <button className={styles.dangerButton} onClick={handleDeleteClick} disabled={isDeleting} type="button">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <button className={styles.secondaryButton} onClick={() => handleSaveClick(false)} disabled={isSaving} type="button">
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button className={styles.primaryButton} onClick={() => handleSaveClick(true)} disabled={isSaving} type="button">
          {isSaving ? 'Saving…' : 'Save and close'}
        </button>
      </footer>
    </section>
  );
};
