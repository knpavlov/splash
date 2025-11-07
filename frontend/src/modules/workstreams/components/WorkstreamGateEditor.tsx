import {
  approvalRuleOptions,
  gateLabels,
  WorkstreamApprovalRound,
  WorkstreamGateKey
} from '../../../shared/types/workstream';
import styles from '../../../styles/WorkstreamModal.module.css';

const placeholderRoles = ['Manager', 'Sponsor', 'Transformation Director', 'Finance Partner', 'HR Lead'];

interface WorkstreamGateEditorProps {
  gateKey: WorkstreamGateKey;
  rounds: WorkstreamApprovalRound[];
  onAddRound: () => void;
  onRemoveRound: (roundId: string) => void;
  onAddApprover: (roundId: string) => void;
  onRemoveApprover: (roundId: string, approverId: string) => void;
  onApproverChange: (
    roundId: string,
    approverId: string,
    field: 'role' | 'rule',
    value: string
  ) => void;
}

export const WorkstreamGateEditor = ({
  gateKey,
  rounds,
  onAddRound,
  onRemoveRound,
  onAddApprover,
  onRemoveApprover,
  onApproverChange
}: WorkstreamGateEditorProps) => (
  <section className={styles.section}>
    <div className={styles.gateHeader}>
      <h3 className={styles.gateTitle}>{gateLabels[gateKey]}</h3>
      <button className={styles.addRoundButton} onClick={onAddRound}>
        Add approval round
      </button>
    </div>

    {rounds.length === 0 && (
      <p className={styles.mutedNote}>No approval rounds yet. Add one to start configuring this gate.</p>
    )}

    {rounds.map((round, roundIndex) => (
      <div key={round.id} className={styles.roundCard}>
        <div className={styles.roundHeader}>
          <p className={styles.roundTitle}>Round {roundIndex + 1}</p>
          <div className={styles.roundActions}>
            <button className={styles.removeRoundButton} onClick={() => onRemoveRound(round.id)}>
              Remove round
            </button>
          </div>
        </div>

        {round.approvers.map((approver) => (
          <div key={approver.id} className={styles.approverRow}>
            <select
              className={styles.dropdown}
              value={approver.role}
              onChange={(event) =>
                onApproverChange(round.id, approver.id, 'role', event.target.value)
              }
            >
              <option value="">Select role (coming soon)</option>
              {placeholderRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <select
              className={styles.dropdown}
              value={approver.rule}
              onChange={(event) =>
                onApproverChange(round.id, approver.id, 'rule', event.target.value)
              }
            >
              {approvalRuleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {round.approvers.length > 1 && (
              <button
                className={styles.removeApproverButton}
                onClick={() => onRemoveApprover(round.id, approver.id)}
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <button className={styles.addApproverButton} onClick={() => onAddApprover(round.id)}>
          Add more approvers
        </button>
      </div>
    ))}
  </section>
);
