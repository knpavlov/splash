import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/InitiativeLogsScreen.module.css';
import { workstreamsApi } from '../workstreams/services/workstreamsApi';
import { initiativeLogsApi, InitiativeLogFilters, EventCategory, EventCategoryOption } from './services/initiativeLogsApi';
import { InitiativeLogEntry } from '../../shared/types/initiativeLog';
import { Workstream } from '../../shared/types/workstream';
import { initiativesApi } from '../initiatives/services/initiativesApi';
import { Initiative } from '../../shared/types/initiative';
import { useAuth } from '../auth/AuthContext';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const DEFAULT_AFTER = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

export const InitiativeLogsScreen = () => {
  const { session } = useAuth();
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [eventCategories, setEventCategories] = useState<EventCategoryOption[]>([]);
  const [entries, setEntries] = useState<InitiativeLogEntry[]>([]);
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);
  const [selectedInitiatives, setSelectedInitiatives] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>([]);
  const [after, setAfter] = useState<string | null>(DEFAULT_AFTER);
  const [before, setBefore] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(true);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workstreamsApi
      .list()
      .then((list) => {
        setWorkstreams(list);
        setSelectedWorkstreams(list.map((item) => item.id));
      })
      .catch((err) => console.error('Failed to load workstreams', err));
    initiativesApi
      .list()
      .then((list) => setInitiatives(list))
      .catch((err) => console.error('Failed to load initiatives', err));
    initiativeLogsApi
      .getCategories()
      .then((list) => setEventCategories(list))
      .catch((err) => console.error('Failed to load event categories', err));
  }, []);

  const filters = useMemo<InitiativeLogFilters>(
    () => ({
      limit: 300,
      after: after || undefined,
      before: before || undefined,
      workstreamIds: selectedWorkstreams.length ? selectedWorkstreams : undefined,
      initiativeIds: selectedInitiatives.length ? selectedInitiatives : undefined,
      eventCategories: selectedCategories.length ? selectedCategories : undefined
    }),
    [after, before, selectedWorkstreams, selectedInitiatives, selectedCategories]
  );

  const toggleCategory = (key: EventCategory) => {
    setSelectedCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const loadEntries = () => {
    if (!session?.accountId) {
      return;
    }
    setLoading(true);
    initiativeLogsApi
      .list(session.accountId, filters)
      .then((list) => {
        setEntries(list);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load initiative history:', err);
        setError('Unable to load initiative history.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, session?.accountId]);

  const toggleWorkstream = (id: string) => {
    setSelectedWorkstreams((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleInitiative = (id: string) => {
    setSelectedInitiatives((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const markVisibleAsRead = () => {
    if (!session?.accountId) {
      return;
    }
    const visibleIds = entries.filter((entry) => showRead || !entry.read).map((entry) => entry.id);
    if (!visibleIds.length) {
      return;
    }
    setMarking(true);
    initiativeLogsApi
      .markAsRead(session.accountId, visibleIds)
      .then(() => loadEntries())
      .catch((err) => {
        console.error('Failed to mark entries as read:', err);
        setError('Unable to mark entries as read.');
      })
      .finally(() => setMarking(false));
  };

  const filteredEntries = entries.filter((entry) => (showRead ? true : !entry.read));

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Initiative history</h1>
          <p>Unified audit log for every initiative: financial changes, ownership updates, stage movements and more.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => setSelectedWorkstreams(workstreams.map((ws) => ws.id))}>
            Select all streams
          </button>
          <button type="button" onClick={() => setSelectedWorkstreams([])}>
            Clear streams
          </button>
          <button type="button" onClick={loadEntries} disabled={loading}>
            Refresh
          </button>
          <button type="button" onClick={markVisibleAsRead} disabled={marking || loading}>
            Mark all as read
          </button>
          <button type="button" onClick={() => setShowRead((prev) => !prev)}>
            {showRead ? 'Hide read entries' : 'Show read entries'}
          </button>
        </div>
      </header>

      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="workstreams">Workstreams</label>
          <select
            id="workstreams"
            multiple
            value={selectedWorkstreams}
            onChange={(event) =>
              setSelectedWorkstreams(Array.from(event.target.selectedOptions, (option) => option.value))
            }
          >
            {workstreams.map((workstream) => (
              <option key={workstream.id} value={workstream.id}>
                {workstream.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="initiatives">Initiatives</label>
          <select
            id="initiatives"
            multiple
            value={selectedInitiatives}
            onChange={(event) =>
              setSelectedInitiatives(Array.from(event.target.selectedOptions, (option) => option.value))
            }
          >
            {initiatives.map((initiative) => (
              <option key={initiative.id} value={initiative.id}>
                {initiative.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>From</label>
          <input type="date" value={after ?? ''} onChange={(event) => setAfter(event.target.value || null)} />
        </div>
        <div className={styles.filterGroup}>
          <label>To</label>
          <input type="date" value={before ?? ''} onChange={(event) => setBefore(event.target.value || null)} />
        </div>
        <div className={`${styles.filterGroup} ${styles.filterGroupWide}`}>
          <label>Event types</label>
          <div className={styles.categoryChips}>
            {eventCategories.map((category) => (
              <button
                key={category.key}
                type="button"
                className={`${styles.categoryChip} ${selectedCategories.includes(category.key) ? styles.categoryChipActive : ''}`}
                onClick={() => toggleCategory(category.key)}
              >
                {category.label}
              </button>
            ))}
            {selectedCategories.length > 0 && (
              <button
                type="button"
                className={styles.clearChips}
                onClick={() => setSelectedCategories([])}
              >
                Clear
              </button>
            )}
          </div>
          <p className={styles.filterHint}>
            {selectedCategories.length === 0 ? 'Showing all event types' : `Filtering by ${selectedCategories.length} type(s)`}
          </p>
        </div>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.timeline}>
        {loading && <p>Loading…</p>}
        {!loading && filteredEntries.length === 0 && <p>No entries match your filters.</p>}
        {!loading &&
          filteredEntries.map((entry) => (
            <article key={entry.id} className={`${styles.entry} ${entry.read ? styles.read : ''}`}>
              <header>
                <div>
                  <p className={styles.entryTitle}>{entry.initiativeName}</p>
                  <p className={styles.entryMeta}>
                    {entry.workstreamName} · {formatDateTime(entry.createdAt)} · {entry.actorName ?? 'System'}
                  </p>
                </div>
                {!entry.read && <span className={styles.badge}>New</span>}
              </header>
              <div className={styles.entryBody}>
                <strong>{entry.eventType}</strong>
                <dl>
                  <dt>Field</dt>
                  <dd>{entry.field}</dd>
                  {entry.previousValue !== undefined && (
                    <>
                      <dt>Previous</dt>
                      <dd>{JSON.stringify(entry.previousValue)}</dd>
                    </>
                  )}
                  {entry.nextValue !== undefined && (
                    <>
                      <dt>Next</dt>
                      <dd>{JSON.stringify(entry.nextValue)}</dd>
                    </>
                  )}
                </dl>
              </div>
            </article>
          ))}
      </section>
    </section>
  );
};
