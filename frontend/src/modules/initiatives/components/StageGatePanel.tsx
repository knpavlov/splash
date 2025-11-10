import { useCallback, useMemo, useState } from 'react';
import styles from '../../../styles/StageGatePanel.module.css';
import { InitiativeStageKey, InitiativeStageMap, initiativeStageKeys, InitiativeStageStateMap } from '../../../shared/types/initiative';
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
  onSelectStage: (stage: InitiativeStageKey) => void;
  workstream: Workstream | null;
  compact?: boolean;
}

const stageStatusLabel = (status: InitiativeStageStateMap[InitiativeStageKey]['status'] | undefined) => {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'returned':
      return 'Returned';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Draft';
  }
};

const gateKeySet = new Set(workstreamGateKeys);
const isGateKey = (value: InitiativeStageKey | undefined | null): value is WorkstreamGateKey =>
  Boolean(value && gateKeySet.has(value as WorkstreamGateKey));

type RoundStatus = 'complete' | 'current' | 'upcoming' | 'returned' | 'rejected';

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

export const StageGatePanel = ({
  stages,
  stageState,
  activeStage,
  selectedStage,
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
    const gateState = stageState[hoveredGate];
    const rounds = workstream?.gates[hoveredGate] ?? [];
    return (
      <div className={styles.gateTooltip} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        <p>
          <strong>{hoveredGate.toUpperCase()} gate</strong> · {stageStatusLabel(gateState?.status)}
        </p>
        {rounds.length === 0 ? (
          <span>No approvers configured.</span>
        ) : (
          <ul>
            {rounds.map((round, index) => (
              <li key={round.id}>
                <span className={styles.tooltipRoundTitle}>
                  Round {index + 1} · {roundStatusLabel[resolveRoundStatus(gateState, index)]}
                </span>
                <div className={styles.tooltipApprovers}>
                  {round.approvers.map((approver) => (
                    <div key={approver.id}>
                      <strong>{roleLabelMap.get(approver.role) ?? approver.role}</strong>
                      <span>{approver.rule.toUpperCase()}</span>
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

  return (
    <div className={`${styles.wrapper} ${compact ? styles.wrapperCompact : ''}`}>
      <div className={`${styles.track} ${compact ? styles.trackCompact : ''}`}>
        {initiativeStageKeys.map((key, index) => {
          const status = index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'upcoming';
          const state = stageState[key] ?? { status: 'draft' };
          const stage = stages[key];
          const nextStage = initiativeStageKeys[index + 1];
          const displayName = stage.name || 'Not started';
          const stageClassNames = [
            styles.stage,
            styles.chevron,
            styles[status],
            selectedStage === key ? styles.selected : '',
            styles[`stage-${state.status}`]
          ]
            .filter(Boolean)
            .join(' ');
          const stageAnchor = createCommentAnchor(`stage-track.${key}`, `${key.toUpperCase()} stage`);
          return (
            <div key={key} className={styles.trackItem}>
              <button type="button" className={stageClassNames} onClick={() => onSelectStage(key)} {...stageAnchor}>
                <span className={styles.stageLabel}>{key.toUpperCase()}</span>
                <span className={styles.stageName}>{displayName}</span>
                <span className={styles.stageStatus}>{stageStatusLabel(state.status)}</span>
              </button>
              {nextStage && isGateKey(nextStage) && (
                <div
                  className={styles.gateWrapper}
                  onMouseEnter={(event) => handleGateMouseEnter(nextStage, event)}
                  onMouseMove={handleGateMouseMove}
                  onMouseLeave={handleGateMouseLeave}
                >
                  <button
                    type="button"
                    className={[styles.gate, styles.chevron, styles[`gate-${(stageState[nextStage]?.status ?? 'draft')}`]].join(' ')}
                    {...createCommentAnchor(`stage-track.${nextStage}`, `${nextStage.toUpperCase()} gate`)}
                  >
                    <span className={styles.gateName}>{nextStage.toUpperCase()}</span>
                    <span className={styles.gateLabel}>Gate</span>
                    <span className={styles.gateStatus}>{stageStatusLabel(stageState[nextStage]?.status)}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {renderGateTooltip()}
    </div>
  );
};
