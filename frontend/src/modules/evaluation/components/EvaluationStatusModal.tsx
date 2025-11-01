import { Fragment, useMemo } from 'react';
import type { CSSProperties } from 'react';
import styles from '../../../styles/EvaluationStatusModal.module.css';
import { EvaluationConfig, OfferRecommendationValue } from '../../../shared/types/evaluation';
import { FitQuestion } from '../../../shared/types/fitQuestion';
import { CaseFolder } from '../../../shared/types/caseLibrary';
import { CaseCriterion } from '../../../shared/types/caseCriteria';
import { formatDate } from '../../../shared/utils/date';

interface EvaluationStatusModalProps {
  evaluation: EvaluationConfig;
  candidateName: string;
  candidatePosition: string;
  roundLabel: string;
  fitQuestions: FitQuestion[];
  caseCriteria: CaseCriterion[];
  caseFolders: CaseFolder[];
  onClose: () => void;
}

const formatScore = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? (Math.round(value * 10) / 10).toFixed(1)
    : '—';

const OFFER_LABELS: Record<OfferRecommendationValue, string> = {
  yes_priority: 'Yes, priority',
  yes_strong: 'Yes, meets high bar',
  yes_keep_warm: 'Turndown, stay in contact',
  no_offer: 'Turndown'
};

type SummaryCellTone = 'success' | 'warning';

interface SummaryCellDetail {
  label: string;
  text: string;
}

type SummaryTableCellEmphasis = 'default' | 'note';

interface SummaryTableCell {
  primary?: string;
  secondary?: string | null;
  tone?: SummaryCellTone;
  details?: SummaryCellDetail[];
  emphasis?: SummaryTableCellEmphasis;
  muted?: boolean;
}

interface SummaryTableRowData {
  label: string;
  cells: SummaryTableCell[];
}

interface SummaryTableSection {
  title: string;
  rows: SummaryTableRowData[];
}

interface InterviewerColumn {
  id: string;
  label: string;
  form?: EvaluationConfig['forms'][number];
}

const CRITERIA_COLUMN_WIDTH = 260;

const buildCriteriaTitleMap = (
  fitQuestions: FitQuestion[],
  caseCriteria: CaseCriterion[],
  caseFolders: CaseFolder[]
) => {
  const fitMap = new Map<string, string>();
  for (const question of fitQuestions) {
    for (const criterion of question.criteria) {
      fitMap.set(criterion.id, criterion.title);
    }
  }

  const caseMap = new Map<string, string>();
  for (const criterion of caseCriteria) {
    caseMap.set(criterion.id, criterion.title);
  }
  for (const folder of caseFolders) {
    for (const criterion of folder.evaluationCriteria) {
      caseMap.set(criterion.id, criterion.title);
    }
  }

  return { fitMap, caseMap };
};

const computeAverageScore = (values: Array<number | undefined | null>) => {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!numeric.length) {
    return null;
  }
  const total = numeric.reduce((sum, current) => sum + current, 0);
  return Math.round((total / numeric.length) * 10) / 10;
};

const formatProcessStatus = (status: EvaluationConfig['processStatus']) => {
  if (status === 'in-progress') {
    return 'In progress';
  }
  if (status === 'completed') {
    return 'Completed';
  }
  return 'Draft';
};

const buildInterviewerColumns = (evaluation: EvaluationConfig): InterviewerColumn[] => {
  const columns: InterviewerColumn[] = evaluation.interviews.map((slot) => {
    const trimmedName = slot.interviewerName.trim();
    const form = evaluation.forms.find((item) => item.slotId === slot.id);
    return {
      id: slot.id,
      label: trimmedName.length > 0 ? trimmedName : 'Interviewer',
      form
    };
  });

  const knownIds = new Set(columns.map((column) => column.id));
  evaluation.forms.forEach((form, index) => {
    if (!knownIds.has(form.slotId)) {
      const fallbackName = form.interviewerName?.trim();
      columns.push({
        id: `detached-${index}-${form.slotId}`,
        label: fallbackName && fallbackName.length > 0 ? fallbackName : 'Interviewer',
        form
      });
    }
  });

  return columns;
};

