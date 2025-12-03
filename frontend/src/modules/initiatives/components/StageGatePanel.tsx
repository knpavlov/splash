import { useCallback, useMemo, useState } from 'react';
import styles from '../../../styles/StageGatePanel.module.css';
import {
  InitiativeStageKey,
  InitiativeStageMap,
  initiativeStageKeys,
  InitiativeStageStateMap,
  InitiativeStageStatus
} from '../../../shared/types/initiative';
import {
  defaultWorkstreamRoleOptions,
  Workstream,
  WorkstreamGateKey,
  workstreamGateKeys
} from '../../../shared/types/workstream';
import { createCommentAnchor } from '../comments/commentAnchors';

interface StageGatePanelProps {
  stages: InitiativeStageMap;
  stageState: InitiativeStageStateMap;
  activeStage: InitiativeStageKey;
  selectedStage: InitiativeStageKey;
  initiativeName: string;
  onSelectStage: (stage: InitiativeStageKey) => void;
  workstream: Workstream | null;
  compact?: boolean;
}

const getNextStageKey = (stageKey: InitiativeStageKey): InitiativeStageKey | null => {
  const index = initiativeStageKeys.indexOf(stageKey);
  if (index === -1 || index >= initiativeStageKeys.length - 1) {
    return null;
  }
  return initiativeStageKeys[index + 1];
};

const getStageKeyForGate = (gateKey: WorkstreamGateKey): InitiativeStageKey | null => {
  const index = initiativeStageKeys.indexOf(gateKey);
  if (index <= 0) {
    return null;
  }
  return initiativeStageKeys[index - 1];
};

const formatGateStatusLabel = (status: InitiativeStageStateMap[InitiativeStageKey]['status'] | undefined) => {
  switch (status) {
    case 'pending':
      return 'In review';
    case 'approved':
      return 'Approved';
    case 'returned':
      return 'Returned';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Not started';
  }
};

const formatStageStatusLabel = (
  state: InitiativeStageStateMap[InitiativeStageKey] | undefined,
  index: number,
  activeIndex: number
) => {
  if (index === activeIndex) {
    if (state?.status === 'returned') {
      return 'Returned';
    }
    if (state?.status === 'rejected') {
      return 'Rejected';
    }
    if (state?.status === 'pending') {
      return 'In review';
    }
    return 'In progress';
  }
  if (!state || index > activeIndex) {
    return 'Not started';
  }
  if (state.status === 'approved') {
    return 'Completed';
  }
  if (state.status === 'pending') {
    return 'In review';
  }
  if (state.status === 'returned') {
    return 'Returned';
  }
  if (state.status === 'rejected') {
    return 'Rejected';
  }
  return 'Not started';
};

const gateKeySet = new Set(workstreamGateKeys);
const isGateKey = (value: InitiativeStageKey | undefined | null): value is WorkstreamGateKey =>
  Boolean(value && gateKeySet.has(value as WorkstreamGateKey));

type RoundStatus = 'complete' | 'current' | 'upcoming' | 'returned' | 'rejected';
type ApproverTone = 'pending' | 'approved' | 'returned' | 'rejected';

const resolveRoundStatus = (state: InitiativeStageStateMap[InitiativeStageKey] | undefined, index: number): RoundStatus => {
  if (!state) {
    return 'upcoming';
  }
  const { status, roundIndex = 0 } = state;
  if (status === 'approved') {
    return index <= roundIndex ? 'complete' : 'complete';
  }
  if (status === 'pending') {
    if (index < roundIndex) {
      return 'complete';
    }
    if (index === roundIndex) {
      return 'current';
    }
    return 'upcoming';
  }
  if (status === 'returned') {
    if (index < roundIndex) {
      return 'complete';
    }
    if (index === roundIndex) {
      return 'returned';
    }
    return 'upcoming';
  }
  if (status === 'rejected') {
    if (index < roundIndex) {
      return 'complete';
    }
    if (index === roundIndex) {
      return 'rejected';
    }
    return 'upcoming';
  }
  return 'upcoming';
};

const roundStatusLabel: Record<RoundStatus, string> = {
  complete: 'Approved',
  current: 'In progress',
  upcoming: 'Upcoming',
  returned: 'Returned',
  rejected: 'Rejected'
};

const approverToneLabels: Record<ApproverTone, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  returned: 'Returned for updates',
  rejected: 'Rejected'
};

const resolveApproverTone = (status: InitiativeStageStatus | undefined): ApproverTone => {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'returned':
      return 'returned';
    case 'rejected':
      return 'rejected';
    default:
      return 'pending';
  }
};

