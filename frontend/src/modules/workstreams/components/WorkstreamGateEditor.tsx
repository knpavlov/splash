import {
  approvalRuleOptions,
  gateLabels,
  WorkstreamApprovalRound,
  WorkstreamGateKey
} from '../../../shared/types/workstream';
import styles from '../../../styles/WorkstreamModal.module.css';
import { AccountRecord } from '../../../shared/types/account';
import { resolveAccountName } from '../../../shared/utils/accountName';

interface WorkstreamGateEditorProps {
  gateKey: WorkstreamGateKey;
  rounds: WorkstreamApprovalRound[];
  accounts: AccountRecord[];
  roleLookup: Map<string, string>;
  onAddRound: () => void;
  onRemoveRound: (roundId: string) => void;
  onAddApprover: (roundId: string) => void;
  onRemoveApprover: (roundId: string, approverId: string) => void;
  onApproverChange: (roundId: string, approverId: string, accountId: string) => void;
  onRuleChange: (roundId: string, rule: WorkstreamApprovalRound['rule']) => void;
}

export const WorkstreamGateEditor = ({
  gateKey,
  rounds,
  accounts,
  roleLookup,
  onAddRound,
  onRemoveRound,
  onAddApprover,
  onRemoveApprover,
  onApproverChange,
  onRuleChange
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

        <label className={styles.fieldGroup}>
          <span>Approval rule for this round</span>
          <select
            className={styles.dropdown}
            value={round.rule}
            onChange={(event) => onRuleChange(round.id, event.target.value as WorkstreamApprovalRound['rule'])}
          >
            {approvalRuleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {round.approvers.map((approver) => (
          <div key={approver.id} className={styles.approverRow}>
            <select
              className={styles.dropdown}
              value={approver.accountId ?? ''}
              onChange={(event) => onApproverChange(round.id, approver.id, event.target.value)}
            >
              <option value="">Select approver</option>
              {[...accounts]
                .sort((a, b) => resolveAccountName(a).localeCompare(resolveAccountName(b)))
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {resolveAccountName(account)}
                  </option>
                ))}
            </select>

            <div className={styles.roleHint}>
              {approver.accountId && roleLookup.get(approver.accountId)
                ? `Role: ${roleLookup.get(approver.accountId)}`
                : 'No workstream role set'}
            </div>

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
