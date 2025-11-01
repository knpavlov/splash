import { useCallback, useMemo, useState } from 'react';
import styles from '../../styles/EvaluationScreen.module.css';
import { EvaluationModal } from './components/EvaluationModal';
import { EvaluationStatusModal } from './components/EvaluationStatusModal';
import {
  useEvaluationsState,
  useCandidatesState,
  useCasesState,
  useFitQuestionsState,
  useCaseCriteriaState,
  useAccountsState
} from '../../app/state/AppStateContext';
import { EvaluationConfig, OfferDecisionStatus } from '../../shared/types/evaluation';
import { EvaluationTable, EvaluationTableRow } from './components/EvaluationTable';
import { formatDate } from '../../shared/utils/date';
import { composeFullName, buildLastNameSortKey } from '../../shared/utils/personName';

type Banner = { type: 'info' | 'error'; text: string } | null;

type SortKey = 'name' | 'position' | 'created' | 'round' | 'avgFit' | 'avgCase';

type StatusContext = {
  evaluation: EvaluationConfig;
  candidateName: string;
  candidatePosition: string;
  roundLabel: string;
};

type DecisionOption = 'offer' | 'progress' | 'reject';

const DECISION_LABELS: Record<DecisionOption, string> = {
  offer: 'Offer',
  progress: 'Next round',
  reject: 'Reject'
};

const OFFER_STATUS_LABELS: Record<OfferDecisionStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  'accepted-co': 'Accepted (CO)',
  declined: 'Declined',
  'declined-co': 'Declined (CO)'
};

