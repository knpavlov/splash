import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../../styles/RiskReviewPanel.module.css';
import type { InitiativeRisk, InitiativeRiskComment } from '../../../shared/types/initiative';
import { initiativesApi } from '../services/initiativesApi';
import { snapshotsApi } from '../../snapshots/services/snapshotsApi';
import type { ProgramSnapshotDetail, ProgramSnapshotSummary } from '../../../shared/types/snapshot';
import type { InitiativeActorMetadata } from '../services/initiativesApi';

const clampScore = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(5, Math.round(numeric)));
};

const scoreOf = (risk: InitiativeRisk) => clampScore(risk.severity) * clampScore(risk.likelihood);

type SnapshotCacheEntry =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; detail: ProgramSnapshotDetail };

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
  const [comments, setComments] = useState<InitiativeRiskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [expandedRiskIds, setExpandedRiskIds] = useState<Set<string>>(() => new Set());

  const [snapshots, setSnapshots] = useState<ProgramSnapshotSummary[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState('');
  const [snapshotId, setSnapshotId] = useState<string>('none');
  const [snapshotCache, setSnapshotCache] = useState<Record<string, SnapshotCacheEntry>>({});

  const riskById = useMemo(() => new Map(risks.map((risk) => [risk.id, risk])), [risks]);

  const refreshComments = useCallback(() => {
    setCommentsLoading(true);
    setCommentsError('');
    void initiativesApi
      .listRiskComments(initiativeId)
      .then((list) => setComments(list))
      .catch((error) => {
        console.error('Failed to load risk comments', error);
        setCommentsError('load_failed');
      })
      .finally(() => setCommentsLoading(false));
  }, [initiativeId]);

  useEffect(() => {
    refreshComments();
  }, [refreshComments]);

  useEffect(() => {
    if (snapshotsLoading || snapshots.length) {
      return;
    }
    setSnapshotsLoading(true);
    setSnapshotsError('');
    void snapshotsApi
      .listProgramSnapshots({ limit: 45 })
      .then((list) => setSnapshots(list))
      .catch((error) => {
        console.error('Failed to load snapshots', error);
        setSnapshotsError('load_failed');
      })
      .finally(() => setSnapshotsLoading(false));
  }, [snapshots.length, snapshotsLoading]);

  useEffect(() => {
    if (snapshotId === 'none') {
      return;
    }
    if (snapshotCache[snapshotId]) {
      return;
    }
    setSnapshotCache((prev) => ({ ...prev, [snapshotId]: { status: 'loading' } }));
    void snapshotsApi
      .getProgramSnapshot(snapshotId)
      .then((detail) => {
        setSnapshotCache((prev) => ({ ...prev, [snapshotId]: { status: 'ready', detail } }));
      })
      .catch((error) => {
        console.error('Failed to load snapshot', error);
        setSnapshotCache((prev) => ({ ...prev, [snapshotId]: { status: 'error' } }));
      });
  }, [snapshotCache, snapshotId]);

  const snapshotDetail = useMemo(() => {
    if (snapshotId === 'none') {
      return null;
    }
    const entry = snapshotCache[snapshotId];
    if (!entry || entry.status !== 'ready') {
      return null;
    }
    return entry.detail;
  }, [snapshotCache, snapshotId]);

  const snapshotInitiative = useMemo(() => {
    const payload = snapshotDetail?.payload;
    if (!payload) {
      return null;
    }
    const match = payload.initiatives?.find((initiative) => initiative.id === initiativeId) ?? null;
    return match as unknown as { risks?: InitiativeRisk[] } | null;
  }, [initiativeId, snapshotDetail]);

  const snapshotRisks = useMemo(() => {
    const list = snapshotInitiative?.risks ?? [];
    const normalized = list.map((risk) => ({
      ...risk,
      severity: clampScore(risk.severity),
      likelihood: clampScore(risk.likelihood)
    }));
    return normalized.sort((a, b) => scoreOf(b) - scoreOf(a) || a.title.localeCompare(b.title));
  }, [snapshotInitiative]);

  const openCommentCount = useMemo(() => comments.filter((comment) => !comment.resolvedAt).length, [comments]);

  const groupedComments = useMemo(() => {
    const byRisk = new Map<string, InitiativeRiskComment[]>();
    comments.forEach((comment) => {
      const list = byRisk.get(comment.riskId) ?? [];
      list.push(comment);
      byRisk.set(comment.riskId, list);
    });
    for (const list of byRisk.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return byRisk;
  }, [comments]);

  const riskScore = useCallback(
    (riskId: string) => {
      const risk = riskById.get(riskId);
      return risk ? scoreOf(risk) : -1;
    },
    [riskById]
  );

  const toggleExpanded = useCallback((riskId: string) => {
    setExpandedRiskIds((prev) => {
      const next = new Set(prev);
      if (next.has(riskId)) {
        next.delete(riskId);
      } else {
        next.add(riskId);
      }
      return next;
    });
  }, []);

  const handleResolve = useCallback(
    async (comment: InitiativeRiskComment, resolved: boolean) => {
      const updated = await initiativesApi.setRiskCommentResolution(comment.initiativeId, comment.id, resolved, actor);
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    },
    [actor]
  );

  const snapshotLabel = useMemo(() => {
    if (snapshotId === 'none') {
      return null;
    }
    const match = snapshots.find((item) => item.id === snapshotId);
    return match ? new Date(match.capturedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  }, [snapshotId, snapshots]);

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h4>Risk review comments</h4>
            <p>
              {commentsLoading
                ? 'Loading comments…'
                : commentsError
                  ? 'Failed to load comments.'
                  : openCommentCount
                    ? `${openCommentCount} open comments`
                    : 'No open comments'}
            </p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={refreshComments} disabled={commentsLoading}>
            Refresh
          </button>
        </div>

        {comments.length === 0 ? (
          <div className={styles.hint}>No comments have been added from the risk dashboard yet.</div>
        ) : (
          <div className={styles.commentGroups}>
            {Array.from(groupedComments.entries())
              .sort((a, b) => riskScore(b[0]) - riskScore(a[0]) || a[0].localeCompare(b[0]))
              .map(([riskId, list]) => {
                const risk = riskById.get(riskId);
                const title = risk?.title || `Risk ${riskId.slice(0, 8)}`;
                const openCountForRisk = list.filter((comment) => !comment.resolvedAt).length;
                const expanded = expandedRiskIds.has(riskId);
                return (
                  <div key={riskId} className={styles.commentGroup}>
                    <button type="button" className={styles.groupToggle} onClick={() => toggleExpanded(riskId)}>
                      <span className={styles.groupTitle}>{title}</span>
                      <span className={styles.groupMeta}>
                        {openCountForRisk ? `${openCountForRisk} open` : 'All resolved'} • {list.length} total
                      </span>
                    </button>
                    {expanded && (
                      <ul className={styles.commentList}>
                        {list.map((comment) => (
                          <li key={comment.id} className={styles.commentItem}>
                            <div className={styles.commentBody}>{comment.body}</div>
                            <div className={styles.commentMeta}>
                              <span>
                                {comment.authorName ?? 'Unknown'} •{' '}
                                {new Date(comment.createdAt).toLocaleString('en-US', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short'
                                })}
                              </span>
                              {!readOnly && (
                                <button
                                  type="button"
                                  className={styles.linkButton}
                                  onClick={() => void handleResolve(comment, !comment.resolvedAt)}
                                >
                                  {comment.resolvedAt ? 'Reopen' : 'Resolve'}
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h4>Submitted risk snapshots</h4>
            <p>Pick a program snapshot to review previous submitted versions of this risk register.</p>
          </div>
        </div>

        <div className={styles.snapshotControls}>
          <label className={styles.field}>
            <span>Snapshot</span>
            <select value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} disabled={snapshotsLoading || !!snapshotsError}>
              <option value="none">None</option>
              {snapshots
                .slice()
                .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))
                .map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {new Date(snapshot.capturedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </option>
                ))}
            </select>
          </label>
          {snapshotLabel && <div className={styles.snapshotLabel}>Showing: {snapshotLabel}</div>}
        </div>

        {snapshotId !== 'none' && !snapshotDetail && (
          <div className={styles.hint}>
            {snapshotCache[snapshotId]?.status === 'error' ? 'Failed to load snapshot.' : 'Loading snapshot…'}
          </div>
        )}

        {snapshotDetail && (
          <>
            {!snapshotInitiative ? (
              <div className={styles.hint}>This initiative was not present in the selected snapshot.</div>
            ) : snapshotRisks.length === 0 ? (
              <div className={styles.hint}>No risks captured in the selected snapshot.</div>
            ) : (
              <div className={styles.snapshotTableWrapper}>
                <table className={styles.snapshotTable}>
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Risk</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Likelihood</th>
                      <th>Mitigation</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotRisks.map((risk) => {
                      const current = riskById.get(risk.id);
                      const currentScore = current ? scoreOf(current) : null;
                      const snapScore = scoreOf(risk);
                      const changed =
                        !current ||
                        clampScore(current.severity) !== clampScore(risk.severity) ||
                        clampScore(current.likelihood) !== clampScore(risk.likelihood) ||
                        (current.mitigation ?? '') !== (risk.mitigation ?? '') ||
                        (current.title ?? '') !== (risk.title ?? '');
                      return (
                        <tr key={risk.id} className={changed ? styles.snapshotChanged : ''}>
                          <td>{snapScore}</td>
                          <td title={risk.description || risk.title}>{risk.title || '(Untitled)'}</td>
                          <td>{risk.category || 'Uncategorized'}</td>
                          <td>{clampScore(risk.severity)}</td>
                          <td>{clampScore(risk.likelihood)}</td>
                          <td className={styles.snapshotMitigation} title={risk.mitigation}>
                            {risk.mitigation}
                          </td>
                          <td>
                            {!current
                              ? 'Removed'
                              : changed
                                ? currentScore !== null
                                  ? `Now ${currentScore}`
                                  : 'Changed'
                                : 'Unchanged'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
