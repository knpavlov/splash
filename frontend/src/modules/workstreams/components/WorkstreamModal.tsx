import { useEffect, useMemo, useState } from 'react';
import {
  Workstream,
  WorkstreamGates,
  WorkstreamGateKey,
  WorkstreamApprovalRound,
  WorkstreamApproverRequirement,
  WorkstreamRoleAssignment
} from '../../../shared/types/workstream';
import styles from '../../../styles/WorkstreamModal.module.css';
import { WorkstreamGateEditor } from './WorkstreamGateEditor';
import { generateId } from '../../../shared/ui/generateId';
import { AccountRecord } from '../../../shared/types/account';
import { DomainResult } from '../../../shared/types/results';

type ModalFeedback = { type: 'info' | 'error'; text: string } | null;

interface WorkstreamModalProps {
  initialWorkstream: Workstream | null;
  onSave: (
    workstream: Workstream,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  feedback: ModalFeedback;
  onFeedbackClear: () => void;
  accounts: AccountRecord[];
  loadAssignments: (workstreamId: string) => Promise<DomainResult<WorkstreamRoleAssignment[]>>;
}

const gateKeys: WorkstreamGateKey[] = ['l1', 'l2', 'l3', 'l4', 'l5'];

const createEmptyApprover = () => ({
  id: generateId(),
  accountId: null as string | null,
  role: null as string | null
});

const createEmptyRound = (): WorkstreamApprovalRound => ({
  id: generateId(),
  rule: 'any',
  approvers: [createEmptyApprover()]
});

const createEmptyGates = (): WorkstreamGates =>
  gateKeys.reduce<WorkstreamGates>((acc, key) => {
    acc[key] = [];
    return acc;
  }, {} as WorkstreamGates);

const ensureGates = (value?: WorkstreamGates): WorkstreamGates => {
  if (!value) {
    return createEmptyGates();
  }
  return gateKeys.reduce<WorkstreamGates>((acc, key) => {
    acc[key] =
      value[key]?.map((round) => ({
        ...round,
        rule: round.rule ?? 'any',
        approvers: round.approvers.length > 0 ? round.approvers : [createEmptyApprover()]
      })) ?? [];
    return acc;
  }, {} as WorkstreamGates);
};

const createEmptyWorkstream = (): Workstream => ({
  id: generateId(),
  name: '',
  description: '',
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  gates: createEmptyGates()
});

export const WorkstreamModal = ({
  initialWorkstream,
  onSave,
  onDelete,
  onClose,
  feedback,
  onFeedbackClear,
  accounts,
  loadAssignments
}: WorkstreamModalProps) => {
  const [workstream, setWorkstream] = useState<Workstream>(createEmptyWorkstream());
  const [roleLookup, setRoleLookup] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (initialWorkstream) {
      setWorkstream({ ...initialWorkstream, gates: ensureGates(initialWorkstream.gates) });
      void loadAssignments(initialWorkstream.id).then((result) => {
        if (result.ok) {
          const map = new Map<string, string>();
          result.data.forEach((assignment) => {
            if (assignment.accountId) {
              map.set(assignment.accountId, assignment.role);
            }
          });
          setRoleLookup(map);
        } else {
          setRoleLookup(new Map());
        }
      });
    } else {
      setWorkstream(createEmptyWorkstream());
      setRoleLookup(new Map());
    }
  }, [initialWorkstream, loadAssignments]);

  const expectedVersion = initialWorkstream ? initialWorkstream.version : null;

  const normalizedWorkstream = useMemo<Workstream>(() => {
    const normalizedGates = gateKeys.reduce<WorkstreamGates>((acc, key) => {
      const rounds = workstream.gates[key] ?? [];
      acc[key] = rounds.map((round) => ({
        ...round,
        rule: round.rule ?? 'any',
        approvers:
          round.approvers.length > 0
            ? round.approvers.map((approver) => ({
                ...approver,
                accountId: approver.accountId?.trim() ?? null,
                role: approver.role ? approver.role.trim() : null
              }))
            : [createEmptyApprover()]
      }));
      return acc;
    }, {} as WorkstreamGates);

    return {
      ...workstream,
      name: workstream.name.trim(),
      description: workstream.description.trim(),
      gates: normalizedGates
    };
  }, [workstream]);

  const handleFieldChange = (field: 'name' | 'description', value: string) => {
    onFeedbackClear();
    setWorkstream((prev) => ({ ...prev, [field]: value }));
  };

  const updateGate = (
    gateKey: WorkstreamGateKey,
    updater: (rounds: WorkstreamApprovalRound[]) => WorkstreamApprovalRound[]
  ) => {
    onFeedbackClear();
    setWorkstream((prev) => ({
      ...prev,
      gates: {
        ...prev.gates,
        [gateKey]: updater(prev.gates[gateKey] ?? [])
      }
    }));
  };

  const handleAddRound = (gateKey: WorkstreamGateKey) => {
    updateGate(gateKey, (rounds) => [...rounds, createEmptyRound()]);
  };

  const handleRemoveRound = (gateKey: WorkstreamGateKey, roundId: string) => {
    updateGate(gateKey, (rounds) => rounds.filter((round) => round.id !== roundId));
  };

  const handleAddApprover = (gateKey: WorkstreamGateKey, roundId: string) => {
    updateGate(gateKey, (rounds) =>
      rounds.map((round) =>
        round.id === roundId
          ? { ...round, approvers: [...round.approvers, createEmptyApprover()] }
          : round
      )
    );
  };

  const handleRemoveApprover = (gateKey: WorkstreamGateKey, roundId: string, approverId: string) => {
    updateGate(gateKey, (rounds) =>
      rounds.map((round) =>
        round.id === roundId
          ? {
              ...round,
              approvers:
                round.approvers.length > 1
                  ? round.approvers.filter((approver) => approver.id !== approverId)
                  : round.approvers
            }
          : round
      )
    );
  };

  const handleApproverChange = (
    gateKey: WorkstreamGateKey,
    roundId: string,
    approverId: string,
    accountId: string
  ) => {
    updateGate(gateKey, (rounds) =>
      rounds.map((round) =>
        round.id === roundId
          ? {
              ...round,
              approvers: round.approvers.map((approver) =>
                approver.id === approverId ? { ...approver, accountId: accountId || null } : approver
              )
            }
          : round
      )
    );
  };

  const handleRuleChange = (gateKey: WorkstreamGateKey, roundId: string, rule: WorkstreamApprovalRound['rule']) => {
    updateGate(gateKey, (rounds) =>
      rounds.map((round) => (round.id === roundId ? { ...round, rule } : round))
    );
  };

  const submitSave = (closeAfterSave: boolean) => {
    setWorkstream(normalizedWorkstream);
    void onSave(normalizedWorkstream, { closeAfterSave, expectedVersion });
  };

  const handleDelete = () => {
    if (!initialWorkstream) {
      onClose();
      return;
    }
    onFeedbackClear();
    void onDelete(initialWorkstream.id);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>{initialWorkstream ? 'Edit workstream' : 'Create workstream'}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </header>

        {feedback && (
          <div
            className={feedback.type === 'info' ? styles.feedbackInfo : styles.feedbackError}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.text}
          </div>
        )}

        <div className={styles.content}>
          <label className={styles.fieldGroup}>
            <span>Workstream name</span>
            <input
              type="text"
              value={workstream.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              placeholder="Enter workstream name"
            />
          </label>

          <label className={styles.fieldGroup}>
            <span>Description</span>
            <textarea
              value={workstream.description}
              onChange={(event) => handleFieldChange('description', event.target.value)}
              placeholder="Provide a short description"
            />
          </label>

          {gateKeys.map((gateKey) => (
            <WorkstreamGateEditor
              key={gateKey}
              gateKey={gateKey}
              rounds={workstream.gates[gateKey] ?? []}
              accounts={accounts}
              roleLookup={roleLookup}
              onAddRound={() => handleAddRound(gateKey)}
              onRemoveRound={(roundId) => handleRemoveRound(gateKey, roundId)}
              onAddApprover={(roundId) => handleAddApprover(gateKey, roundId)}
              onRemoveApprover={(roundId, approverId) =>
                handleRemoveApprover(gateKey, roundId, approverId)
              }
              onApproverChange={(roundId, approverId, accountId) =>
                handleApproverChange(gateKey, roundId, approverId, accountId)
              }
              onRuleChange={(roundId, rule) =>
                handleRuleChange(gateKey, roundId, rule)
              }
            />
          ))}
        </div>

        <footer className={styles.footer}>
          <button className={styles.linkButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.dangerButton} onClick={handleDelete} disabled={!initialWorkstream}>
            Delete workstream
          </button>
          <button className={styles.secondaryButton} onClick={() => submitSave(false)}>
            Save
          </button>
          <button className={styles.primaryButton} onClick={() => submitSave(true)}>
            Save and close
          </button>
        </footer>
      </div>
    </div>
  );
};