const buildGeneralRows = (columns: InterviewerColumn[]): SummaryTableRowData[] => {
  const statusRow: SummaryTableRowData = {
    label: 'Status',
    cells: columns.map((column) => {
      const submitted = column.form?.submitted ?? false;
      return {
        primary: submitted ? 'Complete' : 'Pending',
        secondary: submitted
          ? column.form?.submittedAt
            ? `Submitted ${formatDate(column.form.submittedAt, '')}`
            : null
          : 'Awaiting submission',
        tone: submitted ? 'success' : 'warning'
      };
    })
  };

  const fitScoreRow: SummaryTableRowData = {
    label: 'Fit score',
    cells: columns.map((column) => ({ primary: formatScore(column.form?.fitScore) }))
  };

  const caseScoreRow: SummaryTableRowData = {
    label: 'Case score',
    cells: columns.map((column) => ({ primary: formatScore(column.form?.caseScore) }))
  };

  const offerRow: SummaryTableRowData = {
    label: 'Offer decision',
    cells: columns.map((column) => ({
      primary: column.form?.offerRecommendation
        ? OFFER_LABELS[column.form.offerRecommendation]
        : '—'
    }))
  };

  return [statusRow, fitScoreRow, caseScoreRow, offerRow];
};

const COMMENT_DESCRIPTORS: Array<{
  id: string;
  label: string;
  extract: (form: EvaluationConfig['forms'][number] | undefined) => string | undefined | null;
}> = [
  {
    id: 'fit-notes',
    label: 'Fit notes',
    extract: (form) => form?.fitNotes
  },
  {
    id: 'case-notes',
    label: 'Case notes',
    extract: (form) => form?.caseNotes
  },
  {
    id: 'interest-notes',
    label: 'Interest level notes',
    extract: (form) => form?.interestNotes
  },
  {
    id: 'issues-next-interview',
    label: 'Issues to test next',
    extract: (form) => form?.issuesToTest
  },
  {
    id: 'general-notes',
    label: 'General notes',
    extract: (form) => form?.notes
  }
];

const buildCommentRows = (columns: InterviewerColumn[]): SummaryTableRowData[] => {
  const rows: SummaryTableRowData[] = [];

  COMMENT_DESCRIPTORS.forEach((descriptor) => {
    const cells = columns.map((column) => {
      const raw = descriptor.extract(column.form);
      const text = raw?.trim();
      if (text && text.length > 0) {
        return { primary: text, emphasis: 'note' } satisfies SummaryTableCell;
      }
      return { primary: '—', emphasis: 'note', muted: true } satisfies SummaryTableCell;
    });

    const hasContent = cells.some((cell) => cell.primary && cell.primary !== '—');
    if (hasContent) {
      rows.push({ label: descriptor.label, cells });
    }
  });

  return rows;
};

const buildCriteriaRows = (
  columns: InterviewerColumn[],
  getCriteria: (form: EvaluationConfig['forms'][number] | undefined) =>
    | EvaluationConfig['forms'][number]['fitCriteria']
    | EvaluationConfig['forms'][number]['caseCriteria'],
  titleMap: Map<string, string>,
  fallbackTitle: string
): SummaryTableRowData[] => {
  const rows = new Map<string, SummaryTableRowData>();
  const columnIndex = new Map(columns.map((column, index) => [column.id, index]));

  columns.forEach((column) => {
    const criteria = getCriteria(column.form) ?? [];
    criteria.forEach((criterion) => {
      const label = titleMap.get(criterion.criterionId) ?? fallbackTitle;
      if (!rows.has(label)) {
        rows.set(label, {
          label,
          cells: columns.map(() => ({ primary: '—' }))
        });
      }
      const targetRow = rows.get(label);
      if (targetRow) {
        const idx = columnIndex.get(column.id);
        if (idx != null) {
          const currentCell = targetRow.cells[idx];
          if (!currentCell || currentCell.primary === '—') {
            const primaryValue = criterion.notApplicable ? 'N/A' : formatScore(criterion.score);
            targetRow.cells[idx] = {
              primary: primaryValue
            };
          }
        }
      }
    });
  });

  return Array.from(rows.values());
};

