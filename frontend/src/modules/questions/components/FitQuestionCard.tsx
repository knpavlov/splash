import { FitQuestion } from '../../../shared/types/fitQuestion';
import styles from '../../../styles/FitQuestionCard.module.css';

interface FitQuestionCardProps {
  question: FitQuestion;
  onOpen: () => void;
}

export const FitQuestionCard = ({ question, onOpen }: FitQuestionCardProps) => {
  // Форматируем дату обновления для карточки
  const updatedAt = new Date(question.updatedAt);
  const formatted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(updatedAt);

  return (
    <button className={styles.card} onClick={onOpen}>
      <h3>{question.shortTitle}</h3>
      <p className={styles.updated}>Last update: {formatted}</p>
    </button>
  );
};
