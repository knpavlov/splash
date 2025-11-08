import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/ApprovalsScreen.module.css';
import { approvalsApi } from './services/approvalsApi';
import { ApprovalTask, ApprovalDecision } from '../../shared/types/approval';
import { initiativeStageLabels } from '../../shared/types/initiative';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../../shared/api/httpClient';

type Banner = { type: 'info' | 'error'; text: string } | null;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const formatCurrency = (value: number) => currency.format(value || 0);
const formatDateTime = (value: string) => new Date(value).toLocaleString();

const sumDistribution = (distribution: Record<string, number>) =>
  Object.values(distribution).reduce((total, amount) => total + (Number.isFinite(amount) ? Number(amount) : 0), 0);

export const ApprovalsScreen = () => {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeciding, setIsDeciding] = useState<ApprovalDecision | null>(null);
  const [comment, setComment] = useState('');
  const [banner, setBanner] = useState<Banner>(null);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null,
    [selectedId, tasks]
  );

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setBanner(null);
    try {
      const data = await approvalsApi.list({ status: 'pending', accountId: session?.accountId });
      setTasks(data);
      if (data.length === 0) {
        setSelectedId(null);
      } else if (!selectedId || !data.some((task) => task.id === selectedId)) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load approvals', error);
      setBanner({ type: 'error', text: 'Failed to load approval queue. Please retry.' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedId, session?.accountId]);

  useEffect(() => {
    loadTasks().catch(() => {});
  }, [loadTasks]);

  const handleDecision = async (decision: ApprovalDecision) => {
    if (!selectedTask) {
      return;
    }
    if ((decision === 'return' || decision === 'reject') && !comment.trim()) {
      setBanner({ type: 'error', text: 'Please add a comment before returning or rejecting the initiative.' });
      return;
    }
    setIsDeciding(decision);
    setBanner(null);
    try {
      await approvalsApi.decide(selectedTask.id, decision, {
        comment: comment.trim() || null,
        accountId: session?.accountId
      });
      setComment('');
      await loadTasks();
      setBanner({ type: 'info', text: decision === 'approve' ? 'Approved successfully.' : 'Decision saved.' });
    } catch (error) {
      if (error instanceof ApiError) {
        const message =
          error.code === 'forbidden'
            ? 'You cannot act on this approval.'
            : error.code === 'missing-approvers'
              ? 'Workstream approvers are not set up for the next round.'
              : 'Failed to submit your decision. Please retry.';
        setBanner({ type: 'error', text: message });
      } else {
        console.error('Failed to submit decision', error);
        setBanner({ type: 'error', text: 'Failed to submit your decision. Please retry.' });
      }
    } finally {
      setIsDeciding(null);
    }
  };

  const listContent = () => {
    if (isLoading) {
      return <p className={styles.placeholder}>Loading approvals…</p>;
    }
    if (!tasks.length) {
      return <p className={styles.placeholder}>No approvals waiting for your review.</p>;
    }
    return (
      <ul className={styles.taskList}>
        {tasks.map((task) => {
          const isActive = selectedTask?.id === task.id;
          const stageLabel = initiativeStageLabels[task.stageKey] ?? task.stageKey.toUpperCase();
          const roundLabel =
            task.roundCount > 0
              ? `Round ${Math.min(task.roundIndex + 1, task.roundCount)} of ${task.roundCount}`
              : `Round ${task.roundIndex + 1}`;
          return (
            <li key={task.id}>
              <button
                type="button"
                className={isActive ? styles.taskButtonActive : styles.taskButton}
                onClick={() => setSelectedId(task.id)}
              >
                <div className={styles.taskTitle}>{task.initiativeName}</div>
                <div className={styles.taskMeta}>
                  <span>{stageLabel}</span>
                  <span>·</span>
                  <span>{roundLabel}</span>
                </div>
                <div className={styles.taskRole}>
                  {task.role} · {task.rule === 'all' ? 'All' : task.rule === 'majority' ? 'Majority' : 'Any'}
                </div>
                <div className={styles.taskTime}>Requested {formatDateTime(task.requestedAt)}</div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const detailContent = () => {
    if (!selectedTask) {
      return (
        <div className={styles.detailPlaceholder}>
          <h2>Select an approval</h2>
          <p>Pick an initiative on the left to review the details and submit your decision.</p>
        </div>
      );
    }
    const stageLabel = initiativeStageLabels[selectedTask.stageKey] ?? selectedTask.stageKey.toUpperCase();
    const roundLabel =
      selectedTask.roundCount > 0
        ? `Round ${Math.min(selectedTask.roundIndex + 1, selectedTask.roundCount)} of ${selectedTask.roundCount}`
        : `Round ${selectedTask.roundIndex + 1}`;
    const roleRequirement = `${selectedTask.role} · ${
      selectedTask.rule === 'all' ? 'All' : selectedTask.rule === 'majority' ? 'Majority' : 'Any'
    }`;
    const totalsCards = [
      { label: 'Recurring benefits', value: selectedTask.totals.recurringBenefits },
      { label: 'Recurring costs', value: selectedTask.totals.recurringCosts },
      { label: 'One-off benefits', value: selectedTask.totals.oneoffBenefits },
      { label: 'One-off costs', value: selectedTask.totals.oneoffCosts },
      { label: 'Recurring impact', value: selectedTask.totals.recurringImpact }
    ];

    const lineItems = [
      ...selectedTask.stage.financials['recurring-benefits'].map((entry) => ({
        kind: 'Recurring benefit',
        category: entry.category || 'Uncategorized',
        total: sumDistribution(entry.distribution)
      })),
      ...selectedTask.stage.financials['recurring-costs'].map((entry) => ({
        kind: 'Recurring cost',
        category: entry.category || 'Uncategorized',
        total: sumDistribution(entry.distribution)
      })),
      ...selectedTask.stage.financials['oneoff-benefits'].map((entry) => ({
        kind: 'One-off benefit',
        category: entry.category || 'Uncategorized',
        total: sumDistribution(entry.distribution)
      })),
      ...selectedTask.stage.financials['oneoff-costs'].map((entry) => ({
        kind: 'One-off cost',
        category: entry.category || 'Uncategorized',
        total: sumDistribution(entry.distribution)
      }))
    ].filter((item) => item.total !== 0);

    return (
      <div className={styles.detail}>
        <header className={styles.detailHeader}>
          <div>
            <p className={styles.detailStage}>{stageLabel}</p>
            <h2>{selectedTask.initiativeName}</h2>
            <p className={styles.detailSub}>
              {roleRequirement} · {roundLabel}
            </p>
          </div>
          <div className={styles.detailMeta}>
            <p>
              <strong>Owner:</strong> {selectedTask.ownerName || 'Unassigned'}
            </p>
            <p>
              <strong>Workstream:</strong> {selectedTask.workstreamName}
            </p>
            <p>
              <strong>Requested:</strong> {formatDateTime(selectedTask.requestedAt)}
            </p>
          </div>
        </header>

        <div className={styles.totalsGrid}>
          {totalsCards.map((card) => (
            <div key={card.label} className={styles.totalCard}>
              <p>{card.label}</p>
              <h3>{formatCurrency(card.value)}</h3>
            </div>
          ))}
        </div>

        <section className={styles.section}>
          <h3>Stage overview</h3>
          <p className={styles.description}>{selectedTask.stage.description || 'No description provided.'}</p>
          <div className={styles.metaGrid}>
            <div>
              <span>Initiative name</span>
              <strong>{selectedTask.stage.name || selectedTask.initiativeName}</strong>
            </div>
            <div>
              <span>Initiative period</span>
              <strong>
                {selectedTask.stage.periodMonth
                  ? new Date(2000, selectedTask.stage.periodMonth - 1, 1).toLocaleString('en-US', { month: 'long' })
                  : 'Not set'}{' '}
                {selectedTask.stage.periodYear ?? ''}
              </strong>
            </div>
          </div>
        </section>

        {lineItems.length > 0 && (
          <section className={styles.section}>
            <h3>P&L entries</h3>
            <table className={styles.linesTable}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={`${item.kind}-${item.category}-${index}`}>
                    <td>{item.kind}</td>
                    <td>{item.category}</td>
                    <td>{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className={styles.section}>
          <h3>Your decision</h3>
          <textarea
            className={styles.commentInput}
            placeholder="Add a comment (required for return/reject)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
          />
          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => handleDecision('return')}
              disabled={isDeciding === 'return'}
            >
              {isDeciding === 'return' ? 'Sending…' : 'Return'}
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => handleDecision('reject')}
              disabled={isDeciding === 'reject'}
            >
              {isDeciding === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => handleDecision('approve')}
              disabled={isDeciding === 'approve'}
            >
              {isDeciding === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </section>
      </div>
    );
  };

  return (
    <section className={styles.wrapper}>
      <div className={styles.listPane}>
        <header className={styles.listHeader}>
          <div>
            <h1>Approvals</h1>
            <p>Review initiatives waiting for your sign-off.</p>
          </div>
          <button className={styles.refreshButton} type="button" onClick={() => loadTasks()}>
            Refresh
          </button>
        </header>
        {banner && banner.type === 'error' && <div className={styles.errorBanner}>{banner.text}</div>}
        {listContent()}
      </div>
      <div className={styles.detailPane}>
        {banner && banner.type === 'info' && <div className={styles.infoBanner}>{banner.text}</div>}
        {detailContent()}
      </div>
    </section>
  );
};
