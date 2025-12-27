import { useState, useCallback, useMemo } from 'react';
import styles from './StageGateDemo.module.css';

// Types
type DemoStep = 'owner-edit' | 'owner-submit' | 'approver-review' | 'approver-action' | 'complete';
type ApprovalAction = 'approved' | 'returned' | 'rejected' | null;
type InteractionMode = 'owner' | 'approver';
type StatusTone = 'draft' | 'submitted' | 'review' | 'locked' | 'approved' | 'returned' | 'rejected';

interface FinancialLine {
  id: string;
  label: string;
  values: number[];
}

interface Comment {
  id: string;
  cellId: string;
  text: string;
  author: string;
}

// Stage gate stages
const STAGES = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'] as const;
type Stage = typeof STAGES[number];

const STAGE_LABELS: Record<Stage, string> = {
  'stage-1': 'Stage 1',
  'stage-2': 'Stage 2',
  'stage-3': 'Stage 3',
  'stage-4': 'Stage 4',
  'stage-5': 'Stage 5'
};

// Demo months
const DEMO_MONTHS = ['Jan 25', 'Feb 25', 'Mar 25', 'Q2 25', 'Q3 25', 'Q4 25'];

// Initial financial data
const INITIAL_FINANCIALS: { benefits: FinancialLine[]; costs: FinancialLine[] } = {
  benefits: [
    { id: 'b1', label: 'Revenue increase', values: [0, 15000, 25000, 85000, 120000, 180000] },
    { id: 'b2', label: 'Cost avoidance', values: [0, 5000, 8000, 20000, 35000, 50000] }
  ],
  costs: [
    { id: 'c1', label: 'Development', values: [45000, 35000, 25000, 15000, 10000, 5000] },
    { id: 'c2', label: 'Infrastructure', values: [12000, 8000, 6000, 4000, 4000, 4000] }
  ]
};

// Hint messages for each step
const STEP_HINTS: Record<DemoStep, { title: string; description: string; action?: string }> = {
  'owner-edit': {
    title: 'Edit Financial Projections',
    description: 'As the initiative owner, update your benefit projections to reflect latest estimates.',
    action: 'Click on a cell to edit, then Submit for Review'
  },
  'owner-submit': {
    title: 'Ready to Submit',
    description: 'Your changes are ready. Click Submit to send for approval.',
    action: 'Click Submit for Review'
  },
  'approver-review': {
    title: 'Review as Approver',
    description: 'As the gate approver, review the financial projections. Click any cell to leave a comment.',
    action: 'Click on cells to comment, then make your decision'
  },
  'approver-action': {
    title: 'Make Your Decision',
    description: 'You\'ve reviewed the submission. Choose to Approve, Return for updates, or Reject.',
    action: 'Click Approve, Return, or Reject'
  },
  'complete': {
    title: 'Process Complete',
    description: 'The stage gate review is complete. Click Reset to try again.',
    action: 'Click Reset Demo to start over'
  }
};

// Format currency
const formatCurrency = (value: number) => {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }
  return `$${value}`;
};

interface StageGateDemoProps {
  className?: string;
}

