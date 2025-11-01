import styles from '../../../styles/EvaluationScreen.module.css';

interface AverageScoreBarProps {
  value: number | null;
  variant: 'fit' | 'case';
}

const MAX_SCORE = 5;

export const AverageScoreBar = ({ value, variant }: AverageScoreBarProps) => {
  if (value == null || Number.isNaN(value)) {
    return (
      <div className={styles.scoreBar}>
        <span className={styles.scorePlaceholder}>—</span>
      </div>
    );
  }

  const clamped = Math.min(Math.max(value, 0), MAX_SCORE);
  const width = Math.min(Math.max((clamped / MAX_SCORE) * 100, 0), 100);
  const barClass = variant === 'fit' ? styles.scoreFillFit : styles.scoreFillCase;

  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreTrack} aria-hidden>
        <div className={`${styles.scoreFill} ${barClass}`} style={{ width: `${width}%` }} />
      </div>
      <span className={styles.scoreValue}>{clamped.toFixed(2)}</span>
    </div>
  );
};
