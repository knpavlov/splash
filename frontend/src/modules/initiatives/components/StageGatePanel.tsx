import styles from '../../../styles/StageGatePanel.module.css';
import {
  InitiativeStageKey,
  InitiativeStageMap,
  initiativeStageKeys,
  initiativeStageLabels,
  InitiativeStageStateMap
} from '../../../shared/types/initiative';

interface StageGatePanelProps {
  stages: InitiativeStageMap;
  stageState: InitiativeStageStateMap;
  activeStage: InitiativeStageKey;
  selectedStage: InitiativeStageKey;
  onSelectStage: (stage: InitiativeStageKey) => void;
}

const stageStatusLabel = (status: InitiativeStageStateMap[InitiativeStageKey]['status']) => {
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

export const StageGatePanel = ({ stages, stageState, activeStage, selectedStage, onSelectStage }: StageGatePanelProps) => {
  const activeIndex = initiativeStageKeys.indexOf(activeStage);

  return (
    <div className={styles.panel}>
      {initiativeStageKeys.map((key, index) => {
        const status = index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'upcoming';
        const state = stageState[key] ?? { status: 'draft' };
        const stage = stages[key];
        return (
          <button
            key={key}
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
            <span className={styles.stageLabel}>{initiativeStageLabels[key]}</span>
            <span className={styles.stageName}>{stage.name || 'Not started'}</span>
            <span className={styles.stageStatus}>{stageStatusLabel(state.status)}</span>
          </button>
        );
      })}
    </div>
  );
};