export const StageGatePanel = ({
  stages,
  stageState,
  activeStage,
  selectedStage,
  initiativeName,
  onSelectStage,
  workstream,
  compact = false
}: StageGatePanelProps) => {
  const activeIndex = initiativeStageKeys.indexOf(activeStage);
  const [hoveredGate, setHoveredGate] = useState<WorkstreamGateKey | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const roleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    defaultWorkstreamRoleOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, []);

  const handleGateMouseEnter = useCallback(
    (gateKey: WorkstreamGateKey, event: React.MouseEvent<HTMLDivElement>) => {
      setHoveredGate(gateKey);
      setTooltipPos({ x: event.clientX + 12, y: event.clientY + 16 });
    },
    []
  );

  const handleGateMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setTooltipPos({ x: event.clientX + 12, y: event.clientY + 16 });
  }, []);

  const handleGateMouseLeave = useCallback(() => {
    setHoveredGate(null);
    setTooltipPos(null);
  }, []);

  const renderGateTooltip = () => {
    if (!hoveredGate || !tooltipPos) {
      return null;
    }
    const parentStageKey = getStageKeyForGate(hoveredGate);
    const gateState = parentStageKey ? stageState[parentStageKey] : undefined;
    const tone = resolveApproverTone(gateState?.status);
    const toneLabel = approverToneLabels[tone];
    const rounds = workstream?.gates[hoveredGate] ?? [];
    return (
      <div className={styles.gateTooltip} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        <div className={styles.tooltipHeader}>
          <p className={styles.tooltipTitle}>Required approvals for next stage</p>
          <span className={styles.tooltipMeta}>
            {hoveredGate.toUpperCase()} Gate{gateState?.status ? ` - ${formatGateStatusLabel(gateState.status)}` : ''}
          </span>
        </div>
        {rounds.length === 0 ? (
          <span>No approvers configured.</span>
        ) : (
          <ul>
            {rounds.map((round, index) => (
              <li key={round.id}>
                <span className={styles.tooltipRoundTitle}>
                  Round {index + 1} - {roundStatusLabel[resolveRoundStatus(gateState, index)]}
                </span>
                <div className={styles.tooltipApprovers}>
                  {round.approvers.map((approver) => (
                    <div key={approver.id} className={styles.tooltipApproverRow}>
                      <span className={`${styles.statusDot} ${styles[`tone-${tone}`]}`} aria-hidden="true" />
                      <div className={styles.approverInfo}>
                        <strong>{roleLabelMap.get(approver.role) ?? approver.role}</strong>
                        <span className={styles.approverRule}>{approver.rule.toUpperCase()}</span>
                      </div>
                      <span className={styles.approverStatus}>{toneLabel}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderChevronLegend = () => (
    <div className={styles.chevronLegend}>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles['dot-upcoming']}`} aria-hidden="true" />
        Not started
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles['dot-complete']}`} aria-hidden="true" />
        Approved
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles['dot-current']}`} aria-hidden="true" />
        In progress
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles['dot-returned']}`} aria-hidden="true" />
        Returned for updates
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles['dot-rejected']}`} aria-hidden="true" />
        Rejected
      </span>
    </div>
  );

  return (
    <div className={`${styles.wrapper} ${compact ? styles.wrapperCompact : ''}`}>
      <div className={`${styles.track} ${compact ? styles.trackCompact : ''}`}>
        {initiativeStageKeys.map((key, index) => {
          const status = index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'upcoming';
          const state = stageState[key] ?? { status: 'draft' };
          const nextStage = getNextStageKey(key);

          const isSelected = selectedStage === key;
          const isActive = key === activeStage;

          const baseZIndex = (initiativeStageKeys.length - index) * 10;
          const zIndex = isSelected || isActive ? 1000 : baseZIndex;

          const stageClassNames = [
            styles.stage,
            styles.chevron,
            styles[status],
            isSelected ? styles.selected : '',
            isActive ? styles.current : '',
            isActive ? styles.active : '',
            styles[`stage-${state.status}`]
          ]
            .filter(Boolean)
            .join(' ');

          const stageAnchor = createCommentAnchor(`stage-track.${key}`, `${key.toUpperCase()} stage`);

          return (
            <div key={key} className={styles.trackItem} style={{ zIndex }}>
              <button type="button" className={stageClassNames} onClick={() => onSelectStage(key)} {...stageAnchor}>
                <span className={styles.stageLabel}>{key.toUpperCase()}</span>
              </button>
              {nextStage && isGateKey(nextStage) && (
                <div
                  className={styles.gateWrapper}
                  onMouseEnter={(event) => handleGateMouseEnter(nextStage, event)}
                  onMouseMove={handleGateMouseMove}
                  onMouseLeave={handleGateMouseLeave}
                  style={{ zIndex: zIndex - 1 }}
                >
                  <button
                    type="button"
                    className={[styles.gate, styles.chevron, styles[`gate-${state.status}`]].join(' ')}
                    {...createCommentAnchor(`stage-track.${nextStage}`, `${nextStage.toUpperCase()}`)}
                  >
                    <span className={styles.gateName}>{nextStage.toUpperCase()} Gate</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {renderGateTooltip()}
      {renderChevronLegend()}
    </div>
  );
};
