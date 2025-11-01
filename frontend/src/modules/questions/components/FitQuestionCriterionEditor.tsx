import { FitQuestionCriterion } from '../../../shared/types/fitQuestion';
import styles from '../../../styles/FitQuestionModal.module.css';

interface FitQuestionCriterionEditorProps {
  criterion: FitQuestionCriterion;
  onChange: (criterion: FitQuestionCriterion) => void;
  onRemove: () => void;
}

export const FitQuestionCriterionEditor = ({
  criterion,
  onChange,
  onRemove
}: FitQuestionCriterionEditorProps) => {
  // Обновляем название критерия с сохранением остального состояния
  const handleTitleChange = (value: string) => {
    onChange({ ...criterion, title: value });
  };

  // Обновляем описание конкретной оценки
  const handleRatingChange = (score: 1 | 2 | 3 | 4 | 5, value: string) => {
    const ratings = { ...criterion.ratings };
    const trimmed = value.trim();
    if (trimmed) {
      ratings[score] = value;
    } else {
      delete ratings[score];
    }
    onChange({ ...criterion, ratings });
  };

  return (
    <div className={styles.criterionBlock}>
      <div className={styles.criterionHeader}>
        <h4>Evaluation criterion</h4>
        <button className={styles.removeCriterionButton} onClick={onRemove}>
          Remove
        </button>
      </div>
      <label className={styles.fieldGroup}>
        <span>Criterion title</span>
        <input
          type="text"
          value={criterion.title}
          onChange={(event) => handleTitleChange(event.target.value)}
          placeholder="Enter criterion title"
        />
      </label>
      <div className={styles.ratingsTable}>
        {[1, 2, 3, 4, 5].map((score) => (
          <label key={score} className={styles.ratingRow}>
            <span className={styles.ratingLabel}>Score {score}</span>
            <textarea
              className={styles.ratingTextarea}
              value={criterion.ratings[score as 1 | 2 | 3 | 4 | 5] ?? ''}
              onChange={(event) => handleRatingChange(score as 1 | 2 | 3 | 4 | 5, event.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </label>
        ))}
      </div>
    </div>
  );
};
