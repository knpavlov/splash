import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/InitiativeLogsScreen.module.css';
import { workstreamsApi } from '../workstreams/services/workstreamsApi';
import { initiativeLogsApi, InitiativeLogFilters } from './services/initiativeLogsApi';
import { InitiativeLogEntry } from '../../shared/types/initiativeLog';
import { Workstream } from '../../shared/types/workstream';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const useWorkstreams = () => {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  useEffect(() => {
    workstreamsApi
      .list()
      .then(setWorkstreams)
      .catch((error) => console.error('Failed to load workstreams', error));
  }, []);
  return workstreams;
};

export const InitiativeLogsScreen = () => {
  const workstreams = useWorkstreams();
  const [entries, setEntries] = useState<InitiativeLogEntry[]>([]);
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<InitiativeLogFilters>(
    () => ({
      limit: 200,
      workstreamIds: selectedWorkstreams.length ? selectedWorkstreams : undefined,
      before: before ?? undefined,
      after: after ?? undefined
    }),
    [selectedWorkstreams, before, after]
  );

  const loadEntries = () => {
    setLoading(true);
    initiativeLogsApi
      .list(filters)
      .then((list) => {
        setEntries(list);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load initiative logs:', err);
        setError('Unable to load initiative history.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const toggleWorkstream = (id: string) => {
    setSelectedWorkstreams((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const markVisibleAsRead = () => {
    const unreadIds = entries.filter((entry) => !entry.read).map((entry) => entry.id);
    if (!unreadIds.length) {
      return;
    }
    setMarking(true);
    initiativeLogsApi
      .markAsRead(unreadIds)
      .then(() => loadEntries())
      .catch((err) => {
        console.error('Failed to mark logs as read:', err);
        setError('Unable to mark entries as read.');
      })
      .finally(() => setMarking(false));
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Initiative history</h1>
          <p>Track every key change across all initiatives and filter by workstream or date.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={loadEntries} disabled={loading}>
            Refresh
          </button>
          <button type="button" onClick={markVisibleAsRead} disabled={marking || loading}>
            Mark visible as read
          </button>
        </div>
      </header>
      <section className={styles.filters}>
        <div>
          <label>Workstreams</label>
          <div className={styles.workstreamList}>
            {workstreams.map((workstream) => (
              <label key={workstream.id}>
                <input
                  type="checkbox"
                  checked={selectedWorkstreams.includes(workstream.id)}
                  onChange={() => toggleWorkstream(workstream.id)}
                />
                {workstream.name}
              </label>
            ))}
          </div>
        </div>
        <div className={styles.dateFilters}>
          <label>
            After
            <input type="date" value={after ?? ''} onChange={(event) => setAfter(event.target.value || null)} />
          </label>
          <label>
            Before
            <input type="date" value={before ?? ''} onChange={(event) => setBefore(event.target.value || null)} />
          </label>
        </div>
      </section>
      {error && <p className={styles.error}>{error}</p>}
      <section className={styles.timeline}>
        {loading && <p>Loading...</p>}
        {!loading && entries.length === 0 && <p>No events match your filters.</p>}
        {!loading &&
          entries.map((entry) => (
            <article key={entry.id} className={`${styles.entry} ${entry.read ? styles.read : ''}`}>
              <header>
                <div>
                  <p className={styles.entryTitle}>{entry.initiativeName}</p>
                  <p className={styles.entryMeta}>
                    {entry.workstreamName} · {formatDate(entry.createdAt)} · {entry.actorName ?? 'System'}
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
