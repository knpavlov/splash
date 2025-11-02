import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/EvaluationEditorForm.module.css';
import {
  EvaluationConfig,
  InterviewSlot,
  InterviewStatusRecord,
  InvitationSlotStatus
} from '../../../shared/types/evaluation';
import { CaseFolder } from '../../../shared/types/caseLibrary';
import { FitQuestion } from '../../../shared/types/fitQuestion';
import { AccountRecord } from '../../../shared/types/account';
import { buildAccountDescriptor } from '../../../shared/utils/accountName';
import { generateId } from '../../../shared/ui/generateId';

interface EvaluationEditorFormProps {
  initialConfig: EvaluationConfig | null;
  onSave: (
    config: EvaluationConfig,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel: () => void;
  folders: CaseFolder[];
  fitQuestions: FitQuestion[];
  accounts: AccountRecord[];
}

const createInterviewSlot = (): InterviewSlot => ({
  id: generateId(),
  interviewerName: '',
  interviewerEmail: ''
});

const createStatusRecord = (slot: InterviewSlot): InterviewStatusRecord => ({
  slotId: slot.id,
  interviewerName: slot.interviewerName || 'Interviewer',
  submitted: false
});

const STATUS_LABELS: Record<InvitationSlotStatus, string> = {
  pending: 'Not sent',
  delivered: 'Delivered',
  stale: 'Needs resend',
  failed: 'Delivery failed',
  unassigned: 'Incomplete'
};

const createDefaultConfig = (): EvaluationConfig => {
  const interviews = [createInterviewSlot()];
  return {
    id: generateId(),
    candidateId: undefined,
    initiativeId: generateId(),
    initiativeName: '',
    roundNumber: 1,
    interviewCount: 1,
    interviews,
    fitQuestionId: undefined,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    forms: interviews.map((slot) => createStatusRecord(slot)),
    processStatus: 'draft',
    roundHistory: [],
    invitationState: {
      hasInvitations: false,
      hasPendingChanges: true,
      slots: []
    }
  };
};

const shuffleArray = <T,>(source: T[]): T[] => {
  const items = [...source];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = temp;
  }
  return items;
};

const buildUniqueAssignments = <T,>(source: T[], count: number): (T | undefined)[] => {
  if (count <= 0) {
    return [];
  }
  if (source.length === 0) {
    return Array.from({ length: count }, () => undefined);
  }
  const shuffled = shuffleArray(source);
  const result: (T | undefined)[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index < shuffled.length) {
      result.push(shuffled[index]);
    } else {
      result.push(undefined);
    }
  }
  return result;
};

