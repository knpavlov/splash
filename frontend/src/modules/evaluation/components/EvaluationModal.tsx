import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/EvaluationModal.module.css';
import {
  EvaluationConfig,
  InterviewSlot,
  InterviewStatusRecord,
  InvitationSlotStatus
} from '../../../shared/types/evaluation';
import { CandidateProfile } from '../../../shared/types/candidate';
import { CaseFolder } from '../../../shared/types/caseLibrary';
import { FitQuestion } from '../../../shared/types/fitQuestion';
import { AccountRecord } from '../../../shared/types/account';
import { buildAccountDescriptor } from '../../../shared/utils/accountName';
import { composeFullName } from '../../../shared/utils/personName';
import { generateId } from '../../../shared/ui/generateId';

interface EvaluationModalProps {
  initialConfig: EvaluationConfig | null;
  onSave: (
    config: EvaluationConfig,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  candidates: CandidateProfile[];
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

export const EvaluationModal = ({
  initialConfig,
  onSave,
  onDelete,
  onClose,
  candidates,
  folders,
  fitQuestions,
  accounts
}: EvaluationModalProps) => {
  const [config, setConfig] = useState<EvaluationConfig>(createDefaultConfig());

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
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
    updateInterviews((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
    );
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
    if (!initialConfig) {
      onClose();
      return;
    }
    void onDelete(initialConfig.id);
  };

  const submit = (closeAfterSave: boolean) => {
    void onSave(config, { closeAfterSave, expectedVersion });
  };

  const candidateOptions = useMemo(
    () =>
      candidates.map((candidate) => ({
        id: candidate.id,
        label: composeFullName(candidate.firstName, candidate.lastName) || 'No name'
      })),
    [candidates]
  );

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
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>{initialConfig ? 'Edit evaluation' : 'New evaluation'}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.content}>
          <label className={styles.fullWidth}>
            <span>Candidate</span>
            <select
              value={config.candidateId || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, candidateId: e.target.value || undefined }))}
            >
              <option value="">Not selected</option>
              {candidateOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Round number</span>
            <input
              type="number"
              min={1}
              value={config.roundNumber ?? 1}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, roundNumber: Number(e.target.value) || undefined }))
              }
            />
          </label>

          <div className={`${styles.fullWidth} ${styles.toolbar}`}>
            <h3 className={styles.toolbarTitle}>Interviews</h3>
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
                  <span>Case</span>
                  <select
                    value={slot.caseFolderId || ''}
                    onChange={(e) => updateInterview(slot.id, { caseFolderId: e.target.value || undefined })}
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
                    value={slot.fitQuestionId || ''}
                    onChange={(e) => updateInterview(slot.id, { fitQuestionId: e.target.value || undefined })}
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
                  <span className={`${styles.statusBadge} ${badgeClass}`}>{STATUS_LABELS[statusKey]}</span>
                  {note && <span className={styles.statusNote}>{note}</span>}
                  {errorText && <span className={styles.statusError}>{errorText}</span>}
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <footer className={styles.footer}>
          <button className={styles.dangerButton} onClick={handleDelete} disabled={!initialConfig}>
            Delete evaluation
          </button>
          <div className={styles.footerActions}>
            <button className={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button className={styles.secondaryButton} onClick={() => submit(false)}>
              Save
            </button>
            <button className={styles.primaryButton} onClick={() => submit(true)}>
              Save and close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
