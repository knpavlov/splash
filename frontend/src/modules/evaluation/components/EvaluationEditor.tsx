import { useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/EvaluationEditor.module.css';
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

interface EvaluationEditorProps {
  initialConfig: EvaluationConfig | null;
  onSave: (
    config: EvaluationConfig,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
  pending: 'Не отправлено',
  delivered: 'Доставлено',
  stale: 'Нужно обновить',
  failed: 'Ошибка доставки',
  unassigned: 'Требует данных'
};

const createDefaultConfig = (): EvaluationConfig => {
  const interviews = [createInterviewSlot()];
  return {
    id: generateId(),
    candidateId: undefined,
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

export const EvaluationEditor = ({
  initialConfig,
  onSave,
  onDelete,
  onCancel,
  folders,
  fitQuestions,
  accounts
}: EvaluationEditorProps) => {
  const [config, setConfig] = useState<EvaluationConfig>(createDefaultConfig());
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...initialConfig, initiativeName: initialConfig.initiativeName ?? '' });
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
        caseFolderId: caseAssignments[index],
        fitQuestionId: fitAssignments[index]
      }));
    });
  };

  const accountMaps = useMemo(() => {
    const byId = new Map<string, AccountRecord>();
    const byEmail = new Map<string, AccountRecord>();
    const descriptors = new Map<string, ReturnType<typeof buildAccountDescriptor>>();

    accounts.forEach((account) => {
      byId.set(account.id, account);
      const descriptor = buildAccountDescriptor(account);
      descriptors.set(account.id, descriptor);
      if (account.email) {
        byEmail.set(account.email.trim().toLowerCase(), account);
      }
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

  const submit = async (closeAfterSave: boolean) => {
    const trimmedInitiative = config.initiativeName?.trim() ?? '';
    if (!trimmedInitiative) {
      setValidationError('Укажите название инициативы.');
      return;
    }
    setValidationError(null);

    const nextConfig: EvaluationConfig = {
      ...config,
      initiativeName: trimmedInitiative,
      interviews: config.interviews.map((slot) => ({
        ...slot,
        interviewerName: slot.interviewerName.trim(),
        interviewerEmail: slot.interviewerEmail.trim()
      })),
      forms: config.forms.map((form) => ({
        ...form,
        interviewerName: form.interviewerName.trim()
      }))
    };

    try {
      await onSave(nextConfig, { closeAfterSave, expectedVersion });
    } catch {
      // Ошибка будет обработана наверху через баннер
    }
  };

  const handleDelete = async () => {
    if (!initialConfig) {
      return;
    }
    const confirmed = window.confirm('Удалить эту настройку оценки и все интервью?');
    if (!confirmed) {
      return;
    }
    await onDelete(initialConfig.id);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{initialConfig ? 'Редактирование оценки' : 'Новая оценка'}</h1>
          <p className={styles.subtitle}>
            Настройте интервью, чтобы автоматизировать рассылку материалов и форму обратной связи.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={onCancel}>
            Вернуться к списку
          </button>
          <button className={styles.primaryButton} onClick={() => submit(true)}>
            Сохранить и вернуться
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.fullWidth}>
          <label className={styles.fullWidth}>
            <span>Initiative Name</span>
            <input
              value={config.initiativeName ?? ''}
              onChange={(event) => setConfig((prev) => ({ ...prev, initiativeName: event.target.value }))}
              placeholder="Например, Digital Transformation Sprint"
            />
          </label>
          {validationError && <p className={styles.validationError}>{validationError}</p>}
        </div>

        <label>
          <span>Номер раунда</span>
          <input
            type="number"
            min={1}
            value={config.roundNumber ?? 1}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, roundNumber: Number(event.target.value) || undefined }))
            }
          />
        </label>

        <div className={`${styles.fullWidth} ${styles.toolbar}`}>
          <h2 className={styles.toolbarTitle}>Интервью</h2>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.toolbarPrimaryButton} onClick={handleAssignRandomly}>
              Заполнить автоматически
            </button>
            <button type="button" className={styles.toolbarSecondaryButton} onClick={handleAddInterview}>
              Добавить интервью
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
                ? `Отправлено ${formatDateTime(invitationSlot.invitationSentAt)}`
                : 'Приглашение доставлено';
            } else if (statusKey === 'stale') {
              note = invitationSlot?.invitationSentAt
                ? `Назначение обновлено после отправки ${formatDateTime(invitationSlot.invitationSentAt)}.`
                : 'Назначение обновлено. Отправьте приглашение повторно.';
            } else if (statusKey === 'failed') {
              note = invitationSlot?.lastDeliveryAttemptAt
                ? `Неудачная попытка ${formatDateTime(invitationSlot.lastDeliveryAttemptAt)}.`
                : 'Доставка не удалась. Проверьте адрес и попробуйте снова.';
            } else if (statusKey === 'unassigned') {
              note = 'Добавьте интервьюера, кейс и fit-вопрос перед отправкой.';
            } else {
              note = 'Приглашение ещё не отправлялось.';
            }
            const errorText = invitationSlot?.lastDeliveryError?.trim() || null;

            return (
              <div key={slot.id} className={styles.interviewBlock}>
                <div className={styles.interviewHeader}>
                  <h3>Интервью {index + 1}</h3>
                  <button
                    type="button"
                    className={styles.removeInterviewButton}
                    onClick={() => handleRemoveInterview(slot.id)}
                    disabled={config.interviews.length <= 1}
                  >
                    Удалить
                  </button>
                </div>
                <label>
                  <span>Интервьюер</span>
                  <select
                    value={(() => {
                      const normalizedEmail = slot.interviewerEmail.trim().toLowerCase();
                      const selected = normalizedEmail ? accountMaps.byEmail.get(normalizedEmail) : undefined;
                      return selected?.id ?? '';
                    })()}
                    onChange={(event) => applyAccountSelection(slot.id, event.target.value || null)}
                  >
                    <option value="">Не выбрано</option>
                    {accountMaps.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Email интервьюера</span>
                  <input value={slot.interviewerEmail} readOnly />
                </label>
                <label>
                  <span>Кейс</span>
                  <select
                    value={slot.caseFolderId || ''}
                    onChange={(event) => updateInterview(slot.id, { caseFolderId: event.target.value || undefined })}
                  >
                    <option value="">Не выбрано</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Fit-вопрос</span>
                  <select
                    value={slot.fitQuestionId || ''}
                    onChange={(event) => updateInterview(slot.id, { fitQuestionId: event.target.value || undefined })}
                  >
                    <option value="">Не выбрано</option>
                    {fitQuestions.map((question) => (
                      <option key={question.id} value={question.id}>
                        {question.shortTitle}
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
        <div className={styles.footerLeft}>
          <button className={styles.dangerButton} onClick={handleDelete} disabled={!initialConfig}>
            Удалить оценку
          </button>
        </div>
        <div className={styles.footerActions}>
          <button className={styles.secondaryButton} onClick={onCancel}>
            Отменить изменения
          </button>
          <button className={styles.secondaryButton} onClick={() => submit(false)}>
            Сохранить
          </button>
          <button className={styles.primaryButton} onClick={() => submit(true)}>
            Сохранить и вернуться
          </button>
        </div>
      </footer>
    </div>
  );
};
