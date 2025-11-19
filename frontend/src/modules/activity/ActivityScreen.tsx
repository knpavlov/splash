import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../styles/ActivityScreen.module.css';
import { useAuth } from '../auth/AuthContext';
import { activityApi } from './services/activityApi';
import {
  ActivityCommentFeedResponse,
  ActivityMetricDefinition,
  ActivityPreferenceBundle,
  ActivitySummaryResponse,
  ActivityTimeframeKey
} from '../../shared/types/activity';
import { workstreamsApi } from '../workstreams/services/workstreamsApi';
import { initiativesApi } from '../initiatives/services/initiativesApi';
import { Workstream } from '../../shared/types/workstream';
import { Initiative, initiativeStageLabels } from '../../shared/types/initiative';
import { initiativeLogsApi } from '../logs/services/initiativeLogsApi';
import { InitiativeLogEntry } from '../../shared/types/initiativeLog';

const currencyFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

const formatMetricValue = (metric: ActivitySummaryResponse['metrics'][number]) => {
  if (metric.value === null || metric.value === undefined) {
    return '—';
  }
  switch (metric.unit) {
    case 'currency':
      return currencyFormatter.format(metric.value);
    case 'percentage':
      return percentFormatter.format(metric.value / 100);
    default:
      return numberFormatter.format(metric.value);
  }
};

const formatDelta = (metric: ActivitySummaryResponse['metrics'][number]) => {
  if (metric.delta === null || metric.delta === undefined) {
    return null;
  }
  const formatted =
    metric.unit === 'currency'
      ? currencyFormatter.format(metric.delta)
      : metric.unit === 'percentage'
      ? `${metric.delta.toFixed(1)}%`
      : numberFormatter.format(metric.delta);
  const trend = metric.trend ?? (metric.delta > 0 ? 'up' : metric.delta < 0 ? 'down' : 'flat');
  return { formatted, trend };
};

const stageName = (stageKey: string | null) => {
  if (!stageKey) {
    return 'Multi-stage';
  }
  return initiativeStageLabels[stageKey as keyof typeof initiativeStageLabels] ?? stageKey.toUpperCase();
};