export const StageGateDemo = ({ className }: StageGateDemoProps) => {
  // State
  const [currentStep, setCurrentStep] = useState<DemoStep>('owner-edit');
  const [activeStage] = useState<Stage>('stage-2');
  const [financials, setFinancials] = useState(INITIAL_FINANCIALS);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [approvalAction, setApprovalAction] = useState<ApprovalAction>(null);
  const [showHint, setShowHint] = useState(true);

  // Computed values
  const isOwnerPhase = currentStep === 'owner-edit' || currentStep === 'owner-submit';
  const isApproverPhase = currentStep === 'approver-review' || currentStep === 'approver-action';
  const hasSubmission = currentStep === 'approver-review' || currentStep === 'approver-action' || currentStep === 'complete';
  const isApproverLocked = !hasSubmission;

  const totals = useMemo(() => {
    const benefitTotals = DEMO_MONTHS.map((_, i) =>
      financials.benefits.reduce((sum, line) => sum + line.values[i], 0)
    );
    const costTotals = DEMO_MONTHS.map((_, i) =>
      financials.costs.reduce((sum, line) => sum + line.values[i], 0)
    );
    const netTotals = DEMO_MONTHS.map((_, i) => benefitTotals[i] - costTotals[i]);
    return { benefits: benefitTotals, costs: costTotals, net: netTotals };
  }, [financials]);

  const totalBenefits = totals.benefits.reduce((a, b) => a + b, 0);
  const totalCosts = totals.costs.reduce((a, b) => a + b, 0);
  const totalNet = totalBenefits - totalCosts;
  const chartMax = useMemo(() => Math.max(...totals.benefits, ...totals.costs, 1), [totals]);

  // Handlers
  const handleCellClick = useCallback((mode: InteractionMode, type: 'benefit' | 'cost', lineId: string, monthIndex: number) => {
    const cellId = `${type}-${lineId}-${monthIndex}`;

    if (mode === 'owner') {
      if (!isOwnerPhase) {
        return;
      }
      const lines = type === 'benefit' ? financials.benefits : financials.costs;
      const line = lines.find(l => l.id === lineId);
      if (line) {
        setEditingCell(cellId);
        setEditValue(String(line.values[monthIndex]));
      }
    } else {
      if (!isApproverPhase) {
        return;
      }
      setSelectedCell(cellId);
      setCommentText('');
    }
  }, [isOwnerPhase, isApproverPhase, financials]);

  const handleCellBlur = useCallback(() => {
    if (editingCell && editValue !== '') {
      const [type, lineId, monthIndexStr] = editingCell.split('-');
      const monthIndex = parseInt(monthIndexStr);
      const numValue = parseInt(editValue) || 0;

      setFinancials(prev => {
        const key = type === 'benefit' ? 'benefits' : 'costs';
        return {
          ...prev,
          [key]: prev[key].map(line => {
            if (line.id === lineId) {
              const newValues = [...line.values];
              newValues[monthIndex] = numValue;
              return { ...line, values: newValues };
            }
            return line;
          })
        };
      });

      if (currentStep === 'owner-edit') {
        setCurrentStep('owner-submit');
      }
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, currentStep]);

  const handleSubmit = useCallback(() => {
    if (currentStep === 'owner-edit' || currentStep === 'owner-submit') {
      setCurrentStep('approver-review');
      setShowHint(true);
    }
  }, [currentStep]);

  const handleAddComment = useCallback(() => {
    if (selectedCell && commentText.trim()) {
      const newComment: Comment = {
        id: `comment-${Date.now()}`,
        cellId: selectedCell,
        text: commentText.trim(),
        author: 'Finance Lead'
      };
      setComments(prev => [...prev, newComment]);
      setSelectedCell(null);
      setCommentText('');

      if (currentStep === 'approver-review') {
        setCurrentStep('approver-action');
      }
    }
  }, [selectedCell, commentText, currentStep]);

  const handleApprovalAction = useCallback((action: ApprovalAction) => {
    setApprovalAction(action);
    setCurrentStep('complete');
  }, []);

  const handleReset = useCallback(() => {
    setCurrentStep('owner-edit');
    setFinancials(INITIAL_FINANCIALS);
    setEditingCell(null);
    setEditValue('');
    setComments([]);
    setSelectedCell(null);
    setCommentText('');
    setApprovalAction(null);
    setShowHint(true);
  }, []);

  const getCommentForCell = (cellId: string) => comments.find(c => c.cellId === cellId);

  const hint = STEP_HINTS[currentStep];

  const resolveStatus = (view: InteractionMode): { label: string; tone: StatusTone } => {
    if (currentStep === 'complete') {
      if (approvalAction === 'approved') return { label: 'Approved', tone: 'approved' };
      if (approvalAction === 'returned') return { label: 'Returned', tone: 'returned' };
      return { label: 'Rejected', tone: 'rejected' };
    }

    if (view === 'owner') {
      return isOwnerPhase ? { label: 'Draft', tone: 'draft' } : { label: 'Submitted', tone: 'submitted' };
    }

    if (isApproverLocked) {
      return { label: 'Awaiting submission', tone: 'locked' };
    }

    if (currentStep === 'approver-action') {
      return { label: 'Decision pending', tone: 'review' };
    }

    return { label: 'In review', tone: 'review' };
  };

  const statusClassMap: Record<StatusTone, string> = {
    draft: styles.toneDraft,
    submitted: styles.toneSubmitted,
    review: styles.toneReview,
    locked: styles.toneLocked,
    approved: styles.toneApproved,
    returned: styles.toneReturned,
    rejected: styles.toneRejected
  };

  const ownerStatus = resolveStatus('owner');
  const approverStatus = resolveStatus('approver');

  // Render stage gate progress
  const renderStageGate = () => (
    <div className={styles.stageGate}>
      {STAGES.map((stage, index) => {
        const isActive = stage === activeStage;
        const isPast = STAGES.indexOf(stage) < STAGES.indexOf(activeStage);
        const isApproved = isPast || (isActive && currentStep === 'complete' && approvalAction === 'approved');

        return (
          <div key={stage} className={styles.stageItem}>
            <div
              className={`${styles.stageChevron} ${isActive ? styles.active : ''} ${isPast || isApproved ? styles.complete : ''}`}
            >
              <span className={styles.stageLabel}>{STAGE_LABELS[stage]}</span>
              {isActive && (
                <span className={styles.stageStatus}>
                  {currentStep === 'complete'
                    ? approvalAction === 'approved' ? 'Approved' : approvalAction === 'returned' ? 'Returned' : 'Rejected'
                    : 'In Review'}
                </span>
              )}
            </div>
            {index < STAGES.length - 1 && (
              <div className={`${styles.gateConnector} ${isPast ? styles.passed : ''}`}>
                <div className={styles.gateDiamond}>
                  {isPast && <span>{'\u2713'}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Render financial table
  const renderFinancialTable = (mode: InteractionMode) => {
    const isInteractive = mode === 'owner' ? isOwnerPhase : isApproverPhase;

    return (
      <div className={styles.financialTable}>
        {/* Header */}
        <div className={styles.tableHeader}>
          <div className={styles.labelCell}>Line Item</div>
          {DEMO_MONTHS.map((month, i) => (
            <div key={i} className={styles.monthCell}>{month}</div>
          ))}
          <div className={styles.totalCell}>Total</div>
        </div>

        {/* Benefits section */}
        <div className={styles.sectionLabel}>
          <span className={styles.benefitDot} />
          Benefits
        </div>
        {financials.benefits.map(line => (
          <div key={line.id} className={styles.tableRow}>
            <div className={styles.labelCell}>{line.label}</div>
            {line.values.map((value, i) => {
              const cellId = `benefit-${line.id}-${i}`;
              const isEditing = mode === 'owner' && isOwnerPhase && editingCell === cellId;
              const comment = getCommentForCell(cellId);
              const isSelected = mode === 'approver' && isApproverPhase && selectedCell === cellId;

              return (
                <div
                  key={i}
                  className={`${styles.valueCell} ${styles.benefitCell} ${comment ? styles.hasComment : ''} ${isSelected ? styles.selected : ''} ${!isInteractive ? styles.readOnlyCell : ''}`}
                  onClick={() => handleCellClick(mode, 'benefit', line.id, i)}
                >
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleCellBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleCellBlur()}
                      autoFocus
                      className={styles.cellInput}
                    />
                  ) : (
                    <>
                      {formatCurrency(value)}
                      {comment && <span className={styles.commentBadge}>{comments.indexOf(comment) + 1}</span>}
                    </>
                  )}
                </div>
              );
            })}
            <div className={styles.totalCell}>
              {formatCurrency(line.values.reduce((a, b) => a + b, 0))}
            </div>
          </div>
        ))}
        <div className={styles.subtotalRow}>
          <div className={styles.labelCell}>Total Benefits</div>
          {totals.benefits.map((val, i) => (
            <div key={i} className={`${styles.valueCell} ${styles.benefitCell}`}>{formatCurrency(val)}</div>
          ))}
          <div className={styles.totalCell}>{formatCurrency(totalBenefits)}</div>
        </div>

        {/* Costs section */}
        <div className={styles.sectionLabel}>
          <span className={styles.costDot} />
          Costs
        </div>
        {financials.costs.map(line => (
          <div key={line.id} className={styles.tableRow}>
            <div className={styles.labelCell}>{line.label}</div>
            {line.values.map((value, i) => {
              const cellId = `cost-${line.id}-${i}`;
              const isEditing = mode === 'owner' && isOwnerPhase && editingCell === cellId;
              const comment = getCommentForCell(cellId);
              const isSelected = mode === 'approver' && isApproverPhase && selectedCell === cellId;

              return (
                <div
                  key={i}
                  className={`${styles.valueCell} ${styles.costCell} ${comment ? styles.hasComment : ''} ${isSelected ? styles.selected : ''} ${!isInteractive ? styles.readOnlyCell : ''}`}
                  onClick={() => handleCellClick(mode, 'cost', line.id, i)}
                >
                  {isEditing ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleCellBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleCellBlur()}
                      autoFocus
                      className={styles.cellInput}
                    />
                  ) : (
                    <>
                      {formatCurrency(value)}
                      {comment && <span className={styles.commentBadge}>{comments.indexOf(comment) + 1}</span>}
                    </>
                  )}
                </div>
              );
            })}
            <div className={styles.totalCell}>
              {formatCurrency(line.values.reduce((a, b) => a + b, 0))}
            </div>
          </div>
        ))}
        <div className={styles.subtotalRow}>
          <div className={styles.labelCell}>Total Costs</div>
          {totals.costs.map((val, i) => (
            <div key={i} className={`${styles.valueCell} ${styles.costCell}`}>{formatCurrency(val)}</div>
          ))}
          <div className={styles.totalCell}>{formatCurrency(totalCosts)}</div>
        </div>

        {/* Net impact */}
        <div className={`${styles.subtotalRow} ${styles.netRow}`}>
          <div className={styles.labelCell}>Net Impact</div>
          {totals.net.map((val, i) => (
            <div key={i} className={`${styles.valueCell} ${val >= 0 ? styles.positive : styles.negative}`}>
              {formatCurrency(val)}
            </div>
          ))}
          <div className={`${styles.totalCell} ${totalNet >= 0 ? styles.positive : styles.negative}`}>
            {formatCurrency(totalNet)}
          </div>
        </div>
      </div>
    );
  };

  // Render comment popup
  const renderCommentPopup = () => {
    if (!selectedCell || !isApproverPhase) return null;

    return (
      <div className={styles.commentPopup}>
        <div className={styles.commentHeader}>
          <span>Add Comment</span>
          <button onClick={() => setSelectedCell(null)} className={styles.closeBtn}>{'\u00D7'}</button>
        </div>
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Enter your feedback..."
          className={styles.commentInput}
          autoFocus
        />
        <div className={styles.commentActions}>
          <button onClick={() => setSelectedCell(null)} className={styles.cancelBtn}>Cancel</button>
          <button onClick={handleAddComment} className={styles.addBtn} disabled={!commentText.trim()}>
            Add Comment
          </button>
        </div>
      </div>
    );
  };

  // Render comments list
  const renderCommentsList = () => {
    if (comments.length === 0) return null;

    return (
      <div className={styles.commentsList}>
        <h4>Review Comments</h4>
        {comments.map((comment, i) => (
          <div key={comment.id} className={styles.commentItem}>
            <span className={styles.commentNumber}>{i + 1}</span>
            <div className={styles.commentContent}>
              <span className={styles.commentAuthor}>{comment.author}</span>
              <p>{comment.text}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };
  const renderInitiativeHeader = (status: { label: string; tone: StatusTone }) => (
    <div className={styles.initiativeHeader}>
      <div className={styles.initiativeInfo}>
        <div className={styles.initiativeTitle}>
          <span className={styles.initiativeLabel}>Initiative name</span>
          <h3>Customer Analytics Platform</h3>
        </div>
        <span className={`${styles.initiativeStatus} ${statusClassMap[status.tone]}`}>
          {status.label}
        </span>
      </div>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total Benefits</span>
          <span className={`${styles.kpiValue} ${styles.benefit}`}>{formatCurrency(totalBenefits)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total Costs</span>
          <span className={`${styles.kpiValue} ${styles.cost}`}>{formatCurrency(totalCosts)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Net Impact</span>
          <span className={`${styles.kpiValue} ${totalNet >= 0 ? styles.benefit : styles.cost}`}>
            {formatCurrency(totalNet)}
          </span>
        </div>
      </div>
    </div>
  );

  const renderFinancialSection = (mode: InteractionMode) => (
    <div className={styles.financialSection}>
      <div className={styles.sectionTabs}>
        <button type="button" className={`${styles.sectionTab} ${styles.sectionTabActive}`}>Financial outlook</button>
        <button type="button" className={styles.sectionTab} disabled>Implementation plan</button>
        <button type="button" className={styles.sectionTab} disabled>KPIs</button>
        <button type="button" className={styles.sectionTab} disabled>Risks matrix</button>
        <button type="button" className={styles.sectionTab} disabled>Attachments</button>
      </div>
      <div className={styles.sectionHeader}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <h4>Financial Outlook</h4>
        {mode === 'owner' && isOwnerPhase && <span className={styles.editableTag}>Editable</span>}
        {mode === 'approver' && isApproverPhase && <span className={styles.reviewTag}>Click cells to comment</span>}
        {mode === 'approver' && isApproverLocked && <span className={styles.lockedTag}>Awaiting submission</span>}
      </div>
      <div className={styles.financialChart}>
        <div className={styles.chartLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatchBenefit} />
            Benefits
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendSwatchCost} />
            Costs
          </span>
        </div>
        <div className={styles.chartArea}>
          <div className={styles.chartAxis} />
          <div className={styles.chartBars}>
            {DEMO_MONTHS.map((month, i) => {
              const benefitHeight = (totals.benefits[i] / chartMax) * 100;
              const costHeight = (totals.costs[i] / chartMax) * 100;
              return (
                <div key={month} className={styles.chartColumn}>
                  <div className={styles.chartBarUp} style={{ height: `${benefitHeight}%` }} />
                  <div className={styles.chartBarDown} style={{ height: `${costHeight}%` }} />
                  <span className={styles.chartLabel}>{month}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {renderFinancialTable(mode)}
      {mode === 'approver' && renderCommentPopup()}
    </div>
  );
  return (
    <div className={`${styles.demoContainer} ${className || ''}`}>
      {/* Hint overlay */}
      {showHint && currentStep !== 'complete' && (
        <div className={`${styles.hintOverlay} ${currentStep === 'owner-edit' ? styles.pulse : ''}`}>
          <div className={styles.hintContent}>
            <div className={styles.hintText}>
              <span className={styles.hintTitle}>{hint.title}</span>
              <span className={styles.hintDesc}>{hint.description}</span>
              {hint.action && <span className={styles.hintAction}>{hint.action}</span>}
            </div>
            <button className={styles.hintDismiss} onClick={() => setShowHint(false)}>Got it</button>
          </div>
        </div>
      )}

      <div className={styles.demoStack}>
        <div className={styles.demoWindow}>
          <div className={styles.windowChrome}>
            <div className={styles.browserTab}>
              <span className={styles.browserFavicon} />
              Initiative - Laiten
            </div>
            <div className={styles.browserAddress}>app.laiten.com/initiatives/CA-120</div>
            <button className={styles.resetBtn} onClick={handleReset} title="Reset Demo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              Reset
            </button>
          </div>

          <div className={styles.appContent}>
            <div className={styles.viewRow}>
              <span className={styles.viewLabel}>Initiative Owner View</span>
              <span className={`${styles.viewStatus} ${statusClassMap[ownerStatus.tone]}`}>
                {ownerStatus.label}
              </span>
            </div>
            {renderInitiativeHeader(ownerStatus)}
            {renderStageGate()}
            {renderFinancialSection('owner')}
            {isOwnerPhase && (
              <div className={styles.actionBar}>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Submit for Review
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.demoWindow} ${isApproverLocked ? styles.windowLocked : ''}`}>
          <div className={styles.windowChrome}>
            <div className={styles.browserTab}>
              <span className={styles.browserFavicon} />
              Initiative - Laiten
            </div>
            <div className={styles.browserAddress}>app.laiten.com/initiatives/CA-120</div>
          </div>

          {isApproverLocked && (
            <div className={styles.windowLockOverlay}>
              <div className={styles.windowLockContent}>
                <span className={styles.windowLockTitle}>Awaiting owner submission</span>
                <span className={styles.windowLockDesc}>Submit the initiative above to start the approval workflow.</span>
              </div>
            </div>
          )}

          <div className={styles.appContent}>
            <div className={styles.viewRow}>
              <span className={styles.viewLabel}>Approver View</span>
              <span className={`${styles.viewStatus} ${statusClassMap[approverStatus.tone]}`}>
                {approverStatus.label}
              </span>
            </div>
            {renderInitiativeHeader(approverStatus)}
            {renderStageGate()}
            {renderFinancialSection('approver')}
            {renderCommentsList()}
            {(isApproverPhase || currentStep === 'complete') && (
              <div className={styles.actionBar}>
                {isApproverPhase && (
                  <div className={styles.approverActions}>
                    <button className={`${styles.actionBtn} ${styles.approveBtn}`} onClick={() => handleApprovalAction('approved')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Approve
                    </button>
                    <button className={`${styles.actionBtn} ${styles.returnBtn}`} onClick={() => handleApprovalAction('returned')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                      Return
                    </button>
                    <button className={`${styles.actionBtn} ${styles.rejectBtn}`} onClick={() => handleApprovalAction('rejected')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Reject
                    </button>
                  </div>
                )}

                {currentStep === 'complete' && (
                  <div className={styles.completeMessage}>
                    <span className={`${styles.completeBadge} ${styles[approvalAction || 'approved']}`}>
                      {approvalAction === 'approved' && 'Approved - Ready for next stage'}
                      {approvalAction === 'returned' && 'Returned - Owner will revise'}
                      {approvalAction === 'rejected' && 'Rejected - Initiative closed'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};




