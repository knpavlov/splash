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
import { initiativeLogsApi, EventCategory, EventCategoryOption } from '../logs/services/initiativeLogsApi';
import { InitiativeLogEntry } from '../../shared/types/initiativeLog';

const currencyFormatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 1 });
const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
const DAY_MS = 24 * 60 * 60 * 1000;

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

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

const getTimeBucketLabel = (value: Date) => {
  const now = new Date();
  if (isSameDay(value, now)) {
    return 'Today';
  }
  const yesterday = new Date(now.getTime() - DAY_MS);
  if (isSameDay(value, yesterday)) {
    return 'Yesterday';
  }
  if (now.getTime() - value.getTime() <= 7 * DAY_MS) {
    return 'Last 7 days';
  }
  return 'Earlier';
};

export const ActivityScreen = () => {
  const { session } = useAuth();
  const [bundle, setBundle] = useState<ActivityPreferenceBundle | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [timeframeKey, setTimeframeKey] = useState<ActivityTimeframeKey>('since-last-login');
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
  const [updateGrouping, setUpdateGrouping] = useState<'time' | 'initiative'>('time');
  const [updateSort, setUpdateSort] = useState<'desc' | 'asc'>('desc');
  const [updateGroupCollapsed, setUpdateGroupCollapsed] = useState<Record<string, boolean>>({});
  const [followedSearch, setFollowedSearch] = useState('');
  const [eventCategories, setEventCategories] = useState<EventCategoryOption[]>([]);
  const [selectedEventCategories, setSelectedEventCategories] = useState<EventCategory[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState<Record<string, boolean>>({
    workstreams: true,
    initiatives: false,
    metrics: false,
    eventTypes: false
  });
  const markVisitRef = useRef(false);

  const accountId = session?.accountId ?? null;
  const sortedWorkstreams = useMemo(() => [...workstreams].sort((a, b) => a.name.localeCompare(b.name)), [workstreams]);
  const sortedInitiatives = useMemo(() => [...initiatives].sort((a, b) => a.name.localeCompare(b.name)), [initiatives]);
  const metricDefinitions = useMemo(() => {
    const map = new Map<string, ActivityMetricDefinition>();
    bundle?.metricCatalog?.forEach((definition) => map.set(definition.key, definition));
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
      const [preferencesBundle, wsList, initiativesList, categoriesList] = await Promise.all([
        activityApi.getPreferences(accountId),
        workstreamsApi.list(),
        initiativesApi.list(),
        initiativeLogsApi.getCategories()
      ]);
      setBundle(preferencesBundle);
      setSelectedWorkstreams(preferencesBundle.preferences.workstreamIds);
      setFollowedInitiatives(preferencesBundle.preferences.initiativeIds);
      setSelectedMetrics(preferencesBundle.preferences.metricKeys);
      setTimeframeKey(preferencesBundle.preferences.defaultTimeframe);
      setWorkstreams(wsList);
      setInitiatives(initiativesList);
      setEventCategories(categoriesList);
      setError(null);
      setReady(true);
    } catch (err) {
      console.error('Failed to load activity preferences:', err);
      setError('Unable to load your personalised activity feed.');
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const loadSignals = useCallback(
    async (input: { timeframe: ActivityTimeframeKey; workstreamIds: string[]; metricKeys: string[]; initiativeIds: string[]; eventCategories: EventCategory[] }) => {
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
        const logs = await initiativeLogsApi.list(accountId, {
          after: summaryResponse.timeframe.start,
          workstreamIds: input.workstreamIds.length ? input.workstreamIds : undefined,
          initiativeIds: input.initiativeIds.length ? input.initiativeIds : undefined,
          eventCategories: input.eventCategories.length ? input.eventCategories : undefined,
          limit: 60
        });
        setUpdates(logs);
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
    void loadSignals({
      timeframe: timeframeKey,
      workstreamIds: selectedWorkstreams,
      metricKeys: selectedMetrics,
      initiativeIds: followedInitiatives,
      eventCategories: selectedEventCategories
    });
  }, [ready, accountId, timeframeKey, selectedWorkstreams, selectedMetrics, followedInitiatives, selectedEventCategories, loadSignals]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

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

  const handleMoveMetric = (key: string, direction: 'up' | 'down') => {
    setSelectedMetrics((current) => {
      const index = current.indexOf(key);
      if (index === -1) {
        return current;
      }
      const nextIndex = direction === 'up' ? Math.max(0, index - 1) : Math.min(current.length - 1, index + 1);
      if (nextIndex === index) {
        return current;
      }
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const handleEventCategoryToggle = (key: EventCategory) => {
    setSelectedEventCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleFilterSection = (section: string) => {
    setFiltersExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSavePreferences = async () => {
    if (!accountId) {
      return;
    }
    setPanelBusy(true);
    try {
      const result = await activityApi.updatePreferences(accountId, {
        workstreamIds: selectedWorkstreams,
        initiativeIds: followedInitiatives,
        metricKeys: selectedMetrics,
        defaultTimeframe: timeframeKey
      });
      setBundle(result);
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

  const handleOpenCommentThread = (entry: ActivityCommentFeedResponse['entries'][number]) => {
    const params = new URLSearchParams();
    if (entry.threadId) {
      params.set('comment', entry.threadId);
    }
    params.set('comments', '1');
    window.location.hash = `/initiatives/view/${entry.initiativeId}?${params.toString()}`;
  };

  const timeframeOptions = bundle?.timeframes ?? [];
  const groupedUpdates = useMemo(() => {
    if (!updates.length) {
      return [];
    }
    const sorted = [...updates].sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return updateSort === 'desc' ? right - left : left - right;
    });
    if (updateGrouping === 'initiative') {
      const map = new Map<string, { title: string; entries: InitiativeLogEntry[] }>();
      sorted.forEach((entry) => {
        if (!map.has(entry.initiativeId)) {
          map.set(entry.initiativeId, { title: entry.initiativeName, entries: [] });
        }
        map.get(entry.initiativeId)!.entries.push(entry);
      });
      return Array.from(map.values());
    }
    const bucketOrder = ['Today', 'Yesterday', 'Last 7 days', 'Earlier'];
    const map = new Map<string, InitiativeLogEntry[]>(bucketOrder.map((label) => [label, []]));
    sorted.forEach((entry) => {
      const bucket = getTimeBucketLabel(new Date(entry.createdAt));
      if (!map.has(bucket)) {
        map.set(bucket, []);
      }
      map.get(bucket)!.push(entry);
    });
    return Array.from(map.entries())
      .filter(([, entries]) => entries.length)
      .map(([title, entries]) => ({ title, entries }));
  }, [updates, updateGrouping, updateSort]);

  const describeUpdate = (entry: InitiativeLogEntry) => {
    const actor = entry.actorName ?? 'System';
    if (entry.field === 'recurringImpact') {
      return `${actor} adjusted impact from ${currencyFormatter.format(Number(entry.previousValue ?? 0))} to ${currencyFormatter.format(Number(entry.nextValue ?? 0))}`;
    }
    if (entry.field === 'created') {
      return `${actor} created the initiative.`;
    }
    if (entry.field === 'execution-plan') {
      return `${actor} updated the execution plan.`;
    }
    if (entry.field === 'stage-content') {
      return `${actor} modified stage content.`;
    }
    return `${actor} touched ${entry.field.replace(/-/g, ' ')}`;
  };

  const renderUpdateEntry = (entry: InitiativeLogEntry) => (
    <article key={entry.id} className={styles.logItem}>
      <header>
        <div>
          <p className={styles.logTitle}>{entry.initiativeName}</p>
          <p className={styles.logMeta}>
            {entry.workstreamName} · {dateTimeFormatter.format(new Date(entry.createdAt))}
          </p>
        </div>
      </header>
      <p className={styles.logBody}>{describeUpdate(entry)}</p>
    </article>
  );

  const toggleUpdateGroup = (title: string) => {
    setUpdateGroupCollapsed((prev) => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const followedSearchValue = followedSearch.trim().toLowerCase();
  const initiativesByWorkstream = useMemo(() => {
    const workstreamNames = new Map(workstreams.map((ws) => [ws.id, ws.name]));
    const groups = new Map<
      string,
      { workstreamId: string; workstreamName: string; initiatives: Initiative[] }
    >();
    sortedInitiatives.forEach((initiative) => {
      if (
        followedSearchValue &&
        !initiative.name.toLowerCase().includes(followedSearchValue)
      ) {
        return;
      }
      const workstreamName = workstreamNames.get(initiative.workstreamId) ?? 'Other';
      const existing = groups.get(initiative.workstreamId);
      if (existing) {
        existing.initiatives.push(initiative);
      } else {
        groups.set(initiative.workstreamId, {
          workstreamId: initiative.workstreamId,
          workstreamName,
          initiatives: [initiative]
        });
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.workstreamName.localeCompare(b.workstreamName));
  }, [sortedInitiatives, workstreams, followedSearchValue]);

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

  return (
    <section className={styles.layout}>
      <aside className={styles.filtersColumn}>
        <div className={styles.filtersCard}>
          {panelBusy && <div className={styles.overlay}>Refreshing…</div>}
          {error && <p className={styles.error}>{error}</p>}
          {status && <p className={styles.status}>{status}</p>}

          <div className={styles.filterSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => toggleFilterSection('workstreams')}
              aria-expanded={filtersExpanded.workstreams}
            >
              <span className={styles.sectionTitle}>Workstreams</span>
              <span className={styles.sectionBadge}>{selectedWorkstreams.length}/{sortedWorkstreams.length}</span>
              <span className={styles.toggleIcon}>{filtersExpanded.workstreams ? '−' : '+'}</span>
            </button>
            {filtersExpanded.workstreams && (
              <div className={styles.sectionContent}>
                <div className={styles.checkboxList}>
                  {sortedWorkstreams.map((workstream) => (
                    <label key={workstream.id} className={styles.checkboxItem}>
                      <input
                        type="checkbox"
                        checked={selectedWorkstreams.includes(workstream.id)}
                        onChange={() => setSelectedWorkstreams((current) =>
                          current.includes(workstream.id)
                            ? current.filter((id) => id !== workstream.id)
                            : [...current, workstream.id]
                        )}
                      />
                      <span>{workstream.name}</span>
                    </label>
                  ))}
                </div>
                <div className={styles.sectionActions}>
                  <button type="button" onClick={() => setSelectedWorkstreams(sortedWorkstreams.map((ws) => ws.id))}>
                    All
                  </button>
                  <button type="button" onClick={() => setSelectedWorkstreams([])}>
                    None
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.filterSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => toggleFilterSection('initiatives')}
              aria-expanded={filtersExpanded.initiatives}
            >
              <span className={styles.sectionTitle}>Followed initiatives</span>
              <span className={styles.sectionBadge}>{followedInitiatives.length}</span>
              <span className={styles.toggleIcon}>{filtersExpanded.initiatives ? '−' : '+'}</span>
            </button>
            {filtersExpanded.initiatives && (
              <div className={styles.sectionContent}>
                <input
                  type="search"
                  className={styles.searchInput}
                  value={followedSearch}
                  onChange={(event) => setFollowedSearch(event.target.value)}
                  placeholder="Search…"
                />
                <div className={styles.checkboxList}>
                  {initiativesByWorkstream.length === 0 && <p className={styles.noResults}>No matches</p>}
                  {initiativesByWorkstream.map((group) => (
                    <div key={group.workstreamId || group.workstreamName} className={styles.checkboxGroup}>
                      <p className={styles.checkboxGroupLabel}>{group.workstreamName}</p>
                      {group.initiatives.map((initiative) => (
                        <label key={initiative.id} className={styles.checkboxItem}>
                          <input
                            type="checkbox"
                            checked={followedInitiatives.includes(initiative.id)}
                            onChange={() => setFollowedInitiatives((current) =>
                              current.includes(initiative.id)
                                ? current.filter((id) => id !== initiative.id)
                                : [...current, initiative.id]
                            )}
                          />
                          <span>{initiative.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <div className={styles.sectionActions}>
                  <button type="button" onClick={() => setFollowedInitiatives(sortedInitiatives.map((i) => i.id))}>
                    All
                  </button>
                  <button type="button" onClick={() => setFollowedInitiatives([])}>
                    None
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.filterSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => toggleFilterSection('eventTypes')}
              aria-expanded={filtersExpanded.eventTypes}
            >
              <span className={styles.sectionTitle}>Event types</span>
              <span className={styles.sectionBadge}>
                {selectedEventCategories.length === 0 ? 'All' : selectedEventCategories.length}
              </span>
              <span className={styles.toggleIcon}>{filtersExpanded.eventTypes ? '−' : '+'}</span>
            </button>
            {filtersExpanded.eventTypes && (
              <div className={styles.sectionContent}>
                <div className={styles.chipGrid}>
                  {eventCategories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      className={`${styles.filterChip} ${selectedEventCategories.includes(category.key) ? styles.filterChipActive : ''}`}
                      onClick={() => handleEventCategoryToggle(category.key)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                {selectedEventCategories.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearLink}
                    onClick={() => setSelectedEventCategories([])}
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.filterSection}>
            <button
              type="button"
              className={styles.sectionToggle}
              onClick={() => toggleFilterSection('metrics')}
              aria-expanded={filtersExpanded.metrics}
            >
              <span className={styles.sectionTitle}>Metrics</span>
              <span className={styles.sectionBadge}>{selectedMetrics.length}</span>
              <span className={styles.toggleIcon}>{filtersExpanded.metrics ? '−' : '+'}</span>
            </button>
            {filtersExpanded.metrics && (
              <div className={styles.sectionContent}>
                <div className={styles.metricList}>
                  {bundle?.metricCatalog?.map((definition) => {
                    const index = selectedMetrics.indexOf(definition.key);
                    const isActive = index !== -1;
                    const disableUp = !isActive || index === 0;
                    const disableDown = !isActive || index === selectedMetrics.length - 1;
                    return (
                      <div key={definition.key} className={`${styles.metricItem} ${isActive ? styles.metricItemActive : ''}`}>
                        <label className={styles.metricLabel}>
                          <input type="checkbox" checked={isActive} onChange={() => handleMetricToggle(definition.key)} />
                          <span>{definition.label}</span>
                        </label>
                        {isActive && (
                          <div className={styles.metricOrder}>
                            <button
                              type="button"
                              disabled={disableUp}
                              onClick={(e) => { e.stopPropagation(); handleMoveMetric(definition.key, 'up'); }}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={disableDown}
                              onClick={(e) => { e.stopPropagation(); handleMoveMetric(definition.key, 'down'); }}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={styles.preferenceActions}>
            <button type="button" className={styles.saveButton} onClick={handleSavePreferences} disabled={panelBusy}>
              Save preferences
            </button>
          </div>
        </div>
      </aside>
      <div className={styles.contentColumn}>
        <section className={styles.signalPanel}>
          <div className={styles.signalHeader}>
            <p className={styles.eyebrow}>Signals</p>
            <h1>What’s new</h1>
            <p className={styles.subtitle}>Impact, governance and execution updates across your streams.</p>
          </div>
          <div className={styles.timeframeSelector}>
            {timeframeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`${styles.timeframePill} ${option.key === timeframeKey ? styles.timeframePillActive : ''}`}
                onClick={() => setTimeframeKey(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {summary?.timeframe && (
            <>
              <p className={styles.timeframeMeta}>
                {summary.timeframe.label} · {dateTimeFormatter.format(new Date(summary.timeframe.start))}
              </p>
              {summary.timeframe.fallback && (
                <p className={styles.timeframeHint}>Fallback to rolling window while we collect more activity data.</p>
              )}
            </>
          )}
          {summary && (
            <section className={styles.metricPanel}>
              {selectedMetricDefinitions.map((definition) => {
                const metric = summary.metrics.find((entry) => entry.key === definition.key);
                if (!metric) {
                  return null;
                }
                const delta = formatDelta(metric);
                return (
                  <article key={definition.key} className={styles.metricCard}>
                    <p className={styles.metricTitle}>{definition.label}</p>
                    <p className={styles.metricValue}>{formatMetricValue(metric)}</p>
                    {delta && (
                      <p className={`${styles.metricDelta} ${delta.trend === 'up' ? styles.deltaUp : delta.trend === 'down' ? styles.deltaDown : ''}`}>
                        {delta.trend === 'up' && '▲'} {delta.trend === 'down' && '▼'} {delta.formatted}
                      </p>
                    )}
                  </article>
                );
              })}
            </section>
          )}
        </section>
        <section className={styles.logSection}>
          <header className={styles.sectionHeader}>
            <div>
              <h2>Initiative updates</h2>
              <p>Structural changes, ownership shifts and major plan edits across your selection.</p>
            </div>
            <div className={styles.updateActions}>
              <label>
                Group by
                <select value={updateGrouping} onChange={(event) => setUpdateGrouping(event.target.value as 'time' | 'initiative')}>
                  <option value="time">Time</option>
                  <option value="initiative">Initiative</option>
                </select>
              </label>
              <label>
                Sort
                <select value={updateSort} onChange={(event) => setUpdateSort(event.target.value as 'desc' | 'asc')}>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </label>
              <a className={styles.inlineLink} href="#/initiative-logs">
                View full history
              </a>
            </div>
          </header>
          {groupedUpdates.length === 0 ? (
            <p className={styles.emptyState}>No initiative changes in this window.</p>
          ) : (
            <div className={styles.logGroups}>
              {groupedUpdates.map((group) => {
                const isCollapsed = updateGroupCollapsed[group.title];
                return (
                  <div key={group.title}>
                    <button
                      type="button"
                      className={styles.groupHeaderButton}
                      onClick={() => toggleUpdateGroup(group.title)}
                      aria-expanded={!isCollapsed}
                    >
                      <span>{group.title}</span>
                      <span className={styles.groupHeaderIcon}>{isCollapsed ? '+' : '−'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className={styles.logList}>{group.entries.map((entry) => renderUpdateEntry(entry))}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className={styles.commentsSection}>
          <header className={styles.sectionHeader}>
            <div>
              <h2>Latest initiative comments</h2>
              <p>Threads and replies inside the initiatives you follow.</p>
            </div>
          </header>
          {comments && comments.entries.length === 0 ? (
            <p className={styles.emptyState}>No new comments for the tracked initiatives.</p>
          ) : (
            <div className={styles.commentList}>
              {comments?.entries?.map((entry) => (
                <article key={entry.id} className={styles.commentItem}>
                  <header>
                    <div>
                      <p className={styles.commentInitiative}>{entry.initiativeName}</p>
                      <p className={styles.commentMeta}>
                        {entry.workstreamName} · {stageName(entry.stageKey)} · {dateTimeFormatter.format(new Date(entry.createdAt))}
                      </p>
                    </div>
                  </header>
                  <p className={styles.commentBody}>{entry.body}</p>
                  <div className={styles.commentFooter}>
                    <span>{entry.authorName ?? 'System'}</span>
                    <button type="button" className={styles.commentActionButton} onClick={() => handleOpenCommentThread(entry)}>
                      Jump to comment
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};
