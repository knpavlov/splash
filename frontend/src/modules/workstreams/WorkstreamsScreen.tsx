import { useEffect, useMemo, useState } from 'react';
import styles from '../../styles/WorkstreamsScreen.module.css';
import { Workstream, WorkstreamGateKey } from '../../shared/types/workstream';
import { WorkstreamCard } from './components/WorkstreamCard';
import { WorkstreamModal } from './components/WorkstreamModal';

type Banner = { type: 'info' | 'error'; text: string } | null;

const STORAGE_KEY = 'r2.workstreams';

const gateKeys: WorkstreamGateKey[] = ['l1', 'l2', 'l3', 'l4', 'l5'];

const normalizeStoredWorkstreams = (items: Workstream[]): Workstream[] =>
  items.map((item) => ({
    ...item,
    gates: gateKeys.reduce<Workstream['gates']>((acc, key) => {
      const rounds = item.gates?.[key];
      acc[key] = Array.isArray(rounds) ? rounds : [];
      return acc;
    }, {} as Workstream['gates'])
  }));

const parseStoredWorkstreams = (): Workstream[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Workstream[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeStoredWorkstreams(parsed);
  } catch (error) {
    console.error('Failed to parse stored workstreams:', error);
    return [];
  }
};

export const WorkstreamsScreen = () => {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [modalBanner, setModalBanner] = useState<Banner>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalWorkstream, setModalWorkstream] = useState<Workstream | null>(null);

  useEffect(() => {
    const stored = parseStoredWorkstreams();
    setWorkstreams(stored);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workstreams));
    } catch (error) {
      console.error('Failed to persist workstreams:', error);
    }
  }, [workstreams, isReady]);

  const sortedWorkstreams = useMemo(
    () =>
      [...workstreams].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [workstreams]
  );

  const openCreateModal = () => {
    setModalWorkstream(null);
    setModalBanner(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalWorkstream(null);
    setModalBanner(null);
  };

  const upsertWorkstream = (workstream: Workstream, expectedVersion: number | null) => {
    const now = new Date().toISOString();

    if (expectedVersion === null) {
      const created: Workstream = {
        ...workstream,
        createdAt: now,
        updatedAt: now,
        version: 1
      };
      setWorkstreams((prev) => [...prev, created]);
      return created;
    }

    const existingIndex = workstreams.findIndex((item) => item.id === workstream.id);

    if (existingIndex === -1) {
      throw new Error('not-found');
    }

    const current = workstreams[existingIndex];
    if (current.version !== expectedVersion) {
      throw new Error('version-conflict');
    }

    const updated: Workstream = {
      ...workstream,
      createdAt: current.createdAt,
      updatedAt: now,
      version: current.version + 1
    };

    setWorkstreams((prev) => {
      const next = [...prev];
      next[existingIndex] = updated;
      return next;
    });

    return updated;
  };

  const handleSave = async (
    workstream: Workstream,
    options: { closeAfterSave: boolean; expectedVersion: number | null }
  ) => {
    setModalBanner(null);

    if (!workstream.name.trim()) {
      setModalBanner({ type: 'error', text: 'Workstream name is required.' });
      return;
    }

    try {
      const result = upsertWorkstream(
        { ...workstream, name: workstream.name.trim(), description: workstream.description.trim() },
        options.expectedVersion
      );

      setBanner({ type: 'info', text: 'Workstream saved.' });

      if (options.closeAfterSave) {
        closeModal();
      } else {
        setModalWorkstream(result);
        setModalBanner({ type: 'info', text: 'Changes saved.' });
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'version-conflict') {
        setModalBanner({
          type: 'error',
          text: 'Could not save: the workstream was updated elsewhere. Refresh the list and try again.'
        });
      } else if (error instanceof Error && error.message === 'not-found') {
        setModalBanner({
          type: 'error',
          text: 'Workstream not found. Close the modal and try again.'
        });
      } else {
        setModalBanner({
          type: 'error',
          text: 'Failed to save workstream. Please retry.'
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this workstream permanently?');
    if (!confirmed) {
      return;
    }
    setWorkstreams((prev) => prev.filter((item) => item.id !== id));
    setBanner({ type: 'info', text: 'Workstream deleted.' });
    closeModal();
  };

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Workstreams</h1>
          <p className={styles.subtitle}>
            Configure approval flows for each gate and assign placeholder roles.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={openCreateModal}>
          Create new workstream
        </button>
      </header>

      {banner && (
        <div className={banner.type === 'info' ? styles.infoBanner : styles.errorBanner}>{banner.text}</div>
      )}

      <div className={styles.cardsGrid}>
        {sortedWorkstreams.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No workstreams yet</h2>
            <p>Use the “Create new workstream” button to add the first one.</p>
          </div>
        ) : (
          sortedWorkstreams.map((workstream) => (
            <WorkstreamCard
              key={workstream.id}
              workstream={workstream}
              onOpen={() => {
                setModalWorkstream(workstream);
                setModalBanner(null);
                setIsModalOpen(true);
              }}
            />
          ))
        )}
      </div>

      {isModalOpen && (
        <WorkstreamModal
          initialWorkstream={modalWorkstream}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          feedback={modalBanner}
          onFeedbackClear={() => setModalBanner(null)}
        />
      )}
    </section>
  );
};
