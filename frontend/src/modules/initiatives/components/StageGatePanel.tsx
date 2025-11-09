import { useMemo, useState, useCallback } from 'react';
import type { MouseEvent } from 'react';
import styles from '../../../styles/StageGatePanel.module.css';
import { InitiativeStageKey, InitiativeStageMap, initiativeStageKeys, InitiativeStageStateMap } from '../../../shared/types/initiative';
import {
  defaultWorkstreamRoleOptions,
  Workstream,
  WorkstreamGateKey,
  workstreamGateKeys
} from '../../../shared/types/workstream';

interface StageGatePanelProps {
  stages: InitiativeStageMap;
  stageState: InitiativeStageStateMap;
  activeStage: InitiativeStageKey;
  selectedStage: InitiativeStageKey;
  onSelectStage: (stage: InitiativeStageKey) => void;
  workstream: Workstream | null;
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
  workstream
}: StageGatePanelProps) => {
  const activeIndex = initiativeStageKeys.indexOf(activeStage);
  const [hoveredGate, setHoveredGate] = useState<WorkstreamGateKey | null>(null);
  const roleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    defaultWorkstreamRoleOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, []);

  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((event: MouseEvent<HTMLElement>) => {
    setTooltipPos({ x: event.clientX + 12, y: event.clientY + 16 });
  }, []);

  const renderGate = (gateKey: WorkstreamGateKey) => {
    const gateState = stageState[gateKey];
    const stateClass = styles[`gate-${gateState?.status ?? 'draft'}`] ?? '';
    const rounds = workstream?.gates[gateKey] ?? [];
    const gateClasses = [styles.gate, styles.chevron, stateClass].filter(Boolean).join(' ');
    return (
      <div
        key={`${gateKey}-connector`}
        className={styles.gateWrapper}
        onMouseEnter={(event) => {
          setHoveredGate(gateKey);
          handleMouseMove(event);
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHoveredGate((prev) => (prev === gateKey ? null : prev));
          setTooltipPos(null);
        }}
      >
        <button type="button" className={gateClasses}>
          <span className={styles.gateName}>{gateKey.toUpperCase()}</span>
          <span className={styles.gateLabel}>Gate</span>
          <span className={styles.gateStatus}>
            {rounds.length > 0 ? stageStatusLabel(gateState?.status) : 'Not set'}
          </span>
        </button>
        {hoveredGate === gateKey && tooltipPos && (
          <div className={styles.gateTooltip} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            <p>
              <strong>{gateKey.toUpperCase()} gate</strong> · {stageStatusLabel(gateState?.status)}
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
        )}
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
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
          return (
            <div key={key} className={styles.trackItem}>
              <button
                type="button"
                className={stageClassNames}
                onClick={() => onSelectStage(key)}
              >
                <span className={styles.stageLabel}>{key.toUpperCase()}</span>
                <span className={styles.stageName}>{displayName}</span>
                <span className={styles.stageStatus}>{stageStatusLabel(state.status)}</span>
              </button>
              {nextStage && isGateKey(nextStage) && renderGate(nextStage)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
