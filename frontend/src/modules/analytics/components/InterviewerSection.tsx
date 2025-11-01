import { useMemo, useState } from 'react';
import styles from '../../../styles/AnalyticsScreen.module.css';
import type { InterviewerPeriod, InterviewerStatsResponse } from '../types/analytics';
import type { InterviewerSeniority } from '../../../shared/types/account';
import { buildInterviewerTotals } from '../utils/interviewerTotals';
import { InterviewerFilters } from './InterviewerFilters';

const INTERVIEWER_PERIOD_LABELS: Record<InterviewerPeriod, string> = {
  last_month: 'Last month',
  rolling_3: 'Trailing 3 months',
  fytd: 'Financial year to date',
  rolling_12: 'Trailing 12 months'
};

const INTERVIEWER_PERIOD_ORDER: InterviewerPeriod[] = ['last_month', 'rolling_3', 'fytd', 'rolling_12'];

interface InterviewerSectionProps {
  period: InterviewerPeriod;
  onPeriodChange: (value: InterviewerPeriod) => void;
  selectedInterviewers: string[];
  onInterviewerChange: (ids: string[]) => void;
  selectedRoles: InterviewerSeniority[];
  onRoleChange: (roles: InterviewerSeniority[]) => void;
  data: InterviewerStatsResponse | null;
  loading: boolean;
  error: string | null;
  onDownload: () => void;
}

const formatScore = (sum: number, count: number) => {
  if (!count) {
    return '—';
  }
  return (sum / count).toFixed(2);
};

const formatPercent = (numerator: number, denominator: number) => {
  if (!denominator) {
    return '—';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

export const InterviewerSection = ({
  period,
  onPeriodChange,
  selectedInterviewers,
  onInterviewerChange,
  selectedRoles,
  onRoleChange,
  data,
  loading,
  error,
  onDownload
}: InterviewerSectionProps) => {
  const totals = useMemo(() => buildInterviewerTotals(data), [data]);
  const maxInterviews = totals.length ? Math.max(...totals.map((item) => item.interviewCount)) : 0;
  const topRows = totals.slice(0, 8);
  const MAX_SCORE = 5;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sectionClassName = filtersOpen
    ? `${styles.sectionCard} ${styles.sectionCardRaised}`
    : styles.sectionCard;

  return (
    <section className={sectionClassName}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Interviewer insights</h2>
          <p className={styles.metricDetails}>{INTERVIEWER_PERIOD_LABELS[period]}</p>
        </div>
        <div className={styles.sectionActions}>
          <div className={styles.toggleGroup}>
            {INTERVIEWER_PERIOD_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.toggleButton} ${period === option ? styles.toggleButtonActive : ''}`}
                onClick={() => onPeriodChange(option)}
              >
                {INTERVIEWER_PERIOD_LABELS[option]}
              </button>
            ))}
          </div>
          <button type="button" className={styles.actionButton} onClick={onDownload}>
            Download CSV
          </button>
        </div>
      </header>

      <InterviewerFilters
        interviewers={data?.interviewers ?? []}
        selectedInterviewers={selectedInterviewers}
        onInterviewerChange={onInterviewerChange}
        selectedRoles={selectedRoles}
        onRoleChange={onRoleChange}
        disabled={loading}
        onDropdownOpenChange={setFiltersOpen}
      />

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {loading ? <div className={styles.loadingLabel}>Loading interviewer statistics…</div> : null}

      {!loading && !error ? (
        totals.length ? (
          <div className={styles.interviewerMatrix}>
            <div className={styles.interviewerMatrixHeader}>
              <span>Interviewer</span>
              <span>Interviews</span>
              <span>Hire vs reject</span>
              <span>Average case score</span>
              <span>Average fit score</span>
            </div>
            {topRows.map((item) => {
              const width = maxInterviews ? Math.max((item.interviewCount / maxInterviews) * 100, 4) : 0;
              const decisions = item.hire + item.reject;
              const hireShare = decisions ? (item.hire / decisions) * 100 : 0;
              const rejectShare = decisions ? (item.reject / decisions) * 100 : 0;
              const caseAvg = item.caseScoreCount ? item.caseScoreSum / item.caseScoreCount : null;
              const caseWidth = caseAvg ? (caseAvg / MAX_SCORE) * 100 : 0;
              const fitAvg = item.fitScoreCount ? item.fitScoreSum / item.fitScoreCount : null;
              const fitWidth = fitAvg ? (fitAvg / MAX_SCORE) * 100 : 0;
              return (
                <div key={item.id} className={styles.interviewerMatrixRow}>
                  <div className={styles.matrixLabelCell}>
                    <span className={styles.matrixName}>{item.name}</span>
                    {item.role ? <span className={styles.roleBadge}>{item.role}</span> : null}
                  </div>
                  <div className={styles.matrixCell}>
                    <div className={styles.barTrack}>
                      <div className={styles.barValue} style={{ width: `${width}%` }} />
                    </div>
                    <span className={styles.matrixValue}>{item.interviewCount}</span>
                  </div>
                  <div className={styles.matrixCell}>
                    <div className={styles.miniStackedBar}>
                      <div className={styles.miniStackedHire} style={{ width: `${hireShare}%` }} />
                      <div className={styles.miniStackedReject} style={{ width: `${rejectShare}%` }} />
                    </div>
                    <span className={styles.matrixValue}>{formatPercent(item.hire, decisions)}</span>
                  </div>
                  <div className={styles.matrixCell}>
                    <div className={styles.miniBarTrack}>
                      <div className={styles.miniCaseBar} style={{ width: `${caseWidth}%` }} />
                    </div>
                    <span className={styles.matrixValue}>{caseAvg ? caseAvg.toFixed(2) : '—'}</span>
                  </div>
                  <div className={styles.matrixCell}>
                    <div className={styles.miniBarTrack}>
                      <div className={styles.miniFitBar} style={{ width: `${fitWidth}%` }} />
                    </div>
                    <span className={styles.matrixValue}>{fitAvg ? fitAvg.toFixed(2) : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.timelineEmpty}>No data for the selected parameters.</div>
        )
      ) : null}
    </section>
  );
};
