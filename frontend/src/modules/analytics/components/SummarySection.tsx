import styles from '../../../styles/AnalyticsScreen.module.css';
import type { SummaryPeriod, SummaryResponse } from '../types/analytics';

const PERIOD_LABELS: Record<SummaryPeriod, string> = {
  rolling_3: 'Trailing 3-month average',
  fytd: 'Financial year to date',
  rolling_12: 'Trailing 12-month average'
};

interface SummarySectionProps {
  period: SummaryPeriod;
  onPeriodChange: (value: SummaryPeriod) => void;
  data: SummaryResponse | null;
  loading: boolean;
  error: string | null;
  onDownload: () => void;
}

const PERIOD_ORDER: SummaryPeriod[] = ['rolling_3', 'fytd', 'rolling_12'];

const formatPercent = (value: number | null) => {
  if (value == null) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDetails = (numerator: number, denominator: number) => {
  if (!denominator) {
    return 'Not enough data';
  }
  return `${numerator} of ${denominator}`;
};

export const SummarySection = ({
  period,
  onPeriodChange,
  data,
  loading,
  error,
  onDownload
}: SummarySectionProps) => {
  const metrics = data?.metrics;

  return (
    <section className={styles.sectionCard}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Funnel overview</h2>
          <p className={styles.metricDetails}>{PERIOD_LABELS[period]}</p>
        </div>
        <div className={styles.sectionActions}>
          <div className={styles.toggleGroup}>
            {PERIOD_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.toggleButton} ${period === option ? styles.toggleButtonActive : ''}`}
                onClick={() => onPeriodChange(option)}
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <button type="button" className={styles.actionButton} onClick={onDownload}>
            Download CSV
          </button>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {loading ? <div className={styles.loadingLabel}>Loading metrics…</div> : null}

      {!loading && !error && metrics ? (
        <div className={styles.cardsGrid}>
          <article className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Share of female candidates</h3>
            <div className={styles.metricValue}>{formatPercent(metrics.femaleShare.value)}</div>
            <div className={styles.metricDetails}>
              {formatDetails(metrics.femaleShare.numerator, metrics.femaleShare.denominator)}
            </div>
          </article>
          <article className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Offer acceptance rate</h3>
            <div className={styles.metricValue}>{formatPercent(metrics.offerAcceptance.value)}</div>
            <div className={styles.metricDetails}>
              {formatDetails(metrics.offerAcceptance.numerator, metrics.offerAcceptance.denominator)}
            </div>
          </article>
          <article className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Cross-offer acceptance rate</h3>
            <div className={styles.metricValue}>{formatPercent(metrics.crossOfferAcceptance.value)}</div>
            <div className={styles.metricDetails}>
              {formatDetails(
                metrics.crossOfferAcceptance.numerator,
                metrics.crossOfferAcceptance.denominator
              )}
            </div>
          </article>
          <article className={styles.metricCard}>
            <h3 className={styles.metricTitle}>Offer rate</h3>
            <div className={styles.metricValue}>{formatPercent(metrics.offerRate.value)}</div>
            <div className={styles.metricDetails}>
              {formatDetails(metrics.offerRate.numerator, metrics.offerRate.denominator)}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
};