export const EvaluationScreen = () => {
  const { list, saveEvaluation, removeEvaluation, sendInvitations, advanceRound, setDecision, setOfferStatus } =
    useEvaluationsState();
  const { list: candidates } = useCandidatesState();
  const { folders } = useCasesState();
  const { list: fitQuestions } = useFitQuestionsState();
  const { list: caseCriteria } = useCaseCriteriaState();
  const { list: accounts } = useAccountsState();
  const [banner, setBanner] = useState<Banner>(null);
  const [modalEvaluation, setModalEvaluation] = useState<EvaluationConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusContext, setStatusContext] = useState<StatusContext | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [roundSelections, setRoundSelections] = useState<Record<string, number>>({});
  const [decisionSelections, setDecisionSelections] = useState<Record<string, DecisionOption | null>>({});
  const [statusSelections, setStatusSelections] = useState<Record<string, OfferDecisionStatus>>({});

  const candidateIndex = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        sortKey: string;
        position: string;
      }
    >();
    candidates.forEach((candidate) => {
      const displayName = composeFullName(candidate.firstName, candidate.lastName);
      const name = displayName || 'Not selected';
      const sortKey = buildLastNameSortKey(candidate.firstName, candidate.lastName) || name;
      const position = candidate.desiredPosition?.trim() || '—';
      map.set(candidate.id, { name, sortKey, position });
    });
    return map;
  }, [candidates]);

  const handleSendInvites = useCallback(
    async (evaluation: EvaluationConfig, slotIds?: string[]) => {
      const sanitizedSelection = Array.isArray(slotIds)
        ? slotIds
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : undefined;
      const effectiveSelection = sanitizedSelection && sanitizedSelection.length > 0 ? sanitizedSelection : undefined;
      const result = await sendInvitations(evaluation.id, effectiveSelection);
      if (!result.ok) {
        if (result.error === 'missing-assignment-data') {
          setBanner({
            type: 'error',
            text: 'Assign interviewers, cases, and fit questions to every slot before sending invites.'
          });
          return;
        }
        if (result.error === 'invalid-assignment-data') {
          setBanner({
            type: 'error',
            text: 'Use valid cases and fit questions for every interview slot before sending invites.'
          });
          return;
        }
        if (result.error === 'invalid-assignment-resources') {
          setBanner({
            type: 'error',
            text: 'Some selected cases or fit questions are no longer available. Update assignments and try again.'
          });
          return;
        }
        if (result.error === 'mailer-unavailable') {
          setBanner({ type: 'error', text: 'Email delivery is not configured. Interviewers were not notified.' });
          return;
        }
        if (result.error === 'invalid-portal-url') {
          setBanner({
            type: 'error',
            text: 'Provide a reachable interviewer portal URL (environment variable or current site origin).'
          });
          return;
        }
        if (result.error === 'invalid-selection') {
          setBanner({ type: 'error', text: 'Choose at least one interviewer before resending invites.' });
          return;
        }
        if (result.error === 'invitation-delivery-failed') {
          setBanner({
            type: 'error',
            text: 'Some invitations could not be delivered. Check the email service configuration and try again.'
          });
          return;
        }
        if (result.error === 'not-found') {
          setBanner({ type: 'error', text: 'Evaluation not found. Refresh the page.' });
          return;
        }
        setBanner({ type: 'error', text: 'Failed to send invitations.' });
        return;
      }
      const updatedEvaluation = result.data.evaluation;
      const delivery = result.data.deliveryReport;
      if (delivery.failed.length > 0) {
        const failedLabels = delivery.failed.map((failure) => {
          const slot = updatedEvaluation.invitationState.slots.find((state) => state.slotId === failure.slotId);
          const label = slot
            ? `${slot.interviewerName.trim() || 'Interviewer'} — ${slot.interviewerEmail || slot.slotId}`
            : failure.slotId;
          const reason = failure.errorMessage?.trim() || 'Delivery failed.';
          return `${label}: ${reason}`;
        });
        setBanner({
          type: 'error',
          text: `Some invitations were not delivered. ${failedLabels.join(' | ')}`
        });
        return;
      }
      if (delivery.sent.length > 0) {
        const message = effectiveSelection && effectiveSelection.length > 0
          ? 'Invitations sent to the selected interviewers.'
          : 'Invitations sent to every interviewer.';
        setBanner({ type: 'info', text: message });
        return;
      }
      setBanner({ type: 'info', text: 'Assignments updated without sending new invitations.' });
    },
    [sendInvitations]
  );

  const handleAdvanceRound = useCallback(
    async (evaluation: EvaluationConfig) => {
      const result = await advanceRound(evaluation.id);
      if (!result.ok) {
        if (result.error === 'forms-pending') {
          setBanner({
            type: 'error',
            text: 'Collect all interview feedback before progressing to the next round.'
          });
          return;
        }
        if (result.error === 'version-conflict') {
          setBanner({
            type: 'error',
            text: 'Version conflict. Refresh the page to view the latest data.'
          });
          return;
        }
        if (result.error === 'not-found') {
          setBanner({ type: 'error', text: 'Evaluation not found. Refresh the page.' });
          return;
        }
        setBanner({ type: 'error', text: 'Failed to progress to the next round.' });
        return;
      }
      const nextRound = result.data.roundNumber ?? (evaluation.roundNumber ?? 1) + 1;
      setRoundSelections((prev) => ({ ...prev, [evaluation.id]: nextRound }));
      setDecisionSelections((prev) => {
        const next = { ...prev };
        delete next[evaluation.id];
        return next;
      });
      setStatusSelections((prev) => {
        const next = { ...prev };
        delete next[evaluation.id];
        return next;
      });
      setBanner({
        type: 'info',
        text: `Candidate moved to round ${nextRound}. Configure the new round and send invites to interviewers.`
      });
    },
    [advanceRound]
  );

  const tableRows = useMemo<EvaluationTableRow[]>(() => {
    return list.map((evaluation) => {
      const metadata = evaluation.candidateId ? candidateIndex.get(evaluation.candidateId) : undefined;
      const candidateName = metadata?.name ?? 'Not selected';
      const candidateSortKey = metadata?.sortKey ?? candidateName;
      const candidatePosition = metadata?.position ?? '—';
      const createdAt = evaluation.createdAt ?? null;
      const createdOn = formatDate(createdAt);

      const currentRound = evaluation.roundNumber ?? 1;
      const storedSelection = roundSelections[evaluation.id];
      const snapshot =
        storedSelection && storedSelection !== currentRound
          ? evaluation.roundHistory.find((round) => round.roundNumber === storedSelection)
          : undefined;
      const effectiveSelectedRound = snapshot ? snapshot.roundNumber : currentRound;
      const isHistoricalView = Boolean(snapshot);

      const roundInterviews = snapshot ? snapshot.interviews : evaluation.interviews;
      const roundForms = snapshot ? snapshot.forms : evaluation.forms;
      const roundProcessStatus = snapshot ? snapshot.processStatus : evaluation.processStatus;
      const roundInterviewCount = snapshot ? snapshot.interviewCount : evaluation.interviewCount;

      const submittedForms = roundForms.filter((form) => form.submitted);
      const fitScores = submittedForms
        .map((form) => form.fitScore)
        .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
      const caseScores = submittedForms
        .map((form) => form.caseScore)
        .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
      const avgFitScore = fitScores.length
        ? fitScores.reduce((sum, value) => sum + value, 0) / fitScores.length
        : null;
      const avgCaseScore = caseScores.length
        ? caseScores.reduce((sum, value) => sum + value, 0) / caseScores.length
        : null;

      const offerTotals: Record<'yes_priority' | 'yes_strong' | 'yes_keep_warm' | 'no_offer', number> = {
        yes_priority: 0,
        yes_strong: 0,
        yes_keep_warm: 0,
        no_offer: 0
      };
      const offerResponses = submittedForms.filter((form) => typeof form.offerRecommendation === 'string');
      for (const response of offerResponses) {
        if (response.offerRecommendation && response.offerRecommendation in offerTotals) {
          offerTotals[response.offerRecommendation as keyof typeof offerTotals] += 1;
        }
      }
      const totalOffers = offerResponses.length;
      const offerBreakdown = {
        total: totalOffers,
        yesPriority: offerTotals.yes_priority,
        yesStrong: offerTotals.yes_strong,
        yesKeepWarm: offerTotals.yes_keep_warm,
        noOffer: offerTotals.no_offer
      };

      const roundOptionsMap = new Map<number, string>();
      evaluation.roundHistory.forEach((round) => {
        roundOptionsMap.set(round.roundNumber, `Round ${round.roundNumber}`);
      });
      roundOptionsMap.set(currentRound, `Round ${currentRound}`);
      const roundOptions = Array.from(roundOptionsMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([value, label]) => ({ value, label }));
      const roundLabel =
        roundOptions.find((option) => option.value === effectiveSelectedRound)?.label ??
        `Round ${effectiveSelectedRound}`;

      const formsPlanned = roundInterviews.length || roundInterviewCount;
      const formsCompleted = submittedForms.length;

      const slotsReady = evaluation.interviews.every((slot) => {
        const nameReady = slot.interviewerName.trim().length > 0;
        const emailReady = slot.interviewerEmail.trim().length > 0;
        const caseReady = Boolean(slot.caseFolderId?.trim());
        const fitReady = Boolean(slot.fitQuestionId?.trim());
        return nameReady && emailReady && caseReady && fitReady;
      });
      const emailsReady = evaluation.interviews.every((slot) => slot.interviewerEmail.trim().length > 0);
      const formsBySlot = new Map(evaluation.forms.map((form) => [form.slotId, form]));
      const allFormsSubmitted =
        evaluation.interviews.length > 0 &&
        evaluation.interviews.every((slot) => formsBySlot.get(slot.id)?.submitted === true);

      let invitesTooltip: string | undefined;
      let invitesDisabled = false;
      if (isHistoricalView) {
        invitesDisabled = true;
        invitesTooltip = 'Switch to the current round to manage invitations.';
      } else if (!emailsReady) {
        invitesDisabled = true;
        invitesTooltip = 'Add email addresses for every interviewer before sending invites.';
      } else if (!slotsReady) {
        invitesDisabled = true;
        invitesTooltip = 'Complete all interviewer, case and fit question assignments before sending invites.';
      }

      const invitesButtonLabel = evaluation.invitationState.hasInvitations ? 'Resend Invites' : 'Send Invites';
      const hasInvitations = evaluation.invitationState.hasInvitations && !isHistoricalView;
      if (!invitesDisabled && hasInvitations && evaluation.invitationState.hasPendingChanges) {
        invitesTooltip = 'Select interviewers to resend updated invites.';
      }
      if (!invitesDisabled && evaluation.invitationState.hasInvitations && !evaluation.invitationState.hasPendingChanges) {
        invitesTooltip = 'Invitations were already sent. Use this action to resend the same details.';
      }

      const invitees = evaluation.interviews.map((slot) => {
        const name = slot.interviewerName.trim() || 'Interviewer';
        const email = slot.interviewerEmail.trim();
        const label = email ? `${name} — ${email}` : name;
        return { slotId: slot.id, label };
      });

      const decisionDisabled = isHistoricalView || !allFormsSubmitted;
      let decisionTooltip: string | undefined;
      if (isHistoricalView) {
        decisionTooltip = 'Switch to the current round to choose a decision.';
      } else if (!allFormsSubmitted) {
        decisionTooltip = 'Wait until every interviewer submits their evaluation to enable these actions.';
      }

      const storedDecision = snapshot ? snapshot.decision ?? null : evaluation.decision ?? null;
      const hasOverride = Object.prototype.hasOwnProperty.call(decisionSelections, evaluation.id);
      const overrideDecision = hasOverride ? decisionSelections[evaluation.id] ?? null : undefined;
      const effectiveDecision = overrideDecision !== undefined ? overrideDecision : storedDecision ?? null;
      const legacyAcceptedDecision = effectiveDecision === 'accepted-offer';
      const normalizedDecision =
        effectiveDecision === 'accepted-offer' ? ('offer' as DecisionOption) : effectiveDecision;
      const isCurrentRoundIncomplete = !isHistoricalView && roundProcessStatus !== 'completed';
      const decisionLabel = isCurrentRoundIncomplete
        ? 'Decision'
        : normalizedDecision
          ? DECISION_LABELS[normalizedDecision]
          : 'Decision';
      const decisionState: DecisionOption | null = isCurrentRoundIncomplete
        ? null
        : normalizedDecision
          ? (normalizedDecision as DecisionOption)
          : null;

      const storedStatus = snapshot
        ? snapshot.offerDecisionStatus ?? null
        : evaluation.offerDecisionStatus ?? null;
      const overrideStatus = statusSelections[evaluation.id];
      const statusPending = Object.prototype.hasOwnProperty.call(statusSelections, evaluation.id);
      const fallbackStatus = storedStatus ?? (legacyAcceptedDecision ? 'accepted' : null);
      const effectiveStatus: OfferDecisionStatus = overrideStatus ?? fallbackStatus ?? 'pending';
      const statusLabel = statusPending ? 'Updating…' : OFFER_STATUS_LABELS[effectiveStatus];
      const canEditStatus = !isHistoricalView && decisionState === 'offer';
      let statusTooltip: string | undefined;
      if (isHistoricalView) {
        statusTooltip = 'Switch to the current round to change the offer status.';
      } else if (decisionState !== 'offer') {
        statusTooltip = 'Select the Offer decision to manage the offer follow-up status.';
      }

      const updateStatus = async (target: OfferDecisionStatus) => {
        if (!canEditStatus) {
          return;
        }
        setStatusSelections((prev) => ({ ...prev, [evaluation.id]: target }));
        try {
          const result = await setOfferStatus(evaluation.id, target, evaluation.version);
          if (!result.ok) {
            const message =
              result.error === 'version-conflict'
                ? 'Version conflict. Refresh the page to view the latest data.'
                : result.error === 'not-found'
                  ? 'Evaluation not found. Refresh the page.'
                  : result.error === 'invalid-input'
                    ? 'Failed to update the offer status. Try again.'
                    : 'Failed to update the offer status.';
            setBanner({ type: 'error', text: message });
            return;
          }
          setBanner({ type: 'info', text: `Offer status updated: ${OFFER_STATUS_LABELS[target]}.` });
        } finally {
          setStatusSelections((prev) => {
            const next = { ...prev };
            delete next[evaluation.id];
            return next;
          });
        }
      };

      const evaluationForModal = snapshot
        ? {
            ...evaluation,
            roundNumber: snapshot.roundNumber,
            interviewCount: snapshot.interviewCount,
            interviews: snapshot.interviews,
            forms: snapshot.forms,
            processStatus: snapshot.processStatus,
            processStartedAt: snapshot.processStartedAt,
            fitQuestionId: snapshot.fitQuestionId
          }
        : evaluation;

      const changeRound = (round: number) => {
        if (round === currentRound) {
          setRoundSelections((prev) => {
            const next = { ...prev };
            delete next[evaluation.id];
            return next;
          });
          return;
        }
        setRoundSelections((prev) => ({ ...prev, [evaluation.id]: round }));
      };

      const sendInvites = (slotIds?: string[]) => {
        void handleSendInvites(evaluation, slotIds);
      };

      const updateDecision = async (target: 'offer' | 'reject') => {
        setDecisionSelections((prev) => ({ ...prev, [evaluation.id]: target }));
        const result = await setDecision(evaluation.id, target, evaluation.version);
        if (!result.ok) {
          setDecisionSelections((prev) => {
            const next = { ...prev };
            delete next[evaluation.id];
            return next;
          });
          setStatusSelections((prev) => {
            const next = { ...prev };
            delete next[evaluation.id];
            return next;
          });
          const message =
            result.error === 'version-conflict'
              ? 'Version conflict. Refresh the page to view the latest data.'
              : result.error === 'invalid-input'
                ? 'Failed to update the decision. Try again.'
                : result.error === 'not-found'
                  ? 'Evaluation not found. Refresh the page.'
                  : 'Failed to update the decision.';
          setBanner({ type: 'error', text: message });
          return;
        }
        setDecisionSelections((prev) => {
          const next = { ...prev };
          delete next[evaluation.id];
          return next;
        });
        setStatusSelections((prev) => {
          const next = { ...prev };
          delete next[evaluation.id];
          return next;
        });
        setBanner({ type: 'info', text: `Decision updated: ${DECISION_LABELS[target]}.` });
      };

      const decide = (option: DecisionOption) => {
        if (option === 'progress') {
          void handleAdvanceRound(evaluation);
          return;
        }
        void updateDecision(option);
      };

      const processLabel =
        roundProcessStatus === 'in-progress'
          ? 'In progress'
          : roundProcessStatus === 'completed'
            ? 'Completed'
            : 'Draft';

      return {
        id: evaluation.id,
        candidateName,
        candidateSortKey,
        candidatePosition,
        createdAt,
        createdOn,
        roundOptions,
        selectedRound: effectiveSelectedRound,
        roundNumber: effectiveSelectedRound,
        onRoundChange: changeRound,
        isHistoricalView,
        formsCompleted,
        formsPlanned,
        avgFitScore,
        avgCaseScore,
        offerBreakdown,
        processLabel,
        invitesButtonLabel,
        invitesDisabled,
        invitesTooltip,
        hasInvitations,
        invitees,
        onSendInvites: sendInvites,
        onEdit: () => {
          setModalEvaluation(evaluation);
          setIsModalOpen(true);
        },
        onOpenStatus: () =>
          setStatusContext({
            evaluation: evaluationForModal,
            candidateName,
            candidatePosition,
            roundLabel
          }),
        decisionDisabled,
        decisionTooltip,
        decisionLabel,
        decisionState,
        onDecisionSelect: decide,
        statusLabel,
        statusState: effectiveStatus,
        statusDisabled: !canEditStatus || statusPending,
        statusTooltip,
        isStatusPending: statusPending,
        onStatusSelect: updateStatus
      } satisfies EvaluationTableRow;
    });
  }, [
    candidateIndex,
    list,
    roundSelections,
    decisionSelections,
    statusSelections,
    handleSendInvites,
    handleAdvanceRound,
    setDecision,
    setOfferStatus,
    setBanner
  ]);

  const sortedRows = useMemo(() => {
    const copy = [...tableRows];

    const compareStrings = (a: string, b: string) => a.localeCompare(b, 'en-US', { sensitivity: 'base' });
    const compareNumbers = (a: number | null, b: number | null) => {
      const safeA = a ?? Number.NEGATIVE_INFINITY;
      const safeB = b ?? Number.NEGATIVE_INFINITY;
      return safeA - safeB;
    };

    copy.sort((a, b) => {
      let result = 0;
      if (sortKey === 'name') {
        result = compareStrings(a.candidateSortKey, b.candidateSortKey);
      } else if (sortKey === 'position') {
        result = compareStrings(a.candidatePosition, b.candidatePosition);
      } else if (sortKey === 'created') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Number.NEGATIVE_INFINITY;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Number.NEGATIVE_INFINITY;
        result = timeA - timeB;
      } else if (sortKey === 'round') {
        result = compareNumbers(a.roundNumber, b.roundNumber);
      } else if (sortKey === 'avgFit') {
        result = compareNumbers(a.avgFitScore, b.avgFitScore);
      } else if (sortKey === 'avgCase') {
        result = compareNumbers(a.avgCaseScore, b.avgCaseScore);
      }

      if (result === 0) {
        result = compareStrings(a.candidateName, b.candidateName);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return copy;
  }, [sortDirection, sortKey, tableRows]);

  const handleCreate = () => {
    setModalEvaluation(null);
    setIsModalOpen(true);
  };

  const handleSortChange = (key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setSortDirection('asc');
      return key;
    });
  };

  const handleSave = async (
    evaluation: EvaluationConfig,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    const result = await saveEvaluation(evaluation, options.expectedVersion);
    if (!result.ok) {
      if (result.error === 'version-conflict') {
        setBanner({
          type: 'error',
          text: 'Version conflict. Refresh the page to view the latest data.'
        });
      } else if (result.error === 'not-found') {
        setBanner({
          type: 'error',
          text: 'Evaluation no longer exists. Refresh the list to continue.'
        });
      } else {
        setBanner({
          type: 'error',
          text: 'Select a candidate and make sure all fields are filled.'
        });
      }
      return;
    }

    setBanner({ type: 'info', text: 'Evaluation settings saved.' });
    if (options.closeAfterSave) {
      setModalEvaluation(null);
      setIsModalOpen(false);
    } else {
      setModalEvaluation(result.data);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete the evaluation setup and all related interviews?');
    if (!confirmed) {
      return;
    }
    const result = await removeEvaluation(id);
    if (!result.ok) {
      setBanner({ type: 'error', text: 'Failed to delete the evaluation.' });
      return;
    }
    setBanner({ type: 'info', text: 'Evaluation removed.' });
    setModalEvaluation(null);
    setIsModalOpen(false);
  };


  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Evaluation management</h1>
          <p className={styles.subtitle}>Configure interviews and track the status of evaluation forms.</p>
        </div>
        <button className={styles.primaryButton} onClick={handleCreate}>
          Create evaluation
        </button>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}

      <EvaluationTable
        rows={sortedRows}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {isModalOpen && (
        <EvaluationModal
          initialConfig={modalEvaluation}
          onClose={() => {
            setIsModalOpen(false);
            setModalEvaluation(null);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          candidates={candidates}
          folders={folders}
          fitQuestions={fitQuestions}
          accounts={accounts}
        />
      )}

      {statusContext && (
        <EvaluationStatusModal
          evaluation={statusContext.evaluation}
          candidateName={statusContext.candidateName}
          candidatePosition={statusContext.candidatePosition}
          roundLabel={statusContext.roundLabel}
          fitQuestions={fitQuestions}
          caseCriteria={caseCriteria}
          caseFolders={folders}
          onClose={() => setStatusContext(null)}
        />
      )}
    </section>
  );
};
