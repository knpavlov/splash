import { ApprovalTask } from '../../../shared/types/approval';
import { initiativeStageLabels } from '../../../shared/types/initiative';
import styles from '../../../styles/ApprovalsScreen.module.css';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

interface ApprovalsQueueTableProps {
  tasks: ApprovalTask[];
  isLoading: boolean;
  onSelect: (task: ApprovalTask) => void;
}

export const ApprovalsQueueTable = ({ tasks, isLoading, onSelect }: ApprovalsQueueTableProps) => {
  if (isLoading) {
    return <p className={styles.placeholder}>Loading approvals...</p>;
  }

  if (!tasks.length) {
    return (
      <div className={styles.emptyState}>
        <h2>No approvals waiting</h2>
        <p>You're all caught up. New submissions will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.queueTable}>
        <thead>
          <tr>
            <th>Initiative</th>
            <th>Workstream</th>
            <th>Stage</th>
            <th>Round</th>
            <th>Approver</th>
            <th>Requested</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const stageLabel = initiativeStageLabels[task.stageKey] ?? task.stageKey.toUpperCase();
            const roundLabel =
              task.roundCount > 0
                ? `Round ${Math.min(task.roundIndex + 1, task.roundCount)} of ${task.roundCount}`
                : `Round ${task.roundIndex + 1}`;
            const ruleLabel = task.rule === 'all' ? 'All' : task.rule === 'majority' ? 'Majority' : 'Any';
            const approverLabel = task.accountName ?? task.accountEmail ?? 'Unassigned';
            const roleLabel = task.accountRole || task.role || '';
            return (
              <tr
                key={task.id}
                className={styles.queueRow}
                onClick={() => onSelect(task)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(task);
                  }
                }}
                tabIndex={0}
              >
                <td>
                  <div className={styles.rowTitle}>{task.initiativeName}</div>
                  <div className={styles.rowMeta}>{task.ownerName || 'Unassigned'} · {task.workstreamName}</div>
                </td>
                <td>{task.workstreamName}</td>
                <td>{stageLabel}</td>
                <td>
                  {roundLabel}
                  <div className={styles.rowMeta}>{ruleLabel} required</div>
                </td>
                <td>
                  <div className={styles.rowTitle}>{approverLabel}</div>
                  <div className={styles.rowMeta}>{roleLabel || 'No role set'}</div>
                </td>
                <td>{formatDateTime(task.requestedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
