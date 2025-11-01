import { Fragment, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/InterviewerScreen.module.css';
import { useAuth } from '../auth/AuthContext';
import { interviewerApi } from './services/interviewerApi';
import {
  InterviewerAssignmentView,
  OfferRecommendationValue,
  EvaluationCriterionScore,
  InterviewStatusRecord
} from '../../shared/types/evaluation';
import { CaseFolder } from '../../shared/types/caseLibrary';
import { ApiError } from '../../shared/api/httpClient';
import { useCaseCriteriaState } from '../../app/state/AppStateContext';
import { formatDate } from '../../shared/utils/date';
import { composeFullName } from '../../shared/utils/personName';

interface Banner {
  type: 'info' | 'error';
  text: string;
}

type CriterionDefinition = {
  id: string;
  title: string;
  ratings: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
};

type CriterionScoreValue = '1' | '2' | '3' | '4' | '5' | 'n/a';

interface FormState {
  fitNotes: string;
  caseNotes: string;
  notes: string;
  interestNotes: string;
  issuesToTest: string;
  offerRecommendation: OfferRecommendationValue | '';
  fitCriteria: Record<string, string>;
  caseCriteria: Record<string, string>;
}

const normalizeCriterionKey = (value: string | undefined | null): string => {
  if (!value) {
    return '';
  }
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const scoreEntryToString = (entry: EvaluationCriterionScore | undefined): string | undefined => {
  if (!entry) {
    return undefined;
  }
  if (entry.notApplicable) {
    return 'n/a';
  }
  if (typeof entry.score === 'number' && Number.isFinite(entry.score)) {
    return String(entry.score);
  }
  return undefined;
};

const alignCriteriaValues = (
  definitions: CriterionDefinition[],
  recorded: EvaluationCriterionScore[] | undefined,
  currentMap: Record<string, string>
): Record<string, string> => {
  if (!definitions.length) {
    return currentMap;
  }

  const entries = (recorded ?? []).map((entry) => ({
    entry,
    value: scoreEntryToString(entry),
    key: entry.criterionId ?? '',
    normalizedKey: normalizeCriterionKey(entry.criterionId)
  }));

  const fallbackAliases = Object.entries(currentMap).map(([key, value]) => ({
    key,
    normalizedKey: normalizeCriterionKey(key),
    value
  }));

  const result: Record<string, string> = { ...currentMap };
  const usedIndexes = new Set<number>();
  const usedAliasIndexes = new Set<number>();

  const takeByPredicate = (predicate: (payload: typeof entries[number], index: number) => boolean) => {
    const index = entries.findIndex((payload, idx) => !usedIndexes.has(idx) && predicate(payload, idx));
    if (index === -1) {
      return undefined;
    }
    usedIndexes.add(index);
    return entries[index];
  };

  const takeNextUnused = () => {
    const index = entries.findIndex((_, idx) => !usedIndexes.has(idx));
    if (index === -1) {
      return undefined;
    }
    usedIndexes.add(index);
    return entries[index];
  };

  for (const criterion of definitions) {
    const desiredKeys = [
      criterion.id,
      normalizeCriterionKey(criterion.id),
      criterion.title,
      normalizeCriterionKey(criterion.title)
    ].filter(Boolean);

    const matched =
      takeByPredicate((payload) => desiredKeys.includes(payload.key) || desiredKeys.includes(payload.normalizedKey)) ??
      (() => {
        const aliasIndex = fallbackAliases.findIndex(
          (candidate, idx) =>
            !usedAliasIndexes.has(idx) &&
            (desiredKeys.includes(candidate.key) || desiredKeys.includes(candidate.normalizedKey))
        );
        if (aliasIndex === -1) {
          return undefined;
        }
        usedAliasIndexes.add(aliasIndex);
        const alias = fallbackAliases[aliasIndex];
        return { entry: undefined, value: alias.value, key: alias.key, normalizedKey: alias.normalizedKey };
      })() ??
      takeNextUnused();

    const resolvedValue = matched?.value;
    if (resolvedValue) {
      result[criterion.id] = resolvedValue;
      continue;
    }
    if (matched?.entry) {
      const fallbackValue = scoreEntryToString(matched.entry);
      if (fallbackValue) {
        result[criterion.id] = fallbackValue;
      }
    }
  }

  return result;
};

const buildDisplayState = (
  base: FormState,
  options: {
    fitDefinitions: CriterionDefinition[];
    caseDefinitions: CriterionDefinition[];
    fitEntries?: EvaluationCriterionScore[];
    caseEntries?: EvaluationCriterionScore[];
  }
): FormState => ({
  ...base,
  fitCriteria: alignCriteriaValues(options.fitDefinitions, options.fitEntries, base.fitCriteria),
  caseCriteria: alignCriteriaValues(options.caseDefinitions, options.caseEntries, base.caseCriteria)
});

interface CriterionSelectorProps {
  criterion: CriterionDefinition;
  value: string;
  disabled: boolean;
  highlightSelection: boolean;
  onChange: (next: CriterionScoreValue) => void;
}

const CriterionSelector = ({
  criterion,
  value,
  disabled,
  highlightSelection,
  onChange
}: CriterionSelectorProps) => {
  const numericScores = ['1', '2', '3', '4', '5'] as const;
  const ratingEntries: Array<{ score: CriterionScoreValue; description?: string }> = [
    ...numericScores.map((score) => ({
      score,
      description: criterion.ratings[Number(score) as 1 | 2 | 3 | 4 | 5]
    })),
    { score: 'n/a', description: 'Not applicable' }
  ];

  return (
    <div className={styles.criterionCard}>
      <div className={styles.criterionHeaderRow}>
        <span className={styles.criterionTitle}>{criterion.title}</span>
        <span className={styles.tooltipWrapper}>
          <span className={styles.tooltipIcon}>?</span>
          <span className={styles.tooltipContent}>
            {ratingEntries.map(({ score, description }) => (
              <Fragment key={score}>
                <strong>{score === 'n/a' ? 'N/A' : score}</strong>
                <span>{description ?? '—'}</span>
              </Fragment>
            ))}
          </span>
        </span>
      </div>
      <div className={styles.criterionScale}>
        {ratingEntries.map(({ score }) => (
          <label
            key={score}
            className={[
              styles.criterionOption,
              value === score ? styles.criterionOptionActive : '',
              disabled ? styles.criterionOptionDisabled : '',
              value === score && highlightSelection ? styles.criterionOptionSubmitted : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              type="radio"
              name={criterion.id}
              value={score}
              checked={value === score}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value as CriterionScoreValue)}
            />
            <span>{score === 'n/a' ? 'N/A' : score}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const createFormState = (form: InterviewStatusRecord | null | undefined): FormState => {
  if (!form) {
    return {
      fitNotes: '',
      caseNotes: '',
      notes: '',
      interestNotes: '',
      issuesToTest: '',
      offerRecommendation: '',
      fitCriteria: {},
      caseCriteria: {}
    };
  }
  const toCriteriaMap = (entries: EvaluationCriterionScore[] | undefined): Record<string, string> => {
    if (!entries) {
      return {};
    }
    const map: Record<string, string> = {};
    for (const item of entries) {
      if (item.criterionId) {
        if (item.notApplicable) {
          map[item.criterionId] = 'n/a';
        } else {
          map[item.criterionId] = item.score != null ? String(item.score) : '';
        }
      }
    }
    return map;
  };
  return {
    fitNotes: form.fitNotes ?? '',
    caseNotes: form.caseNotes ?? '',
    notes: form.notes ?? '',
    interestNotes: form.interestNotes ?? '',
    issuesToTest: form.issuesToTest ?? '',
    offerRecommendation: form.offerRecommendation ?? '',
    fitCriteria: toCriteriaMap(form.fitCriteria),
    caseCriteria: toCriteriaMap(form.caseCriteria)
  };
};

const OFFER_OPTIONS: Array<{ value: OfferRecommendationValue; label: string }> = [
  { value: 'yes_priority', label: 'Yes, priority' },
  { value: 'yes_strong', label: 'Yes, meets high bar' },
  { value: 'yes_keep_warm', label: 'Turndown, stay in contact' },
  { value: 'no_offer', label: 'Turndown' }
];

const computeAverageScore = (values: Record<string, string>): number | null => {
  const numericValues = Object.values(values)
    .map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value): value is number => value != null);
  if (!numericValues.length) {
    return null;
  }
  const sum = numericValues.reduce((total, current) => total + current, 0);
  return Math.round((sum / numericValues.length) * 10) / 10;
};

const formatScoreValue = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return (Math.round(value * 10) / 10).toFixed(1);
};

const formatOutcomeLabel = (decision: InterviewerAssignmentView['decision']): string => {
  switch (decision) {
    case 'offer':
    case 'accepted-offer':
      return 'Offer';
    case 'progress':
      return 'Progress to next round';
    case 'reject':
      return 'Reject';
    default:
      return 'Outcome pending';
  }
};

const isRatingComplete = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'n/a') {
    return true;
  }
  return ['1', '2', '3', '4', '5'].includes(normalized);
};

const areRatingsComplete = (criteria: CriterionDefinition[], values: Record<string, string>): boolean => {
  if (criteria.length === 0) {
    return true;
  }
  return criteria.every((criterion) => isRatingComplete(values[criterion.id]));
};

const CASE_CRITERIA_ORDER = [
  'Conceptual problem solving / Problem Structuring and Framing',
  'Analytical problem solving',
  'Qualitative problem solving',
  'Synthesis and recommendation'
];

const sortCaseCriteria = (criteria: CriterionDefinition[]): CriterionDefinition[] => {
  const orderMap = new Map(CASE_CRITERIA_ORDER.map((title, index) => [title.toLowerCase(), index]));
  return [...criteria].sort((a, b) => {
    const aIndex = orderMap.get(a.title.toLowerCase()) ?? CASE_CRITERIA_ORDER.length;
    const bIndex = orderMap.get(b.title.toLowerCase()) ?? CASE_CRITERIA_ORDER.length;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.title.localeCompare(b.title);
  });
};

const ARCHIVE_WINDOW_DAYS = 90;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const filterRecentAssignments = (
  items: InterviewerAssignmentView[]
): { active: InterviewerAssignmentView[]; archivedCount: number } => {
  const cutoff = Date.now() - ARCHIVE_WINDOW_DAYS * MILLIS_PER_DAY;
  const active: InterviewerAssignmentView[] = [];
  let archivedCount = 0;

  for (const item of items) {
    const timestamps = [
      item.evaluationUpdatedAt,
      item.form?.submittedAt ?? null,
      item.invitationSentAt ?? null
    ];
    let hasKnownTimestamp = false;
    let isRecent = false;

    for (const raw of timestamps) {
      if (!raw) {
        continue;
      }
      const parsed = Date.parse(raw);
      if (Number.isNaN(parsed)) {
        continue;
      }
      hasKnownTimestamp = true;
      if (parsed >= cutoff) {
        isRecent = true;
        break;
      }
    }

    if (isRecent || !hasKnownTimestamp) {
      active.push(item);
    } else {
      archivedCount += 1;
    }
  }

  return { active, archivedCount };
};

export const InterviewerScreen = () => {
  const { session } = useAuth();
  const { list: globalCaseCriteria } = useCaseCriteriaState();
  const [assignments, setAssignments] = useState<InterviewerAssignmentView[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formDrafts, setFormDrafts] = useState<Record<string, FormState>>({});
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [archivedCount, setArchivedCount] = useState(0);

  const selectedAssignment = useMemo(() => {
    if (!selectedSlot) {
      return null;
    }
    return assignments.find((item) => item.slotId === selectedSlot) ?? null;
  }, [assignments, selectedSlot]);

  const currentSlotId = selectedAssignment?.slotId ?? null;
  const ownFormSubmitted = selectedAssignment?.form?.submitted ?? false;

  useEffect(() => {
    setFormDrafts((prev) => {
      if (assignments.length === 0) {
        return {};
      }
      const next = { ...prev } as Record<string, FormState>;
      let changed = false;
      const validSlots = new Set(assignments.map((item) => item.slotId));
      for (const key of Object.keys(next)) {
        if (!validSlots.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      for (const assignment of assignments) {
        if (!next[assignment.slotId]) {
          next[assignment.slotId] = createFormState(assignment.form);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [assignments]);

  useEffect(() => {
    if (!selectedAssignment) {
      setActiveTab(null);
      return;
    }
    const ownSlot = selectedAssignment.slotId;
    const availableSlots = new Set([ownSlot, ...(selectedAssignment.peerForms ?? []).map((item) => item.slotId)]);
    setActiveTab((prev) => {
      if (!prev || !availableSlots.has(prev)) {
        return ownSlot;
      }
      if (prev === ownSlot) {
        return prev;
      }
      const peer = selectedAssignment.peerForms.find((item) => item.slotId === prev);
      if (!peer || !peer.submitted) {
        return ownSlot;
      }
      return prev;
    });
  }, [selectedAssignment]);

  const currentFormState = useMemo(() => {
    if (!currentSlotId || !selectedAssignment) {
      return createFormState(null);
    }
    return formDrafts[currentSlotId] ?? createFormState(selectedAssignment.form);
  }, [currentSlotId, selectedAssignment, formDrafts]);

  const updateCurrentFormState = (updater: (prev: FormState) => FormState) => {
    if (!currentSlotId || !selectedAssignment) {
      return;
    }
    setFormDrafts((prev) => {
      const existing = prev[currentSlotId] ?? createFormState(selectedAssignment.form);
      const updated = updater(existing);
      if (updated === existing) {
        return prev;
      }
      return { ...prev, [currentSlotId]: updated };
    });
  };

  const applyAssignmentUpdate = (items: InterviewerAssignmentView[]) => {
    const { active, archivedCount: archived } = filterRecentAssignments(items);
    setArchivedCount(archived);
    setAssignments(active);
    setSelectedSlot((current) => {
      if (active.length === 0) {
        return null;
      }
      if (current && active.some((item) => item.slotId === current)) {
        return current;
      }
      return active[0].slotId;
    });
  };

  useEffect(() => {
    if (!session?.email) {
      setAssignments([]);
      setSelectedSlot(null);
      setArchivedCount(0);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const items = await interviewerApi.listAssignments(session.email);
        applyAssignmentUpdate(items);
      } catch (error) {
        console.error('Failed to load interviewer assignments:', error);
        setBanner({ type: 'error', text: 'Assignments could not be loaded. Please refresh the page later.' });
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.email]);

  const refreshAssignments = async () => {
    if (!session?.email) {
      return;
    }
    try {
      const items = await interviewerApi.listAssignments(session.email);
      applyAssignmentUpdate(items);
    } catch (error) {
      console.error('Failed to reload assignments:', error);
    }
  };

  const buildCriteriaPayload = (values: Record<string, string>): EvaluationCriterionScore[] => {
    return Object.entries(values)
      .map(([criterionId, scoreValue]) => {
        if (!criterionId) {
          return null;
        }
        const trimmed = scoreValue.trim();
        if (!trimmed) {
          return { criterionId, score: undefined };
        }
        if (trimmed.toLowerCase() === 'n/a') {
          return { criterionId, score: undefined, notApplicable: true };
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed)
          ? ({ criterionId, score: parsed } as EvaluationCriterionScore)
          : { criterionId, score: undefined };
      })
      .filter((item): item is EvaluationCriterionScore => Boolean(item));
  };

  const persistForm = async ({ submitted }: { submitted: boolean }) => {
    if (!session?.email || !selectedAssignment) {
      return;
    }
    if (submitted && selectedAssignment.form?.submitted) {
      setBanner({ type: 'error', text: 'This evaluation has already been submitted.' });
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const computedFitScore = computeAverageScore(currentFormState.fitCriteria);
      const computedCaseScore = computeAverageScore(currentFormState.caseCriteria);
      const existingFitScore =
        typeof selectedAssignment.form?.fitScore === 'number' && Number.isFinite(selectedAssignment.form?.fitScore)
          ? selectedAssignment.form?.fitScore
          : undefined;
      const existingCaseScore =
        typeof selectedAssignment.form?.caseScore === 'number' && Number.isFinite(selectedAssignment.form?.caseScore)
          ? selectedAssignment.form?.caseScore
          : undefined;

      await interviewerApi.submitForm(selectedAssignment.evaluationId, selectedAssignment.slotId, {
        email: session.email,
        submitted,
        fitScore: computedFitScore ?? existingFitScore,
        caseScore: computedCaseScore ?? existingCaseScore,
        fitNotes: currentFormState.fitNotes.trim() || undefined,
        caseNotes: currentFormState.caseNotes.trim() || undefined,
        notes: currentFormState.notes.trim() || undefined,
        interestNotes: currentFormState.interestNotes.trim() || undefined,
        issuesToTest: currentFormState.issuesToTest.trim() || undefined,
        offerRecommendation: currentFormState.offerRecommendation || undefined,
        fitCriteria: buildCriteriaPayload(currentFormState.fitCriteria),
        caseCriteria: buildCriteriaPayload(currentFormState.caseCriteria)
      });
      const slotToReset = selectedAssignment.slotId;
      setFormDrafts((prev) => {
        if (!(slotToReset in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[slotToReset];
        return next;
      });
      await refreshAssignments();
      setBanner({
        type: 'info',
        text: submitted ? 'Evaluation submitted. Thank you for your feedback!' : 'Draft saved.'
      });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'access-denied') {
          setBanner({ type: 'error', text: 'You do not have access to this interview.' });
          return;
        }
        if (error.code === 'form-locked') {
          setBanner({ type: 'error', text: 'The evaluation is already locked and cannot be edited.' });
          return;
        }
      }
      console.error('Failed to submit interview form:', error);
      setBanner({ type: 'error', text: 'Could not save the form. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = () => {
    void persistForm({ submitted: false });
  };

  const handleSubmitFinal = () => {
    void persistForm({ submitted: true });
  };

  const renderList = () => {
    if (loading) {
      return <p>Loading assignments…</p>;
    }
    if (assignments.length === 0) {
      return (
        <div className={styles.emptyState}>
          <h2>No assignments yet</h2>
          <p>When an administrator assigns an interview to you, it will appear in this list.</p>
          {archivedCount > 0 ? (
            <p className={styles.placeholderText}>
              Assignments older than {ARCHIVE_WINDOW_DAYS} days are archived automatically.
            </p>
          ) : null}
        </div>
      );
    }
    const hasArchivedAssignments = archivedCount > 0;
    return (
      <ul className={styles.list}>
        {hasArchivedAssignments ? (
          <li key="archive-hint" className={styles.listHint}>
            Assignments older than {ARCHIVE_WINDOW_DAYS} days are archived.
          </li>
        ) : null}
        {assignments.map((assignment) => {
          const candidateName = assignment.candidate
            ? composeFullName(assignment.candidate.firstName, assignment.candidate.lastName) ||
              'Candidate not assigned'
            : 'Candidate not assigned';
          const submitted = assignment.form?.submitted ?? false;
          const statusLabel = submitted ? 'Completed' : 'Assigned';
          const roundLabel = `Round ${assignment.roundNumber}`;
          const outcomeLabel = formatOutcomeLabel(assignment.decision ?? null);
          return (
            <li
              key={assignment.slotId}
              className={`${styles.listItem} ${selectedSlot === assignment.slotId ? styles.listItemActive : ''}`}
              onClick={() => setSelectedSlot(assignment.slotId)}
            >
              <div className={styles.listItemTitle}>{candidateName}</div>
              <div className={styles.listItemMetaRow}>
                <span className={styles.roundBadge}>{roundLabel}</span>
                <span className={`${styles.statusPill} ${submitted ? styles.statusPillCompleted : styles.statusPillAssigned}`}>
                  {statusLabel}
                </span>
                <span className={styles.listItemMetaText}>Assigned {formatDate(assignment.invitationSentAt)}</span>
              </div>
              <div className={styles.listItemOutcomeRow}>
                <span className={styles.outcomeText}>Outcome: {outcomeLabel}</span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderFiles = (folder: CaseFolder | undefined) => {
    if (!folder || folder.files.length === 0) {
      return <p className={styles.placeholderText}>No case files are attached.</p>;
    }
    return (
      <div className={styles.files}>
        {folder.files.map((file) => (
          <a key={file.id} href={file.dataUrl} download={file.fileName} className={styles.fileLink}>
            {file.fileName}
          </a>
        ))}
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedAssignment) {
      return (
        <div className={styles.emptyState}>
          <h2>Select an interview</h2>
          <p>Use the list on the left to open candidate materials and share your feedback.</p>
        </div>
      );
    }
    const candidate = selectedAssignment.candidate;
    const candidateName = candidate
      ? composeFullName(candidate.firstName, candidate.lastName) || candidate.id
      : 'Candidate not assigned';
    const fitQuestion = selectedAssignment.fitQuestion;
    const fitCriteria: CriterionDefinition[] = fitQuestion?.criteria ?? [];
    const mergedCaseCriteriaMap = new Map<string, CriterionDefinition>();

    (selectedAssignment.caseFolder?.evaluationCriteria ?? []).forEach((criterion) => {
      mergedCaseCriteriaMap.set(criterion.id, criterion);
    });

    globalCaseCriteria.forEach((criterion) => {
      mergedCaseCriteriaMap.set(criterion.id, {
        id: criterion.id,
        title: criterion.title,
        ratings: criterion.ratings
      });
    });

    const caseCriteria = sortCaseCriteria(Array.from(mergedCaseCriteriaMap.values()));
    const resumeLink = candidate?.resume ? (
      <a className={styles.fileLink} href={candidate.resume.dataUrl} download={candidate.resume.fileName}>
        Download resume ({candidate.resume.fileName})
      </a>
    ) : (
      <p className={styles.placeholderText}>Resume is not available.</p>
    );
    const roundLabel = `Round ${selectedAssignment.roundNumber}`;
    const peerForms = selectedAssignment.peerForms ?? [];
    const ownSlotId = selectedAssignment.slotId;
    const ownTab = peerForms.find((item) => item.slotId === ownSlotId) ?? null;
    const otherTabs = peerForms.filter((item) => item.slotId !== ownSlotId);
    const tabItems: InterviewerAssignmentView['peerForms'] = [
      ownTab ?? {
        slotId: ownSlotId,
        interviewerName: selectedAssignment.interviewerName,
        interviewerEmail: selectedAssignment.interviewerEmail,
        submitted: ownFormSubmitted,
        form: selectedAssignment.form
      },
      ...otherTabs
    ].filter((item, index, array) => array.findIndex((entry) => entry.slotId === item.slotId) === index);
    const fallbackTabId = tabItems[0]?.slotId ?? ownSlotId;
    const requestedTabId = activeTab ?? fallbackTabId;
    const requestedRecord = tabItems.find((item) => item.slotId === requestedTabId);
    const isRequestedAllowed =
      requestedRecord && (requestedRecord.slotId === ownSlotId || requestedRecord.submitted);
    const activeTabId = isRequestedAllowed ? requestedTabId : fallbackTabId;
    const activeTabData = tabItems.find((item) => item.slotId === activeTabId) ?? tabItems[0];
    const isOwnTab = activeTabId === ownSlotId;
    const displayedFormRecord = activeTabData?.form ?? null;
    const baseFormState = isOwnTab ? currentFormState : createFormState(displayedFormRecord);
    const displayedFormState = buildDisplayState(baseFormState, {
      fitDefinitions: fitCriteria,
      caseDefinitions: caseCriteria,
      fitEntries: displayedFormRecord?.fitCriteria,
      caseEntries: displayedFormRecord?.caseCriteria
    });
    const isSubmitted = activeTabData?.submitted ?? false;
    const disableInputs = !isOwnTab || saving || ownFormSubmitted;
    const submittedAtLabel = displayedFormRecord?.submittedAt
      ? formatDate(displayedFormRecord.submittedAt)
      : null;
    const storedFitScore =
      displayedFormRecord &&
      typeof displayedFormRecord.fitScore === 'number' &&
      Number.isFinite(displayedFormRecord.fitScore)
        ? displayedFormRecord.fitScore
        : null;
    const storedCaseScore =
      displayedFormRecord &&
      typeof displayedFormRecord.caseScore === 'number' &&
      Number.isFinite(displayedFormRecord.caseScore)
        ? displayedFormRecord.caseScore
        : null;
    const calculatedFitScore = computeAverageScore(displayedFormState.fitCriteria);
    const calculatedCaseScore = computeAverageScore(displayedFormState.caseCriteria);
    const displayFitScore = calculatedFitScore ?? storedFitScore;
    const displayCaseScore = calculatedCaseScore ?? storedCaseScore;
    const targetOffice = candidate?.targetOffice?.trim();
    const targetRole = candidate?.desiredPosition?.trim();
    const targetPractice = candidate?.targetPractice?.trim();

    const ownFitRatingsComplete = areRatingsComplete(fitCriteria, currentFormState.fitCriteria);
    const ownCaseRatingsComplete = areRatingsComplete(caseCriteria, currentFormState.caseCriteria);
    const canSubmitFinal = isOwnTab && ownFitRatingsComplete && ownCaseRatingsComplete;

    return (
      <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div>
                <h2 className={styles.detailTitle}>{candidateName}</h2>
                <div className={styles.detailMeta}>
                  <span className={styles.roundBadge}>{roundLabel}</span>
                  {targetRole && <span className={styles.detailMetaItem}>Target role: {targetRole}</span>}
                  {targetOffice && <span className={styles.detailMetaItem}>Target office: {targetOffice}</span>}
                  {targetPractice && (
                    <span className={styles.detailMetaItem}>Practice: {targetPractice}</span>
                  )}
                </div>
              </div>
          <span
            className={`${styles.statusPill} ${isSubmitted ? styles.statusPillCompleted : styles.statusPillAssigned}`}
          >
            {isSubmitted ? 'Completed' : 'Assigned'}
          </span>
        </div>
        <div className={styles.tabBar} role="tablist" aria-label="Interviewer feedback tabs">
          {tabItems.map((tab) => {
            const tabIsOwn = tab.slotId === ownSlotId;
            const tabActive = tab.slotId === activeTabId;
            const tabDisabled = !tabIsOwn && !tab.submitted;
            const tabClass = [
              styles.tabButton,
              tabActive ? styles.tabButtonActive : '',
              tabDisabled ? styles.tabButtonDisabled : ''
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={tab.slotId}
                type="button"
                role="tab"
                className={tabClass}
                aria-selected={tabActive}
                aria-disabled={tabDisabled}
                onClick={() => {
                  if (tabDisabled) {
                    return;
                  }
                  setActiveTab(tab.slotId);
                }}
              >
                {tab.interviewerName}
              </button>
            );
          })}
        </div>
        {!isOwnTab && (
          <div className={styles.readOnlyNotice}>
            Viewing {activeTabData?.interviewerName}'s submitted evaluation. Editing is disabled.
          </div>
        )}
        <div className={styles.detailColumns}>
          <aside className={styles.infoColumn}>
            <div className={styles.infoCard}>
              <h3>Candidate materials</h3>
              {resumeLink}
            </div>
            <div className={styles.infoCard}>
              <h3>Fit question</h3>
              {fitQuestion ? (
                <>
                  <p className={styles.fitQuestionTitle}>{fitQuestion.shortTitle}</p>
                  <p className={styles.fitQuestionContent}>{fitQuestion.content}</p>
                </>
              ) : (
                <p className={styles.placeholderText}>Fit question is not assigned.</p>
              )}
            </div>
            <div className={styles.infoCard}>
              <h3>Case resources</h3>
              {renderFiles(selectedAssignment.caseFolder)}
            </div>
          </aside>
          <div className={styles.formColumn}>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!isOwnTab) {
                  return;
                }
                handleSaveDraft();
              }}
            >
              {isSubmitted && (
                <div className={styles.formNotice}>
                  This evaluation was submitted
                  {submittedAtLabel ? ` on ${submittedAtLabel}` : ''} and can no longer be edited.
                </div>
              )}

              <section className={styles.formSection}>
                <header className={styles.sectionHeader}>
                  <h3>Behavioural interview</h3>
                </header>
                {fitCriteria.length ? (
                  <div className={styles.criteriaGrid}>
                    {fitCriteria.map((criterion) => (
                      <CriterionSelector
                        key={criterion.id}
                        criterion={criterion}
                        value={displayedFormState.fitCriteria[criterion.id] ?? ''}
                        disabled={disableInputs}
                        highlightSelection={isSubmitted}
                        onChange={(next) => {
                          if (!isOwnTab) {
                            return;
                          }
                          updateCurrentFormState((prev) => ({
                            ...prev,
                            fitCriteria: { ...prev.fitCriteria, [criterion.id]: next }
                          }));
                        }}
                      />
                    ))}
                    <div className={`${styles.criterionCard} ${styles.criterionSummary}`}>
                      <div className={styles.criterionHeaderRow}>
                        <span className={styles.criterionTitle}>Overall behavioural score</span>
                      </div>
                      <div className={styles.summaryScore}>{formatScoreValue(displayFitScore)}</div>
                      <p className={styles.summaryHint}>Average of selected ratings</p>
                    </div>
                  </div>
                ) : (
                  <p className={styles.placeholderText}>No behavioural criteria are configured.</p>
                )}
                <div className={styles.formRow}>
                  <label htmlFor="fitNotes">Behavioural Questions Notes</label>
                  <textarea
                    id="fitNotes"
                    rows={4}
                    value={displayedFormState.fitNotes}
                    onChange={(event) => {
                      if (!isOwnTab) {
                        return;
                      }
                      const value = event.target.value;
                      updateCurrentFormState((prev) => ({ ...prev, fitNotes: value }));
                    }}
                    disabled={disableInputs}
                  />
                </div>
              </section>

              <section className={styles.formSection}>
                <header className={styles.sectionHeader}>
                  <h3>Case interview</h3>
                </header>
                {caseCriteria.length ? (
                  <div className={styles.criteriaGrid}>
                    {caseCriteria.map((criterion) => (
                      <CriterionSelector
                        key={criterion.id}
                        criterion={criterion}
                        value={displayedFormState.caseCriteria[criterion.id] ?? ''}
                        disabled={disableInputs}
                        highlightSelection={isSubmitted}
                        onChange={(next) => {
                          if (!isOwnTab) {
                            return;
                          }
                          updateCurrentFormState((prev) => ({
                            ...prev,
                            caseCriteria: { ...prev.caseCriteria, [criterion.id]: next }
                          }));
                        }}
                      />
                    ))}
                    <div className={`${styles.criterionCard} ${styles.criterionSummary}`}>
                      <div className={styles.criterionHeaderRow}>
                        <span className={styles.criterionTitle}>Overall case score</span>
                      </div>
                      <div className={styles.summaryScore}>{formatScoreValue(displayCaseScore)}</div>
                      <p className={styles.summaryHint}>Average of selected ratings</p>
                    </div>
                  </div>
                ) : (
                  <p className={styles.placeholderText}>No case criteria are configured for this folder.</p>
                )}
                <div className={styles.formRow}>
                  <label htmlFor="caseNotes">Case notes</label>
                  <textarea
                    id="caseNotes"
                    rows={4}
                    value={displayedFormState.caseNotes}
                    onChange={(event) => {
                      if (!isOwnTab) {
                        return;
                      }
                      const value = event.target.value;
                      updateCurrentFormState((prev) => ({ ...prev, caseNotes: value }));
                    }}
                    disabled={disableInputs}
                  />
                </div>
              </section>

              <section className={styles.formSection}>
                <header className={styles.sectionHeader}>
                  <h3>Interest level</h3>
                </header>
                <div className={styles.formRow}>
                  <textarea
                    id="interestNotes"
                    aria-label="Interest level notes"
                    placeholder="Add notes about the candidate's interest level"
                    rows={3}
                    value={displayedFormState.interestNotes}
                    onChange={(event) => {
                      if (!isOwnTab) {
                        return;
                      }
                      const value = event.target.value;
                      updateCurrentFormState((prev) => ({ ...prev, interestNotes: value }));
                    }}
                    disabled={disableInputs}
                  />
                </div>
              </section>

              <section className={styles.formSection}>
                <header className={styles.sectionHeader}>
                  <h3>Issues to Test in Next Interview</h3>
                </header>
                <div className={styles.formRow}>
                  <textarea
                    id="issuesToTest"
                    aria-label="Issues to Test in Next Interview"
                    placeholder="List focus areas for the next interviewer"
                    rows={3}
                    value={displayedFormState.issuesToTest}
                    onChange={(event) => {
                      if (!isOwnTab) {
                        return;
                      }
                      const value = event.target.value;
                      updateCurrentFormState((prev) => ({ ...prev, issuesToTest: value }));
                    }}
                    disabled={disableInputs}
                  />
                </div>
              </section>

              <section className={styles.formSection}>
                <header className={styles.sectionHeader}>
                  <h3>Summary & recommendation</h3>
                </header>
                <div className={styles.offerGroup}>
                  {OFFER_OPTIONS.map((option) => {
                    const highlightDecision =
                      (!isOwnTab || isSubmitted) && displayedFormState.offerRecommendation === option.value;
                    const offerOptionClassName = `${styles.offerOption} ${
                      highlightDecision ? styles.offerOptionSelected : ''
                    }`;
                    return (
                      <label key={option.value} className={offerOptionClassName}>
                        <input
                          type="radio"
                          name="offerRecommendation"
                          value={option.value}
                          checked={displayedFormState.offerRecommendation === option.value}
                        disabled={disableInputs}
                        onChange={() => {
                          if (!isOwnTab) {
                            return;
                          }
                          updateCurrentFormState((prev) => ({ ...prev, offerRecommendation: option.value }));
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                    );
                  })}
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="generalNotes">Comments (optional)</label>
                  <textarea
                    id="generalNotes"
                    rows={4}
                    value={displayedFormState.notes}
                    onChange={(event) => {
                      if (!isOwnTab) {
                        return;
                      }
                      const value = event.target.value;
                      updateCurrentFormState((prev) => ({ ...prev, notes: value }));
                    }}
                    disabled={disableInputs}
                  />
                </div>
              </section>

              {isOwnTab && (
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={disableInputs}
                    onClick={handleSaveDraft}
                  >
                    {saving ? 'Saving…' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={isSubmitted || saving || !canSubmitFinal}
                    onClick={() => {
                      if (!canSubmitFinal) {
                        setBanner({
                          type: 'error',
                          text: 'Complete all quantitative ratings before submitting the evaluation.'
                        });
                        return;
                      }
                      handleSubmitFinal();
                    }}
                  >
                    Submit evaluation
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <header>
        <h1>My interviews</h1>
        <p>All interview assignments assigned to you are collected in this workspace.</p>
      </header>

      {banner && (
        <div className={`${styles.banner} ${banner.type === 'info' ? styles.bannerInfo : styles.bannerError}`}>
          {banner.text}
        </div>
      )}

      <div className={styles.content}>
        <aside className={styles.listPanel}>
          <h2 className={styles.listTitle}>Assignments</h2>
          {renderList()}
        </aside>
        {renderDetail()}
      </div>
    </div>
  );
};