export const ActivityScreen = () => {
  const { session } = useAuth();
  const [bundle, setBundle] = useState<ActivityPreferenceBundle | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [timeframeKey, setTimeframeKey] = useState<ActivityTimeframeKey>('since-last-login');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);
  const [followedInitiatives, setFollowedInitiatives] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [summary, setSummary] = useState<ActivitySummaryResponse | null>(null);
  const [comments, setComments] = useState<ActivityCommentFeedResponse | null>(null);
  const [updates, setUpdates] = useState<InitiativeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelBusy, setPanelBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const markVisitRef = useRef(false);

  const accountId = session?.accountId ?? null;

  const sortedWorkstreams = useMemo(
    () => [...workstreams].sort((a, b) => a.name.localeCompare(b.name)),
    [workstreams]
  );
  const sortedInitiatives = useMemo(
    () => [...initiatives].sort((a, b) => a.name.localeCompare(b.name)),
    [initiatives]
  );

  const metricDefinitions = useMemo(() => {
    const map = new Map<string, ActivityMetricDefinition>();
    bundle?.metricCatalog.forEach((definition) => map.set(definition.key, definition));
    return map;
  }, [bundle?.metricCatalog]);

  const selectedMetricDefinitions = selectedMetrics
    .map((key) => metricDefinitions.get(key))
    .filter((definition): definition is ActivityMetricDefinition => Boolean(definition));

  const loadBundle = useCallback(async () => {
    if (!accountId) {
      return;
    }
    setLoading(true);
    try {
      const [preferencesBundle, wsList, initiativesList] = await Promise.all([
        activityApi.getPreferences(accountId),
        workstreamsApi.list(),
        initiativesApi.list()
      ]);
      setBundle(preferencesBundle);
      setSelectedModules(preferencesBundle.preferences.moduleKeys);
      setSelectedWorkstreams(preferencesBundle.preferences.workstreamIds);
      setFollowedInitiatives(preferencesBundle.preferences.initiativeIds);
      setSelectedMetrics(preferencesBundle.preferences.metricKeys);
      setTimeframeKey(preferencesBundle.preferences.defaultTimeframe);
      setWorkstreams(wsList);
      setInitiatives(initiativesList);
      setError(null);
      setReady(true);
    } catch (err) {
      console.error('Failed to load activity preferences:', err);
      setError('Unable to load your personalised activity feed.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const loadData = useCallback(
    async (input: {
      timeframe: ActivityTimeframeKey;
      workstreamIds: string[];
      metricKeys: string[];
      initiativeIds: string[];
    }) => {
      if (!accountId) {
        return;
      }
      setPanelBusy(true);
      try {
        const [summaryResponse, commentsResponse] = await Promise.all([
          activityApi.getSummary(accountId, {
            timeframe: input.timeframe,
            workstreamIds: input.workstreamIds,
            metricKeys: input.metricKeys
          }),
          activityApi.getCommentFeed(accountId, {
            timeframe: input.timeframe,
            workstreamIds: input.workstreamIds,
            initiativeIds: input.initiativeIds,
            limit: 40
          })
        ]);
        setSummary(summaryResponse);
        setComments(commentsResponse);
        const logFilters = {
          after: summaryResponse.timeframe.start,
          workstreamIds: input.workstreamIds.length ? input.workstreamIds : undefined,
          initiativeIds: input.initiativeIds.length ? input.initiativeIds : undefined,
          limit: 40
        };
        const logs = await initiativeLogsApi.list(accountId, logFilters);
        setUpdates(logs.slice(0, 20));
        if (!markVisitRef.current) {
          markVisitRef.current = true;
          void activityApi.markVisited(accountId).catch((visitError) => {
            console.warn('Failed to mark activity visit:', visitError);
          });
        }
        setError(null);
      } catch (err) {
        console.error('Failed to refresh activity signals:', err);
        setError('Unable to refresh the feed. Please try again.');
      } finally {
        setPanelBusy(false);
      }
    },
    [accountId]
  );

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    if (!ready || !accountId) {
      return;
    }
    void loadData({
      timeframe: timeframeKey,
      workstreamIds: selectedWorkstreams,
      metricKeys: selectedMetrics,
      initiativeIds: followedInitiatives
    });
  }, [ready, accountId, timeframeKey, selectedWorkstreams, selectedMetrics, followedInitiatives, loadData]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeout = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const handleModuleToggle = (key: string) => {
    setSelectedModules((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    );
  };

  const handleMetricToggle = (key: string) => {
    setSelectedMetrics((current) => {
      if (current.includes(key)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== key);
      }
      return [...current, key];
    });
  };

  const handleSavePreferences = async () => {
    if (!accountId) {
      return;
    }
    setPanelBusy(true);
    try {
      const result = await activityApi.updatePreferences(accountId, {
        moduleKeys: selectedModules,
        workstreamIds: selectedWorkstreams,
        initiativeIds: followedInitiatives,
        metricKeys: selectedMetrics,
        defaultTimeframe: timeframeKey
      });
      setBundle(result);
      setSelectedModules(result.preferences.moduleKeys);
      setSelectedWorkstreams(result.preferences.workstreamIds);
      setFollowedInitiatives(result.preferences.initiativeIds);
      setSelectedMetrics(result.preferences.metricKeys);
      setTimeframeKey(result.preferences.defaultTimeframe);
      setStatus('Preferences saved');
    } catch (err) {
      console.error('Failed to update activity preferences:', err);
      setError('Unable to save your preferences. Please retry.');
    } finally {
      setPanelBusy(false);
    }
  };

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <section className={styles.loadingState}>
        <p>Loading your tailored activity feed…</p>
      </section>
    );
  }

  const timeframeOptions = bundle?.timeframes ?? [];
  const showInsights = selectedModules.includes('insights');
  const showUpdates = selectedModules.includes('updates');
  const showComments = selectedModules.includes('comments');

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Signals</p>
          <h1>What happened since you last logged in</h1>
          <p className={styles.subtitle}>
            Track recurring impact, approvals and conversations across the streams you follow.
          </p>
          {summary?.timeframe && (
            <p className={styles.timeframeMeta}>
              {summary.timeframe.label} · starting {dateTimeFormatter.format(new Date(summary.timeframe.start))}
              {summary.timeframe.fallback && (
                <span className={styles.fallbackBadge}>fallback to rolling window</span>
              )}
            </p>
          )}
        </div>
        <div className={styles.timeframeSelector}>
          {timeframeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`${styles.timeframeButton} ${option.key === timeframeKey ? styles.timeframeButtonActive : ''}`}
              onClick={() => setTimeframeKey(option.key)}
            >
              <span>{option.label}</span>
              <small>{option.start ? dateTimeFormatter.format(new Date(option.start)) : option.description}</small>
            </button>
          ))}
        </div>
      </header>

      <section className={styles.controls}>
        {panelBusy && <div className={styles.overlay}>Refreshing data…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {status && <p className={styles.status}>{status}</p>}
        <div className={styles.controlGroup}>
          <p className={styles.controlLabel}>Modules</p>
          <div className={styles.toggleGroup}>
            {bundle?.moduleCatalog.map((module) => (
              <button
                key={module.key}
                type="button"
                className={`${styles.toggleButton} ${
                  selectedModules.includes(module.key) ? styles.toggleButtonActive : ''
                }`}
                onClick={() => handleModuleToggle(module.key)}
              >
                {module.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.controlGrid}>
          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Workstreams</p>
            <select
              multiple
              className={styles.multiSelect}
              value={selectedWorkstreams}
              onChange={(event) =>
                setSelectedWorkstreams(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {sortedWorkstreams.map((workstream) => (
                <option key={workstream.id} value={workstream.id}>
                  {workstream.name}
                </option>
              ))}
            </select>
            <div className={styles.selectActions}>
              <button type="button" onClick={() => setSelectedWorkstreams(sortedWorkstreams.map((ws) => ws.id))}>
                Select all
              </button>
              <button type="button" onClick={() => setSelectedWorkstreams([])}>
                Clear
              </button>
            </div>
          </div>
          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Followed initiatives</p>
            <select
              multiple
              className={styles.multiSelect}
              value={followedInitiatives}
              onChange={(event) =>
                setFollowedInitiatives(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {sortedInitiatives.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {initiative.name}
                </option>
              ))}
            </select>
            <div className={styles.selectActions}>
              <button type="button" onClick={() => setFollowedInitiatives(sortedInitiatives.map((initiative) => initiative.id))}>
                Follow all
              </button>
              <button type="button" onClick={() => setFollowedInitiatives([])}>
                Clear
              </button>
            </div>
          </div>
          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Metric library</p>
            <div className={styles.metricLibrary}>
              {bundle?.metricCatalog.map((definition) => (
                <label key={definition.key} className={styles.metricOption}>
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(definition.key)}
                    onChange={() => handleMetricToggle(definition.key)}
                  />
                  <span>
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.preferenceActions}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSavePreferences}
            disabled={panelBusy}
          >
            Save preferences
          </button>
        </div>
      </section>

      {showInsights && summary && (
        <section className={styles.dashboard}>
          {selectedMetricDefinitions.map((definition) => {
            const metric = summary.metrics.find((entry) => entry.key === definition.key);
            if (!metric) {
              return null;
            }
            const delta = formatDelta(metric);
            return (
              <article key={definition.key} className={styles.metricCard}>
                <p className={styles.metricEyebrow}>{definition.category}</p>
                <header className={styles.metricHeader}>
                  <h3>{definition.label}</h3>
                  <small>{definition.description}</small>
                </header>
                <p className={styles.metricValue}>{formatMetricValue(metric)}</p>
                {delta && (
                  <p className={`${styles.metricDelta} ${delta.trend === 'up' ? styles.deltaUp : delta.trend === 'down' ? styles.deltaDown : ''}`}>
                    {delta.trend === 'up' && '▲'} {delta.trend === 'down' && '▼'} {delta.formatted}
                  </p>
                )}
                {metric.breakdown && metric.breakdown.length > 0 && (
                  <ul className={styles.breakdownList}>
                    {metric.breakdown.map((entry) => (
                      <li key={entry.key}>
                        <span>{entry.label}</span>
                        <strong>{currencyFormatter.format(entry.value)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      )}

      {showUpdates && (
        <section className={styles.logSection}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Audit trail</p>
              <h2>Initiative updates</h2>
              <p>Structural changes, ownership shifts and major plan edits across your selection.</p>
            </div>
            <a className={styles.inlineLink} href="#/initiative-logs">
              View full history
            </a>
          </header>
          {updates.length === 0 && <p className={styles.emptyState}>No initiative changes in this window.</p>}
          <div className={styles.logList}>
            {updates.map((entry) => (
              <article key={entry.id} className={styles.logItem}>
                <header>
                  <div>
                    <p className={styles.logTitle}>{entry.initiativeName}</p>
                    <p className={styles.logMeta}>
                      {entry.workstreamName} · {dateTimeFormatter.format(new Date(entry.createdAt))}
                    </p>
                  </div>
                  <span className={styles.logBadge}>{entry.eventType === 'create' ? 'Created' : 'Updated'}</span>
                </header>
                <p className={styles.logBody}>
                  {entry.actorName ? `${entry.actorName} ` : ''}
                  {entry.field === 'recurringImpact'
                    ? `adjusted impact from ${currencyFormatter.format(
                        Number(entry.previousValue ?? 0)
                      )} to ${currencyFormatter.format(Number(entry.nextValue ?? 0))}`
                    : `touched ${entry.field.replace(/-/g, ' ')}`}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {showComments && (
        <section className={styles.commentsSection}>
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Conversations</p>
              <h2>Latest initiative comments</h2>
              <p>Threads and replies inside the initiatives you follow.</p>
            </div>
          </header>
          {comments && comments.entries.length === 0 && (
            <p className={styles.emptyState}>No new comments for the tracked initiatives.</p>
          )}
          <div className={styles.commentList}>
            {comments?.entries.map((entry) => (
              <article key={entry.id} className={styles.commentItem}>
                <header>
                  <div>
                    <p className={styles.commentInitiative}>{entry.initiativeName}</p>
                    <p className={styles.commentMeta}>
                      {entry.workstreamName} · {stageName(entry.stageKey)} ·{' '}
                      {dateTimeFormatter.format(new Date(entry.createdAt))}
                    </p>
                  </div>
                  <a href={`#/initiatives/view/${entry.initiativeId}`} className={styles.inlineLink}>
                    Open initiative
                  </a>
                </header>
                <p className={styles.commentBody}>{entry.body}</p>
                <footer className={styles.commentFooter}>
                  <span>{entry.authorName ?? 'System'}</span>
                  {entry.targetLabel && <span> · {entry.targetLabel}</span>}
                  {entry.parentId && <span className={styles.replyBadge}>Reply</span>}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
};
