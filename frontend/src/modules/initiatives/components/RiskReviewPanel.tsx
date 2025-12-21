import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/RiskReviewPanel.module.css';
import type {
  InitiativeRisk,
  InitiativeRiskAssessmentDetail,
  InitiativeRiskAssessmentSummary
} from '../../../shared/types/initiative';
import { generateId } from '../../../shared/ui/generateId';
import { initiativesApi } from '../services/initiativesApi';
import type { InitiativeActorMetadata } from '../services/initiativesApi';

const clampScore = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(5, Math.round(numeric)));
};

const scoreOf = (risk: InitiativeRisk) => clampScore(risk.severity) * clampScore(risk.likelihood);

const riskFormHasEmptyRow = (risks: InitiativeRisk[]) =>
  risks.some((risk) => !(risk.title ?? '').trim() && !(risk.description ?? '').trim() && !(risk.mitigation ?? '').trim());

export const RiskReviewPanel = ({
  initiativeId,
  risks,
  readOnly,
  actor
}: {
  initiativeId: string;
  risks: InitiativeRisk[];
  readOnly: boolean;
  actor?: InitiativeActorMetadata;
}) => {
  const [assessments, setAssessments] = useState<InitiativeRiskAssessmentSummary[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [assessmentsError, setAssessmentsError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('latest');
  const [selectedDetail, setSelectedDetail] = useState<InitiativeRiskAssessmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedRisks, setEditedRisks] = useState<InitiativeRisk[]>([]);

  const refresh = useCallback(() => {
    setAssessmentsLoading(true);
    setAssessmentsError('');
    void initiativesApi
      .listRiskAssessments(initiativeId)
      .then((list) => {
        const sorted = [...list].sort((a, b) => b.sequence - a.sequence);
        setAssessments(sorted);
        setSelectedId((current) => {
          if (current !== 'latest' && sorted.some((entry) => entry.id === current)) {
            return current;
          }
          return 'latest';
        });
      })
      .catch((error) => {
        console.error('Failed to load risk assessments', error);
        setAssessmentsError('load_failed');
      })
      .finally(() => setAssessmentsLoading(false));
  }, [initiativeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const effectiveId = useMemo(() => {
    if (selectedId !== 'latest') {
      return selectedId;
    }
    return assessments[0]?.id ?? null;
  }, [assessments, selectedId]);

  useEffect(() => {
    if (!effectiveId) {
      setSelectedDetail(null);
      return;
    }
    setDetailLoading(true);
    void initiativesApi
      .getRiskAssessment(initiativeId, effectiveId)
      .then((detail) => setSelectedDetail(detail))
      .catch((error) => {
        console.error('Failed to load risk assessment', error);
        setSelectedDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [effectiveId, initiativeId]);

  const canUnlock =
    !readOnly &&
    !submitLoading &&
    !assessmentsLoading &&
    selectedId === 'latest' &&
    assessments.length > 0 &&
    Boolean(selectedDetail);
  const canSubmitUpdate = canUnlock && isEditing && !riskFormHasEmptyRow(editedRisks);

  const beginEdit = useCallback(() => {
    if (!canUnlock || !selectedDetail) {
      return;
    }
    setSubmitError('');
    setIsEditing(true);
    setEditedRisks((selectedDetail.risks ?? []).map((risk) => ({ ...risk })));
  }, [canUnlock, selectedDetail]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedRisks([]);
    setSubmitError('');
  }, []);

  const submitUpdated = useCallback(async () => {
    if (!canSubmitUpdate) {
      return;
    }
    setSubmitLoading(true);
    setSubmitError('');
    try {
      const created = await initiativesApi.submitUpdatedRiskAssessment(initiativeId, editedRisks, actor);
      await refresh();
      setSelectedId(created.id);
      setIsEditing(false);
      setEditedRisks([]);
    } catch (error) {
      console.error('Failed to submit updated risk assessment', error);
      setSubmitError('submit_failed');
    } finally {
      setSubmitLoading(false);
    }
  }, [actor, canSubmitUpdate, editedRisks, initiativeId, refresh]);

  const displayRisks = useMemo(() => {
    const list = selectedDetail?.risks ?? [];
    return list
      .map((risk) => ({
        ...risk,
        severity: clampScore(risk.severity),
        likelihood: clampScore(risk.likelihood)
      }))
      .sort((a, b) => scoreOf(b) - scoreOf(a) || a.title.localeCompare(b.title));
  }, [selectedDetail]);

  const editRisks = useMemo(
    () =>
      editedRisks.map((risk) => ({
        ...risk,
        severity: clampScore(risk.severity),
        likelihood: clampScore(risk.likelihood)
      })),
    [editedRisks]
  );

  const updateEditedRisk = (id: string, field: keyof InitiativeRisk, value: string | number) => {
    setEditedRisks((prev) =>
      prev.map((risk) => {
        if (risk.id !== id) {
          return risk;
        }
        if (field === 'severity' || field === 'likelihood') {
          return { ...risk, [field]: clampScore(value) };
        }
        return { ...risk, [field]: typeof value === 'string' ? value : String(value) };
      })
    );
  };

  const addEditedRisk = () => {
    setEditedRisks((prev) => [
      {
        id: generateId(),
        title: '',
        description: '',
        category: 'Uncategorized',
        severity: 3,
        likelihood: 3,
        mitigation: ''
      },
      ...prev
    ]);
  };

  const removeEditedRisk = (id: string) => {
    setEditedRisks((prev) => prev.filter((risk) => risk.id !== id));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h4>Risk assessment submissions</h4>
            <p>Review previously submitted versions and submit updates to the risk register without resubmitting the entire initiative.</p>
          </div>
          <div className={styles.snapshotControls}>
            {!isEditing ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={beginEdit}
                disabled={!canUnlock}
                title={assessments.length === 0 ? 'Submit the initiative to a stage gate that requires risks first.' : undefined}
              >
                Unlock for update
              </button>
            ) : (
              <>
                <button type="button" className={styles.secondaryButton} onClick={cancelEdit} disabled={submitLoading}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={submitUpdated}
                  disabled={!canSubmitUpdate}
                  title={riskFormHasEmptyRow(editedRisks) ? 'Remove empty risks before submitting.' : undefined}
                >
                  {submitLoading ? 'Submitting...' : 'Submit updated risk assessment'}
                </button>
              </>
            )}
            {!readOnly && isEditing && (
              <button type="button" className={styles.secondaryButton} onClick={addEditedRisk} disabled={submitLoading}>
                Add risk
              </button>
            )}
            <button type="button" className={styles.secondaryButton} onClick={refresh} disabled={assessmentsLoading}>
              Refresh
            </button>
          </div>
        </div>

        <div className={styles.snapshotControls}>
          <label className={styles.field}>
            <span>Submission</span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={isEditing || assessmentsLoading || assessmentsError === 'load_failed' || assessments.length === 0}
            >
              <option value="latest">Latest</option>
              {assessments.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  #{entry.sequence} ·{' '}
                  {new Date(entry.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                  {entry.kind}
                </option>
              ))}
            </select>
          </label>
          {assessmentsLoading && <span className={styles.snapshotLabel}>Loading...</span>}
          {assessmentsError && <span className={styles.snapshotLabel}>Unavailable.</span>}
          {submitError && <span className={styles.snapshotLabel}>Failed to submit.</span>}
        </div>

        {assessments.length === 0 ? (
          <div className={styles.hint}>No submissions yet.</div>
        ) : detailLoading ? (
          <div className={styles.hint}>Loading submission...</div>
        ) : isEditing ? (
          editRisks.length === 0 ? (
            <div className={styles.hint}>No risks to update yet. Add one above.</div>
          ) : (
            <div className={styles.snapshotTableWrapper}>
              <table className={styles.snapshotTable}>
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Likelihood</th>
                    <th>Score</th>
                    <th>Mitigation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {editRisks.map((risk) => (
                    <tr key={risk.id}>
                      <td>
                        <input
                          className={styles.editInput}
                          value={risk.title}
                          onChange={(e) => updateEditedRisk(risk.id, 'title', e.target.value)}
                          placeholder="Name the risk"
                        />
                      </td>
                      <td>
                        <input
                          className={styles.editInput}
                          value={risk.description}
                          onChange={(e) => updateEditedRisk(risk.id, 'description', e.target.value)}
                          placeholder="Short description"
                        />
                      </td>
                      <td>
                        <input
                          className={styles.editInput}
                          value={risk.category}
                          onChange={(e) => updateEditedRisk(risk.id, 'category', e.target.value)}
                          placeholder="Category"
                        />
                      </td>
                      <td>
                        <select
                          className={styles.editSelect}
                          value={risk.severity}
                          onChange={(e) => updateEditedRisk(risk.id, 'severity', Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={`sev-${value}`} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.editSelect}
                          value={risk.likelihood}
                          onChange={(e) => updateEditedRisk(risk.id, 'likelihood', Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={`like-${value}`} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{scoreOf(risk)}</td>
                      <td>
                        <textarea
                          className={styles.editTextArea}
                          rows={2}
                          value={risk.mitigation}
                          onChange={(e) => updateEditedRisk(risk.id, 'mitigation', e.target.value)}
                          placeholder="Mitigation plan"
                        />
                      </td>
                      <td>
                        <button type="button" className={styles.linkButton} onClick={() => removeEditedRisk(risk.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : displayRisks.length === 0 ? (
          <div className={styles.hint}>No risks were captured in this submission.</div>
        ) : (
          <div className={styles.snapshotTableWrapper}>
            <table className={styles.snapshotTable}>
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Likelihood</th>
                  <th>Score</th>
                  <th>Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {displayRisks.map((risk) => (
                  <tr key={risk.id}>
                    <td>{risk.title}</td>
                    <td>{risk.category}</td>
                    <td>{risk.severity}</td>
                    <td>{risk.likelihood}</td>
                    <td>{scoreOf(risk)}</td>
                    <td className={styles.snapshotMitigation} title={risk.mitigation}>
                      {risk.mitigation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isEditing && assessments.length === 0 && risks.length > 0 && (
          <div className={styles.hint}>Tip: risks will appear here after the first stage-gate submission that requires risks.</div>
        )}
      </div>
    </div>
  );
};

