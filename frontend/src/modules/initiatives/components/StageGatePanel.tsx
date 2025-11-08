import styles from '../../../styles/StageGatePanel.module.css';
import { InitiativeStageKey, InitiativeStageMap, initiativeStageKeys, initiativeStageLabels } from '../../../shared/types/initiative';

interface StageGatePanelProps {
  stages: InitiativeStageMap;
  activeStage: InitiativeStageKey;
  selectedStage: InitiativeStageKey;
  onSelectStage: (stage: InitiativeStageKey) => void;
}

export const StageGatePanel = ({ stages, activeStage, selectedStage, onSelectStage }: StageGatePanelProps) => {
  const activeIndex = initiativeStageKeys.indexOf(activeStage);

  return (
    <div className={styles.panel}>
      {initiativeStageKeys.map((key, index) => {
        const status = index < activeIndex ? 'complete' : index === activeIndex ? 'current' : 'upcoming';
        const stage = stages[key];
        return (
          <button
            key={key}
            type="button"
            className={[
              styles.stage,
              styles[status],
              selectedStage === key ? styles.selected : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onSelectStage(key)}
          >
            <span className={styles.stageLabel}>{initiativeStageLabels[key]}</span>
            <span className={styles.stageName}>{stage.name || 'Not started'}</span>
          </button>
        );
      })}
    </div>
  );
};
