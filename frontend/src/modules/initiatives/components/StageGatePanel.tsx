import { useMemo, useState } from 'react';
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
  const [expandedGate, setExpandedGate] = useState<WorkstreamGateKey | null>(null);
  const roleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    defaultWorkstreamRoleOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, []);

  const renderGate = (gateKey: WorkstreamGateKey) => {
    const gateState = stageState[gateKey];
    const stateClass = styles[`gate-${gateState?.status ?? 'draft'}`] ?? '';
    const isOpen = expandedGate === gateKey;
    const rounds = workstream?.gates[gateKey]?.length ?? 0;
    return (
      <button
        key={`${gateKey}-connector`}
        type="button"
        className={[styles.gate, stateClass, isOpen ? styles.gateOpen : ''].filter(Boolean).join(' ')}
        onClick={() => setExpandedGate((prev) => (prev === gateKey ? null : gateKey))}
      >
        <span className={styles.gateName}>{gateKey.toUpperCase()}</span>
        <span className={styles.gateLabel}>Gate</span>
        <span className={styles.gateStatus}>
          {rounds > 0 ? stageStatusLabel(gateState?.status) : 'Not configured'}
        </span>
      </button>
    );
  };

  const renderGateDetails = () => {
    if (!expandedGate) {
      return null;
    }
    const gateRounds = workstream?.gates[expandedGate] ?? [];
    const gateState = stageState[expandedGate];
    return (
      <div className={styles.gateDetails}>
        <div className={styles.gateDetailsHeader}>
          <div>
            <p>Gate</p>
            <h4>{`${expandedGate.toUpperCase()} gate`}</h4>
            <span className={[styles.statusBadge, styles[`stage-${gateState?.status ?? 'draft'}`]].join(' ')}>
              {stageStatusLabel(gateState?.status)}
            </span>
          </div>
          <button type="button" className={styles.closeDetails} onClick={() => setExpandedGate(null)}>
            Close
          </button>
        </div>
        {gateRounds.length === 0 ? (
          <p className={styles.gateDetailsEmpty}>No approval rounds configured for this gate.</p>
        ) : (
          <ol className={styles.roundList}>
            {gateRounds.map((round, index) => {
              const status = resolveRoundStatus(gateState, index);
              return (
                <li key={round.id} className={styles.roundItem}>
                  <div className={styles.roundHeader}>
                    <span className={styles.roundTitle}>Round {index + 1}</span>
                    <span className={[styles.roundStatus, styles[`round-${status}`]].join(' ')}>
                      {roundStatusLabel[status]}
                    </span>
                  </div>
                  {round.approvers.length === 0 ? (
                    <p className={styles.roundEmpty}>No approvers defined for this round.</p>
                  ) : (
                    <div className={styles.approverGrid}>
                      {round.approvers.map((approver) => (
                        <div key={approver.id} className={styles.approverCard}>
                          <span className={styles.approverRole}>
                            {roleLabelMap.get(approver.role) ?? approver.role}
                          </span>
                          <span className={styles.approverRule}>{approver.rule.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
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
          return (
            <div key={key} className={styles.trackItem}>
              <button
                type="button"
                className={[
                  styles.stage,
                  styles[status],
                  selectedStage === key ? styles.selected : '',
                  styles[`stage-${state.status}`]
                ]
                  .filter(Boolean)
                  .join(' ')}
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
      {renderGateDetails()}
    </div>
  );
};