export const EvaluationStatusModal = ({
  evaluation,
  candidateName,
  candidatePosition,
  roundLabel,
  fitQuestions,
  caseCriteria,
  caseFolders,
  onClose
}: EvaluationStatusModalProps) => {
  const submittedForms = evaluation.forms.filter((form) => form.submitted);
  const avgFitScore = computeAverageScore(submittedForms.map((form) => form.fitScore));
  const avgCaseScore = computeAverageScore(submittedForms.map((form) => form.caseScore));
  const formsPlanned = evaluation.interviews.length || evaluation.interviewCount;
  const { fitMap, caseMap } = buildCriteriaTitleMap(fitQuestions, caseCriteria, caseFolders);
  const interviewerColumns = buildInterviewerColumns(evaluation);

  const summarySections: SummaryTableSection[] = [];
  if (interviewerColumns.length > 0) {
    summarySections.push({ title: 'Overall summary', rows: buildGeneralRows(interviewerColumns) });

    const fitCriteriaRows = buildCriteriaRows(
      interviewerColumns,
      (form) => form?.fitCriteria,
      fitMap,
      'Fit criterion'
    );
    if (fitCriteriaRows.length > 0) {
      summarySections.push({ title: 'Fit criteria', rows: fitCriteriaRows });
    }

    const caseCriteriaRows = buildCriteriaRows(
      interviewerColumns,
      (form) => form?.caseCriteria,
      caseMap,
      'Case criterion'
    );
    if (caseCriteriaRows.length > 0) {
      summarySections.push({ title: 'Case criteria', rows: caseCriteriaRows });
    }

    const commentRows = buildCommentRows(interviewerColumns);
    if (commentRows.length > 0) {
      summarySections.push({ title: 'Interviewer comments', rows: commentRows });
    }
  }

  const tableStyle = useMemo<CSSProperties | undefined>(() => {
    if (interviewerColumns.length === 0) {
      return undefined;
    }
    return {
      '--interviewer-column-width': `calc((100% - ${CRITERIA_COLUMN_WIDTH}px) / ${interviewerColumns.length})`,
      '--criteria-column-width': `${CRITERIA_COLUMN_WIDTH}px`
    } as CSSProperties;
  }, [interviewerColumns.length]);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <header className={styles.header}>
          <h2>Evaluation form status</h2>
          <button className={styles.closeButton} onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className={styles.content}>
          <div className={styles.summaryHeader}>
            <div className={styles.summaryDetails}>
              <h3>{candidateName}</h3>
              <p>{candidatePosition}</p>
              <p>{roundLabel}</p>
            </div>
            <div className={styles.summaryMetrics}>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Forms submitted</p>
                <p className={styles.metricValue}>
                  {submittedForms.length}/{formsPlanned}
                </p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Avg fit score</p>
                <p className={styles.metricValue}>{formatScore(avgFitScore)}</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Avg case score</p>
                <p className={styles.metricValue}>{formatScore(avgCaseScore)}</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricLabel}>Process status</p>
                <p className={styles.metricValue}>{formatProcessStatus(evaluation.processStatus)}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className={styles.sectionTitle}>Interviewer feedback</h3>
            <p className={styles.sectionSubtitle}>
              Review detailed scores, notes and offer recommendations for every interviewer.
            </p>
            {summarySections.length > 0 ? (
              <div className={styles.summaryTableSection}>
                <div className={styles.summaryTableWrapper}>
                  <table className={styles.summaryTable} style={tableStyle}>
                    <colgroup>
                      <col className={styles.summaryTableCriteriaColumn} />
                      {interviewerColumns.map((column) => (
                        <col key={`${column.id}-col`} className={styles.summaryTableColumn} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Criteria</th>
                        {interviewerColumns.map((column) => (
                          <th scope="col" key={column.id} className={styles.summaryTableColumn}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summarySections.map((section) => (
                        <Fragment key={section.title}>
                          <tr className={styles.summaryTableGroupRow}>
                            <td colSpan={interviewerColumns.length + 1}>{section.title}</td>
                          </tr>
                          {section.rows.map((row) => (
                            <tr key={row.label}>
                              <th scope="row">{row.label}</th>
                              {row.cells.map((cell, index) => (
                                <td
                                  key={`${section.title}-${row.label}-${interviewerColumns[index].id}`}
                                  className={styles.summaryTableColumn}
                                >
                                  <div className={styles.summaryTableCell}>
                                    {cell.tone ? (
                                      <span
                                        className={
                                          cell.tone === 'success'
                                            ? styles.statusBadgeSuccess
                                            : styles.statusBadgePending
                                        }
                                      >
                                        {cell.primary}
                                      </span>
                                    ) : (
                                      cell.primary && (
                                        <span
                                          className={
                                            `${
                                              cell.emphasis === 'note'
                                                ? styles.summaryTablePrimaryNote
                                                : styles.summaryTablePrimary
                                            } ${cell.muted ? styles.summaryTablePrimaryMuted : ''}`.trim()
                                          }
                                        >
                                          {cell.primary}
                                        </span>
                                      )
                                    )}
                                    {cell.details && (
                                      <div className={styles.summaryTableDetails}>
                                        {cell.details.map((detail) => (
                                          <span
                                            key={`${detail.label}-${detail.text}`}
                                            className={styles.summaryTableDetail}
                                          >
                                            <strong>{detail.label}:</strong> {detail.text}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {cell.secondary && (
                                      <span className={styles.summaryTableSecondary}>{cell.secondary}</span>
                                    )}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className={styles.emptyState}>No interviewer feedback has been recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
