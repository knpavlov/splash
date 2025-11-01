import styles from '../../../styles/OfferVotesBar.module.css';

export interface OfferVotesBreakdown {
  total: number;
  yesPriority: number;
  yesStrong: number;
  yesKeepWarm: number;
  noOffer: number;
}

type OfferSegmentKey = Exclude<keyof OfferVotesBreakdown, 'total'>;

const SEGMENTS: Array<{
  key: OfferSegmentKey;
  label: string;
  className: string;
}> = [
  { key: 'yesPriority', label: 'Yes, priority', className: styles.segmentYesPriority },
  { key: 'yesStrong', label: 'Yes, meets high bar', className: styles.segmentYesStrong },
  { key: 'yesKeepWarm', label: 'Turndown, stay in contact', className: styles.segmentYesKeepWarm },
  { key: 'noOffer', label: 'Turndown', className: styles.segmentNoOffer }
];

export const OfferVotesBar = ({ counts }: { counts: OfferVotesBreakdown }) => {
  const { total } = counts;

  if (!total || total <= 0) {
    return <span className={styles.emptyValue}>—</span>;
  }

  const parts = SEGMENTS.map(({ key, label, className }) => {
    const value = counts[key];
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    const showLabel = percentage >= 15;

    if (!value) {
      return null;
    }

    return (
      <div
        key={key}
        className={`${styles.segment} ${className}`}
        style={{ flexGrow: value }}
        title={`${label}: ${value}/${total} (${percentage}%)`}
        role="presentation"
      >
        {showLabel && <span className={styles.segmentLabel}>{percentage}%</span>}
      </div>
    );
  }).filter(Boolean);

  const ariaLabel = SEGMENTS.map(({ key, label }) => {
    const value = counts[key];
    if (!value) {
      return null;
    }
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    return `${label}: ${value} (${percentage}%)`;
  })
    .filter(Boolean)
    .join('; ');

  return (
    <div className={styles.wrapper} aria-label={`Offer votes — ${ariaLabel}`}>
      <div className={styles.bar} role="img">
        {parts.length > 0 ? parts : <div className={styles.segmentFallback} />}
      </div>
    </div>
  );
};