export const EvaluationEditorForm = ({
  initialConfig,
  onSave,
  onDelete,
  onCancel,
  folders,
  fitQuestions,
  accounts
}: EvaluationEditorFormProps) => {
  const [config, setConfig] = useState<EvaluationConfig>(createDefaultConfig());

  useEffect(() => {
    if (initialConfig) {
      const initiativeId = initialConfig.initiativeId ?? generateId();
      setConfig({ ...initialConfig, initiativeId });
    } else {
      setConfig(createDefaultConfig());
    }
  }, [initialConfig]);

  const expectedVersion = initialConfig ? initialConfig.version : null;

  const slotStatusMap = useMemo(() => {
    const map = new Map<string, (typeof config.invitationState.slots)[number]>();
    (config.invitationState.slots ?? []).forEach((state) => {
      map.set(state.slotId, state);
    });
    return map;
  }, [config.invitationState.slots]);

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString();
  };

  const updateInterviews = (updater: (current: InterviewSlot[]) => InterviewSlot[]) => {
    setConfig((prev) => {
      const interviews = updater(prev.interviews);
      const forms = interviews.map((slot) => {
        const existing = prev.forms.find((form) => form.slotId === slot.id);
        return existing
          ? { ...existing, interviewerName: slot.interviewerName || existing.interviewerName }
          : createStatusRecord(slot);
      });
      return {
        ...prev,
        interviews,
        interviewCount: interviews.length,
        forms,
        invitationState: {
          ...(prev.invitationState ?? { hasInvitations: false, hasPendingChanges: true, slots: [] }),
          hasPendingChanges: true
        }
      };
    });
  };

  const updateInterview = (slotId: string, patch: Partial<InterviewSlot>) => {
    updateInterviews((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  const handleAddInterview = () => {
    updateInterviews((current) => [...current, createInterviewSlot()]);
  };

  const handleRemoveInterview = (slotId: string) => {
    updateInterviews((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((slot) => slot.id !== slotId);
    });
  };

  const handleAssignRandomly = () => {
    updateInterviews((current) => {
      if (current.length === 0) {
        return current;
      }
      const caseAssignments = buildUniqueAssignments(
        folders.map((folder) => folder.id),
        current.length
      );
      const fitAssignments = buildUniqueAssignments(
        fitQuestions.map((question) => question.id),
        current.length
      );
      return current.map((slot, index) => ({
        ...slot,
        caseFolderId: caseAssignments[index] ?? slot.caseFolderId,
        fitQuestionId: fitAssignments[index] ?? slot.fitQuestionId
      }));
    });
  };

  const handleDelete = () => {
    if (!initialConfig || !onDelete) {
      onCancel();
      return;
    }
    void onDelete(initialConfig.id);
  };

  const submit = (closeAfterSave: boolean) => {
    void onSave(
      { ...config, initiativeName: config.initiativeName.trim() },
      { closeAfterSave, expectedVersion }
    );
  };

  const fitQuestionOptions = useMemo(
    () =>
      fitQuestions.map((question) => ({
        id: question.id,
        label: question.shortTitle.trim() || question.content.trim() || question.id
      })),
    [fitQuestions]
  );

  const accountMaps = useMemo(() => {
    const byId = new Map<string, AccountRecord>();
    const byEmail = new Map<string, AccountRecord>();
    const descriptors = new Map<string, { name: string; label: string }>();

    accounts.forEach((account) => {
      byId.set(account.id, account);
      const normalizedEmail = account.email.trim().toLowerCase();
      if (normalizedEmail) {
        byEmail.set(normalizedEmail, account);
      }
      descriptors.set(account.id, buildAccountDescriptor(account));
    });

    const options = accounts
      .map((account) => {
        const descriptor = descriptors.get(account.id) ?? buildAccountDescriptor(account);
        return {
          id: account.id,
          sortKey: descriptor.name.toLowerCase(),
          label: descriptor.label
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'ru'));

    return { byId, byEmail, descriptors, options };
  }, [accounts]);

  const applyAccountSelection = (slotId: string, accountId: string | null) => {
    if (!accountId) {
      updateInterview(slotId, { interviewerName: '', interviewerEmail: '' });
      return;
    }
    const account = accountMaps.byId.get(accountId);
    if (!account) {
      updateInterview(slotId, { interviewerName: '', interviewerEmail: '' });
      return;
    }
    const descriptor = accountMaps.descriptors.get(accountId) ?? buildAccountDescriptor(account);
    const resolvedName = descriptor.name || account.email;
    updateInterview(slotId, { interviewerName: resolvedName, interviewerEmail: account.email });
  };

  return (
    <div className={styles.pageContainer}>
      <header className={styles.pageHeader}>
        <div>
          <h1>{initialConfig ? 'Edit evaluation' : 'New evaluation'}</h1>
          <p className={styles.pageSubtitle}>
            Configure interviews, assignments, and invitations before notifying interviewers.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => submit(true)}
            disabled={!config.initiativeName.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.saveContinueButton}
            onClick={() => submit(false)}
            disabled={!config.initiativeName.trim()}
          >
            Save and stay
          </button>
        </div>
      </header>

      <section className={styles.formSection}>
        <div className={styles.fieldGroup}>
          <label>
            <span>Initiative name</span>
            <input
              value={config.initiativeName}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, initiativeName: event.target.value }))
              }
              placeholder="Enter initiative name"
            />
          </label>
        </div>

        <div className={styles.metaGrid}>
          <label>
            <span>Round number</span>
            <input
              type="number"
              min={1}
              value={config.roundNumber ?? 1}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, roundNumber: Number(event.target.value) || undefined }))
              }
            />
          </label>
        </div>

        <div className={styles.toolbar}>
          <h2 className={styles.toolbarTitle}>Interviews</h2>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.toolbarPrimaryButton} onClick={handleAssignRandomly}>
              Assign randomly
            </button>
            <button type="button" className={styles.toolbarSecondaryButton} onClick={handleAddInterview}>
              Add interview
            </button>
          </div>
        </div>

        <div className={styles.interviewsList}>
          {config.interviews.map((slot, index) => {
            const invitationSlot = slotStatusMap.get(slot.id);
            const statusKey: InvitationSlotStatus = invitationSlot?.status ?? 'pending';
            const badgeClass =
              statusKey === 'delivered'
                ? styles.statusDelivered
                : statusKey === 'stale'
                  ? styles.statusStale
                  : statusKey === 'failed'
                    ? styles.statusFailed
                    : statusKey === 'unassigned'
                      ? styles.statusUnassigned
                      : styles.statusPending;
            let note: string | null = null;
            if (statusKey === 'delivered') {
              note = invitationSlot?.invitationSentAt
                ? `Delivered on ${formatDateTime(invitationSlot.invitationSentAt)}`
                : 'Invitation delivered.';
            } else if (statusKey === 'stale') {
              note = invitationSlot?.invitationSentAt
                ? `Assignment changed after the invite sent on ${formatDateTime(invitationSlot.invitationSentAt)}.`
                : 'Assignment updated. Resend the invitation when ready.';
            } else if (statusKey === 'failed') {
              note = invitationSlot?.lastDeliveryAttemptAt
                ? `Last delivery attempt on ${formatDateTime(invitationSlot.lastDeliveryAttemptAt)}.`
                : 'Delivery attempt failed. Check the address and resend.';
            } else if (statusKey === 'unassigned') {
              note = 'Provide interviewer email, case, and fit question before sending an invite.';
            } else {
              note = 'Invitation has not been sent yet.';
            }
            const errorText = invitationSlot?.lastDeliveryError?.trim() || null;

            return (
              <div key={slot.id} className={styles.interviewBlock}>
                <div className={styles.interviewHeader}>
                  <h3>Interview {index + 1}</h3>
                  <button
                    type="button"
                    className={styles.removeInterviewButton}
                    onClick={() => handleRemoveInterview(slot.id)}
                    disabled={config.interviews.length <= 1}
                  >
                    Delete
                  </button>
                </div>
                <label>
                  <span>Interviewer</span>
                  <select
                    value={(() => {
                      const normalizedEmail = slot.interviewerEmail.trim().toLowerCase();
                      const selected = normalizedEmail
                        ? accountMaps.byEmail.get(normalizedEmail)
                        : undefined;
                      return selected?.id ?? '';
                    })()}
                    onChange={(event) => applyAccountSelection(slot.id, event.target.value || null)}
                  >
                    <option value="">Not selected</option>
                    {accountMaps.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Interviewer email</span>
                  <input value={slot.interviewerEmail} readOnly />
                </label>
                <label>
                  <span>Case folder</span>
                  <select
                    value={slot.caseFolderId ?? ''}
                    onChange={(event) =>
                      updateInterview(slot.id, { caseFolderId: event.target.value || undefined })
                    }
                  >
                    <option value="">Not selected</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Fit question</span>
                  <select
                    value={slot.fitQuestionId ?? ''}
                    onChange={(event) =>
                      updateInterview(slot.id, { fitQuestionId: event.target.value || undefined })
                    }
                  >
                    <option value="">Not selected</option>
                    {fitQuestionOptions.map((question) => (
                      <option key={question.id} value={question.id}>
                        {question.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.statusSection}>
                  <span className={`${styles.statusBadge} ${badgeClass}`}>
                    {STATUS_LABELS[statusKey]}
                  </span>
                  {note && <p className={styles.statusNote}>{note}</p>}
                  {errorText && <p className={styles.statusError}>{errorText}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className={styles.pageFooter}>
        {onDelete && initialConfig ? (
          <button type="button" className={styles.deleteButton} onClick={handleDelete}>
            Delete evaluation
          </button>
        ) : (
          <span />
        )}
        <div className={styles.footerActions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => submit(true)}
            disabled={!config.initiativeName.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.saveContinueButton}
            onClick={() => submit(false)}
            disabled={!config.initiativeName.trim()}
          >
            Save and stay
          </button>
        </div>
      </footer>
    </div>
  );
};
